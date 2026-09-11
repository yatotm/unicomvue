import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const REPO_ROOT = join(import.meta.dirname, "..");

function readSource(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function collectVueFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectVueFiles(path);
    return entry.isFile() && entry.name.endsWith(".vue") ? [path] : [];
  });
}

// Recursive so a component tucked into a new folder cannot escape the contract.
function readVueSources() {
  return collectVueFiles(join(REPO_ROOT, "src"))
    .map((path) => [relative(REPO_ROOT, path), readFileSync(path, "utf8")]);
}

// base.css declares light values on `:root` and overrides them in the `.dark` block.
function parseCustomProperties(css, selector) {
  const open = css.indexOf("{", css.indexOf(selector));
  const body = css.slice(open + 1, css.indexOf("\n}", open));
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function resolveToken(scope, name) {
  let value = scope.get(name);
  for (let hops = 0; value?.startsWith("var(") && hops < 8; hops += 1) {
    value = scope.get(value.slice(4, -1).trim());
  }
  assert.ok(value, `${name} is undefined`);
  return value;
}

function parseColor(value) {
  const hex = value.match(/^#([\da-f]{6})$/i);
  if (hex) {
    const int = Number.parseInt(hex[1], 16);
    return { rgb: [int >> 16 & 255, int >> 8 & 255, int & 255], alpha: 1 };
  }

  const rgb = value.match(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)\s*\)$/);
  assert.ok(rgb, `unsupported color: ${value}`);
  return { rgb: rgb.slice(1, 4).map(Number), alpha: Number(rgb[4]) };
}

function composite(top, base) {
  return top.rgb.map((channel, index) => channel * top.alpha + base.rgb[index] * (1 - top.alpha));
}

function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((first, second) => second - first);
  return (lighter + 0.05) / (darker + 0.05);
}

// 对比度比值在近白和近黑两端的感知含义不一样，而「两块贴在一起的面看不看得出分界」是一个
// 感知问题，所以相邻表面的规则用 CIE L*a*b* 的 ΔE 来量：它对浅色深色一视同仁，而且带上了
// 色相——一枚珊瑚色的 chip 铺在米色上，亮度只差一点，但它确实分得开。
function toLab(rgb) {
  const linear = rgb.map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  const [x, y, z] = [
    (0.4124 * linear[0] + 0.3576 * linear[1] + 0.1805 * linear[2]) / 0.95047,
    0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2],
    (0.0193 * linear[0] + 0.1192 * linear[1] + 0.9505 * linear[2]) / 1.08883,
  ].map((value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE(first, second) {
  const [l1, a1, b1] = toLab(first);
  const [l2, a2, b2] = toLab(second);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const BASE_CSS = readSource("src/assets/base.css");
const MAIN_CSS = readSource("src/assets/main.css");
// 收敛层的配方（焦点环、按钮变体、行、图标钮）。它是 .vue 之外唯一允许出现工具类名的地方，
// 所以每一条「闭集」规则都必须把它一起扫进去，否则把类名搬进 .js 就能绕开全部三条规则。
const UI_RECIPES = readSource("src/utils/ui.js");
const LIGHT = parseCustomProperties(BASE_CSS, ":root {");
const DARK = new Map([...LIGHT, ...parseCustomProperties(BASE_CSS, ".dark,")]);
const THEMES = [["light", LIGHT], ["dark", DARK]];

// Surfaces any text can sit on. 画布和顶栏都不在其中，而且这是**被断言的**：见
// 「no text is painted on the shell chrome」——三级 1.20× 的表面梯子把画布压到了
// AA 之下，所以规则不是「让画布也过 AA」，而是「谁都不许把字写在外壳上」。
// 侧栏是外壳里唯一的例外，也正因为如此它是**厚**的那一层：它整条都在承载文字
// （产品名、四个导航项、隐私声明），所以两端都必须过 AA。
//
// 收敛之后表面只剩两块：卡片（`--ui-surface-raised`，浮层也是它）和 chip / 轨道 /
// 输入框那一档 sunken。旧的「托盘色」`--ui-surface` 已经从 base.css 删除——卡片内部
// 不再有嵌套卡片，那一档就没有了工作，留着只会让下一轮补丁拿它再造一层。
const TEXT_SURFACES = [
  "--ui-surface-raised",
  "--ui-surface-sunken",
];

// 外壳家族：画布 ＋ 铺在它上面的两层纸色 veil。顺序即厚度。
const SHELL_VEILS = [["rail", "--ui-rail"], ["topbar", "--ui-topbar"]];

// The ordinal 到期 scale, nearest first.
const EXPIRY_SCALE = ["--ui-expiry-1", "--ui-expiry-2", "--ui-expiry-3"];

// 分类色板：资源种类（流量 / 语音 / 短信），固定顺序，永不轮换。
const SERIES_SCALE = ["--ui-series-1", "--ui-series-2", "--ui-series-3"];

// A colour is either a token name or an already-composited rgb triple.
function colorOf(scope, value) {
  return Array.isArray(value) ? value : parseColor(resolveToken(scope, value)).rgb;
}

function measure(scope, foreground, surface, overlayToken) {
  const base = colorOf(scope, surface);
  const background = overlayToken
    ? composite(parseColor(resolveToken(scope, overlayToken)), { rgb: base })
    : base;
  return contrastRatio(colorOf(scope, foreground), background);
}

function luminance(scope, token) {
  return relativeLuminance(colorOf(scope, token));
}

// 画布不是一块死色：两道 wash 铺在它上面，所以它沿着视口在变。相邻表面的规则必须在
// **最糟的那一点**上成立，而不是在 token 的字面值上——上一轮正是栽在这里：卡片和画布的
// token 差 1.07×，但暖 wash 把画布抬到了卡片之上，实测卡片上边缘只剩 1.001×，等于没有边。
// 两道 wash 的四种组合都算一遍，取最亮和最暗的两端；这是保守的上界（径向渐变的圆心
// 还在视口外，屏幕上永远到不了满强度）。
function canvasRange(scope) {
  const base = colorOf(scope, "--ui-background");
  const [warm, deep] = ["--ui-canvas-warm", "--ui-canvas-deep"]
    .map((token) => parseColor(resolveToken(scope, token)));
  const overDeep = composite(deep, { rgb: base });
  const points = [base, composite(warm, { rgb: base }), overDeep, composite(warm, { rgb: overDeep })]
    .sort((first, second) => relativeLuminance(first) - relativeLuminance(second));
  return { darkest: points[0], lightest: points.at(-1) };
}

// 外壳的每一层 veil 都是半透明的：它真正的颜色是「veil 铺在画布上」的合成结果，
// 而画布两端不一样，所以它也有两端。侧栏和顶栏走同一个函数——它们是同一层纸色的两个厚度。
function shellRange(scope, token) {
  const tint = parseColor(resolveToken(scope, token));
  const canvas = canvasRange(scope);
  return {
    lightest: composite(tint, { rgb: canvas.lightest }),
    darkest: composite(tint, { rgb: canvas.darkest }),
  };
}

const railRange = (scope) => shellRange(scope, "--ui-rail");

// 侧栏那两端是合成出来的：半透明的 rail tint 铺在会变的画布上，所以它是**两块**表面，
// 两端都得过。旧契约只量 token，量不到这块真正承载了产品名、四个导航项和隐私声明的面。
// 顶栏**不**在这张表里：它是外壳，不是文字表面（下面有一条结构性的断言钉死这件事）。
function textSurfaces(scope) {
  const rail = railRange(scope);
  return [
    ...TEXT_SURFACES.map((token) => [token, token]),
    ["rail(lightest)", rail.lightest],
    ["rail(darkest)", rail.darkest],
  ];
}

// `--ui-on-warning-container` 是这一轮新加进来量的：降级提示（「数字对不上」那两句）是画在
// **卡片**上的正文，不是画在琥珀色容器里的，旧契约只量了它在容器上的那一种用法。
test("body and accent text clear AA on every surface, at rest and under the hover layer", () => {
  for (const [theme, scope] of THEMES) {
    for (const ink of [
      "--ui-on-surface",
      "--ui-on-surface-variant",
      "--ui-primary-ink",
      "--ui-danger-ink",
      "--ui-on-warning-container",
    ]) {
      for (const [name, surface] of textSurfaces(scope)) {
        const rest = measure(scope, ink, surface);
        const hover = measure(scope, ink, surface, "--ui-hover-overlay");
        assert.ok(rest >= AA_TEXT, `${theme} ${ink} on ${name} is ${rest.toFixed(2)}:1 at rest`);
        assert.ok(hover >= AA_TEXT, `${theme} ${ink} on ${name} is ${hover.toFixed(2)}:1 under hover`);
      }
    }
  }
});

// 12px labels are the densest text in the panel, so the muted step was darkened until it
// clears AA on every resting surface rather than only on the card.
test("the muted label colour clears AA at 12px on every resting surface", () => {
  for (const [theme, scope] of THEMES) {
    for (const [name, surface] of textSurfaces(scope)) {
      const ratio = measure(scope, "--ui-on-surface-muted", surface);
      assert.ok(ratio >= AA_TEXT, `${theme} muted on ${name} is ${ratio.toFixed(2)}:1`);
    }
  }
});

// 上一条只量了「静止」，而文档一直声称 12px 墨在 **hover 覆盖层之下**也过 AA。它没有被量过，
// 于是深色主题里它实测只有 4.49:1——文档说的是真的应该成立的事，代码里不成立。补量的位置
// 精确到「真的会画 hover 覆盖层的那几块面」：卡片、区域、侧栏。修法是把深色的覆盖层从 .09
// 收到 .06（hover 仍有 1.17× / ΔE 4.6），而不是动那三档墨——墨是闭集，动它就得动分档。
test("12px muted ink still clears AA under the hover layer on every hoverable surface", () => {
  for (const [theme, scope] of THEMES) {
    for (const [name, surface] of [
      ["--ui-surface-raised", "--ui-surface-raised"],
      ["--ui-surface-sunken", "--ui-surface-sunken"],
      ["rail(worst)", railRange(scope).lightest],
    ]) {
      const ratio = measure(scope, "--ui-on-surface-muted", surface, "--ui-hover-overlay");
      assert.ok(ratio >= AA_TEXT, `${theme} muted on a hovered ${name} is ${ratio.toFixed(2)}:1`);
    }
  }
});

// 画布被排除在文字表面之外，代价是它必须**真的**没有文字：三级 1.20× 的梯子把画布
// 压到了 12px 墨的 AA 之下（浅色实测 4.25:1），所以规则是「谁都不许把字写在画布上」，
// 而不是「把画布抬回来」——抬回来卡片的上边缘就又没了。
// 顶栏现在也归这一档，理由是两条叠起来的：结构上它是外壳、本来就不印页面标题（§0.1）；
// 数值上它是**薄**的那一层 veil（控件要能站在它上面，所以它必须留在纸色下面 1.20×），
// 薄到 12px 墨在它最暗的一端静止只有 4.67:1、一落进 hover 覆盖层就掉到 4.15:1——
// 「可 hover 的小字」在这块面上不成立。所以它和画布一样：只放控件，不放文字。
test("no text is painted on the shell chrome: the canvas and the top bar carry controls only", () => {
  for (const [path, source] of readVueSources()) {
    const template = source.slice(0, source.indexOf("<script"));
    for (const [match] of template.matchAll(/class="[^"]*\bbg-background\b[^"]*"/g)) {
      assert.doesNotMatch(match, /\btext-(?:on-surface|primary-ink|danger-ink|warning-ink)/,
        `${path} paints text straight onto the canvas: ${match}`);
    }
  }

  // 顶栏那一段模板（下拉面板之前的部分，也就是真正站在外壳面上的那一段）里不许出现任何
  // 墨色类：三个控件的颜色全部来自它们各自带着自己表面的 class 常量。
  const bar = readSource("src/components/AppTopBar.vue");
  const barTemplate = bar.slice(0, bar.indexOf("<script"));
  const onTheShell = barTemplate.slice(0, barTemplate.indexOf('v-if="menuOpen"'));
  assert.doesNotMatch(
    onTheShell,
    /\btext-(?:on-surface|on-surface-variant|on-surface-muted|primary-ink|danger-ink|warning-ink)\b/,
    "the top bar's shell surface must carry controls, not bare text",
  );
  // 而每一个站在外壳上的控件都必须自带一块面，否则它就是「写在画布上的字」换了个形状。
  // 按钮的定义已经收敛到 utils/ui.js 的一份变体表里，所以这里量的是那一份，不是顶栏里
  // 各自抄一遍的常量——顶栏模板只许说出自己用了哪个变体。
  assert.match(UI_RECIPES, /filled:\s*`[^`]*\bbg-primary\b[^`]*`/, "主按钮 must bring its own surface onto the shell");
  assert.match(UI_RECIPES, /shell:\s*`[^`]*\bbg-surface-raised\b[^`]*`/, "外壳上的次按钮 must bring its own surface");
  for (const variant of ['variant="filled"', 'variant="shell"']) {
    assert.ok(barTemplate.includes(variant), `the top bar must name ${variant} instead of hand-rolling one`);
  }

  // 焦点环落在控件周围，而侧栏的导航项就站在画布上（顶栏的按钮站在外壳面上），所以焦点色
  // 必须在画布的**两端**都过 3:1。
  for (const [theme, scope] of THEMES) {
    const canvas = canvasRange(scope);
    for (const [name, point] of [["lightest", canvas.lightest], ["darkest", canvas.darkest]]) {
      const ratio = measure(scope, "--ui-focus", point);
      assert.ok(ratio >= AA_NON_TEXT, `${theme} focus ring on the ${name} canvas is ${ratio.toFixed(2)}:1`);
    }
    for (const [name, token] of SHELL_VEILS) {
      const veil = shellRange(scope, token);
      for (const end of ["lightest", "darkest"]) {
        const ratio = measure(scope, "--ui-focus", veil[end]);
        assert.ok(ratio >= AA_NON_TEXT, `${theme} focus ring on the ${end} ${name} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("filled and container pairs keep their documented AA ratios", () => {
  for (const [theme, scope] of THEMES) {
    for (const [foreground, background] of [
      ["--ui-on-primary", "--ui-primary"],
      ["--ui-on-primary", "--ui-primary-hover"],
      ["--ui-on-primary", "--ui-primary-pressed"],
      ["--ui-on-primary-container", "--ui-primary-container"],
      ["--ui-on-danger-container", "--ui-danger-container"],
      ["--ui-on-warning-container", "--ui-warning-container"],
    ]) {
      const ratio = measure(scope, foreground, background);
      assert.ok(ratio >= AA_TEXT, `${theme} ${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
    }

    for (const [graphic, background] of [
      ["--ui-focus", "--ui-background"],
      ["--ui-focus", "--ui-surface-raised"],
      ["--ui-outline", "--ui-surface-raised"],
      ["--ui-outline", "--ui-surface-sunken"],
      ["--ui-primary", "--ui-surface-sunken"],
      ["--ui-warning-ink", "--ui-warning-container"],
    ]) {
      const ratio = measure(scope, graphic, background);
      assert.ok(ratio >= AA_NON_TEXT, `${theme} ${graphic} on ${background} is ${ratio.toFixed(2)}:1`);
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 表面模型收敛之后只剩两块面，加一层浮层用的同色：
//   画布  —— 外壳站的地方，没有文字；
//   卡片  —— `--ui-surface-raised`，一页只有一张，浮层（菜单 / Toast / 对话框）用同一档；
//   sunken —— 卡片**里面**的行内填充：chip、进度轨道、输入框、分段控件的轨道。
// 中间那一档「托盘色」被删掉了，因为卡片内部不再有嵌套卡片，它没有工作了。
// 这条测试同时钉死删除本身：token 不许再出现，否则下一轮补丁会拿它再造一层。
test("the surface model is two tones and a fill, and the old tray tone is gone", () => {
  assert.doesNotMatch(BASE_CSS, /--ui-surface\s*:/, "--ui-surface must be deleted, not merely unused");
  assert.doesNotMatch(MAIN_CSS, /--color-surface\s*:/, "and its Tailwind alias with it");
  for (const [path, source] of readVueSources()) {
    assert.doesNotMatch(source, /\bbg-surface(?![\w-])/, `${path} still paints the deleted tray tone`);
  }
  assert.doesNotMatch(UI_RECIPES, /\bbg-surface(?![\w-])/, "the recipe layer still paints the deleted tray tone");

  for (const [theme, scope] of THEMES) {
    const card = luminance(scope, "--ui-surface-raised");
    const canvas = canvasRange(scope);

    // 卡片必须在画布的**两端**都站得住，而且站在同一侧——这正是旧托盘色栽的地方：
    // 它和画布只差 1.001×，暖 wash 一抬就把卡片的上边缘吃掉了。
    for (const [name, point] of [["lightest", canvas.lightest], ["darkest", canvas.darkest]]) {
      const step = (Math.max(card, relativeLuminance(point)) + 0.05)
        / (Math.min(card, relativeLuminance(point)) + 0.05);
      assert.ok(step >= 1.08, `${theme} the card only steps ${step.toFixed(3)}× off the ${name} canvas`);
    }

    // sunken 是唯一还留在卡片里的填充，它必须真的读成「凹下去的一块」。
    const sunken = luminance(scope, "--ui-surface-sunken");
    const fill = (Math.max(card, sunken) + 0.05) / (Math.min(card, sunken) + 0.05);
    assert.ok(fill >= 1.2, `${theme} the sunken fill only steps ${fill.toFixed(3)}× off the card`);

    assert.notEqual(resolveToken(scope, "--ui-surface-raised"), "#ffffff", `${theme} the card must be tinted`);
    for (const token of ["--ui-background", "--ui-surface-raised", "--ui-surface-sunken"]) {
      const [red, , blue] = parseColor(resolveToken(scope, token)).rgb;
      assert.ok(red > blue, `${theme} ${token} must be warm-tinted, not a neutral grey`);
    }

    // 分隔线现在是卡片内部**唯一**的结构性分界，所以它必须真的分得出来。1px 的发丝线不适用
    // 图形的 3:1（那会画出一条黑杠，Material 自己的 divider 也在 1.3–1.6× 一带），量的是
    // 感知色差：ΔE ≥ 8 在两个主题里都成立，而且它比「有没有这条声明」严得多。
    const delta = deltaE(colorOf(scope, "--ui-divider"), colorOf(scope, "--ui-surface-raised"));
    assert.ok(delta >= 8, `${theme} the divider is only ΔE ${delta.toFixed(1)} off the card it separates`);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 相邻表面的最小步进。这是这一轮的核心规则，理由是实测出来的：
// 「侧栏里选中项发闷」「卡片的上边缘化进了背景」不是两处走查漏掉的地方，而是同一条
// 规则缺失的两个症状——画布带了两道 wash 之后它沿着视口在变，于是任何「按 token 值
// 平均起来成立」的步进，都会在 wash 把画布推到卡片色附近的那一带失效。实测（1280×900，
// 浅色）：画布 vs 卡片最差 1.001×、侧栏 vs 选中项 1.051×，也就是压根没有边界。
//
// 阈值 1.20× / ΔE 6：ΔE*ab≈6 差不多是两块大面积色在一台没校准的笔记本屏上、偏着头看
// 仍然分得出的一步（ΔE 2–3 只在正视、并排、盯着看时才成立），换算到这套梯子的两端
// 正好落在 1.20× 附近，所以两把尺子一起钉。带色相的一对（chip、遮罩）只钉 ΔE，
// 因为它们靠色相分开，亮度本来就可以接近。
const SURFACE_PAIRS = [
  // [名字, 取色 a, 取色 b, 最小比值, 最小 ΔE]
  // 卡片对画布的分界只有一种机制（阴影），但明度上仍然必须真的走开一步——旧的托盘色
  // 在这一对上是 1.001×，也就是压根没有边。现在两端都实测过，门槛写成实数。
  ["画布(最糟点) / 页面卡片", (s) => canvasRange(s).lightest, "--ui-surface-raised", 1.08, 3.5],
  ["画布(最暗点) / 页面卡片", (s) => canvasRange(s).darkest, "--ui-surface-raised", 1.08, 3.5],
  ["页面卡片 / chip・轨道・输入框", "--ui-surface-raised", "--ui-surface-sunken", 1.2, 6],
  ["画布(最糟点) / 侧栏", (s) => canvasRange(s).lightest, (s) => railRange(s).lightest, 1.0, 0],
  ["画布(最暗点) / 侧栏", (s) => canvasRange(s).darkest, (s) => railRange(s).darkest, 1.0, 0],
  ["画布(最糟点) / 顶栏", (s) => canvasRange(s).lightest, (s) => shellRange(s, "--ui-topbar").lightest, 1.0, 0],
  ["画布(最暗点) / 顶栏", (s) => canvasRange(s).darkest, (s) => shellRange(s, "--ui-topbar").darkest, 1.0, 0],
  ["侧栏(最糟点) / 当前导航项", (s) => railRange(s).lightest, "--ui-surface-raised", 1.03, 1.2],
  ["顶栏(最糟点) / 栏上的按钮", (s) => shellRange(s, "--ui-topbar").lightest, "--ui-surface-raised", 1.03, 1.2],
  ["画布(最糟点) / 底部标签栏", (s) => canvasRange(s).lightest, "--ui-surface-raised", 1.08, 3.5],
  ["页面卡片 / hover 覆盖层", "--ui-surface-raised", (s) => hovered(s, "--ui-surface-raised"), 1.05, 2.5],
  ["侧栏 / hover 覆盖层", (s) => railRange(s).lightest, (s) => hovered(s, railRange(s).lightest), 1.05, 2.5],
  ["顶栏 / hover 覆盖层", (s) => shellRange(s, "--ui-topbar").lightest, (s) => hovered(s, shellRange(s, "--ui-topbar").lightest), 1.05, 2.5],
  // 三枚徽章现在全部画在同一块面上（卡片），因为卡片里没有第二块面了。
  ["页面卡片 / 状态徽章", "--ui-surface-raised", "--ui-primary-container", 1, 6],
  ["页面卡片 / 限速徽章", "--ui-surface-raised", "--ui-danger-container", 1, 6],
  ["页面卡片 / 推断徽章", "--ui-surface-raised", "--ui-warning-container", 1, 6],
  // 骨架屏是加载态里唯一的图形。它旧值和 chip 共用一个 token，于是在托盘上只剩 1.109×
  // （浅）、在区域里只剩 1.151×（深）：没人报，但「看不见的那一块」正是同一个病。
  ["页面卡片 / 骨架块", "--ui-surface-raised", "--ui-skeleton", 1.2, 6],
  ["对话框 / 被遮住的页面", "--ui-surface-raised", (s) => scrimmed(s), 1.5, 12],
  ["页面 / 它自己的遮罩", "--ui-surface-raised", (s) => scrimmed(s), 1.5, 12],
];

// ──────────────────────────────────────────────────────────────────────────────
// 外壳同侪（§2.1.3）。ΔE ≥ 6 存在的理由是「图和底得分得开」；两块**本来就是一家人**的外壳
// 面不是图和底，对它们套 ≥6 就等于强行造出 owner 明确不要的那种差异（「和侧栏一样，只是
// 稍微区分一下」）。所以外壳家族有自己的一档步进，而且是**两边都封死**的：
//   下限 2.5 —— 一台没校准的笔记本屏上，两块贴着的大面积色要能看出是两块（它们中间还有
//               侧栏那条 border-r 发丝线兜底）；
//   上限 5.5 —— 严格小于图/底的 6。到了 6，顶栏就不再是侧栏的同侪，而是另一块东西。
// 注意这不是给「外壳 vs 画布」用的：veil 是**铺在**画布上的一层，它必须读成自己的一块面
// （「侧栏是一块自己的区域」是需求原话），所以那两对留在上面的 SURFACE_PAIRS 里，下限 4、
// 没有上限——真正封住它上限的是「它必须比控件站的那块纸色低 1.20×」。
const SHELL_PEER_MIN_DELTA = 0.8;
const SHELL_PEER_MAX_DELTA = 5.5;
// 外壳现在只有一层 veil：顶栏和侧栏是同一块面，中间没有台阶可量。
const SHELL_PEERS = [];

function hovered(scope, surface) {
  return composite(parseColor(resolveToken(scope, "--ui-hover-overlay")), { rgb: colorOf(scope, surface) });
}

// 遮罩压在**页面卡片**上：卡片就是这一页的可见面，读者看到的「暗下去」就是它暗下去。
function scrimmed(scope) {
  return composite(parseColor(resolveToken(scope, "--ui-scrim")), { rgb: colorOf(scope, "--ui-surface-raised") });
}

test("every pair of surfaces that touch clears the step at the worst point of the gradient", () => {
  for (const [theme, scope] of THEMES) {
    for (const [label, first, second, minRatio, minDelta] of SURFACE_PAIRS) {
      const a = colorOf(scope, typeof first === "function" ? first(scope) : first);
      const b = colorOf(scope, typeof second === "function" ? second(scope) : second);
      const ratio = contrastRatio(a, b);
      const delta = deltaE(a, b);
      assert.ok(ratio >= minRatio, `${theme} ${label} steps only ${ratio.toFixed(3)}× (≥${minRatio})`);
      assert.ok(delta >= minDelta, `${theme} ${label} is only ΔE ${delta.toFixed(1)} apart (≥${minDelta})`);
    }
  }
});

// 同侪的那一档：既不许糊在一起，也不许分成图和底。两个阈值必须一起钉，只钉一头的话，
// 下一个人「修」其中一条的方式就是违反另一条。
test("two shell peers keep a deliberate step: perceptible, and short of figure/ground", () => {
  for (const [theme, scope] of THEMES) {
    for (const [label, firstToken, secondToken, end] of SHELL_PEERS) {
      const a = shellRange(scope, firstToken)[end];
      const b = shellRange(scope, secondToken)[end];
      const delta = deltaE(a, b);
      assert.ok(
        delta >= SHELL_PEER_MIN_DELTA,
        `${theme} ${label} is only ΔE ${delta.toFixed(1)} apart — one flat field again (≥${SHELL_PEER_MIN_DELTA})`,
      );
      assert.ok(
        delta <= SHELL_PEER_MAX_DELTA,
        `${theme} ${label} is ΔE ${delta.toFixed(1)} apart — that is figure/ground, not a peer (≤${SHELL_PEER_MAX_DELTA})`,
      );
    }
    // 上限的另一半，写成一句不会被数字漂移绕过去的话：同侪之间的步进必须**严格小于**
    // 图/底的那一步，而图/底的那一步就是这份契约在别处用的 6。
    assert.ok(SHELL_PEER_MAX_DELTA < 6, "the peer band must stay under the figure/ground threshold");
  }
});

// 两层 veil 必须真的是「同一层纸的两个厚度」，不是两支颜色：同一个 rgb 三元组，只有 alpha
// 不同，而且顶栏必须是**薄**的那一个（它站着控件，控件要比它高一档纸色）。
// 顶栏和侧栏现在是两种不同的做法：顶栏 = 画布同色 + 真实模糊 + 分隔线（它底下有内容在滚，
// 模糊不是 §16.1 里那个空操作）；侧栏 = 铺在画布上的一层纸色 + 竖线。所以「同一张纸的两个
// 厚度」那条规则连同「画布必须起伏到够侧栏采样」一起作废——起伏的活儿归模糊了。
// ──────────────────────────────────────────────────────────────────────────────
// 「你现在改的太乱了，每个地方都是单独打补丁」的结构性答案：卡片**内部没有嵌套卡片**。
// 区块不带底色、不带描边、不带阴影，分界只有三种，而且三种各有各的岗位：
//   · 卡片自己的 `divide-y divide-divider` —— band 之间的全宽横线；
//   · `.ui-seams` 的 1px gap —— 并排区块之间的竖缝（同时也是同一网格的行线）；
//   · 区块内部的 `border-t border-divider` —— 列表 / 表格的行分隔，被区块内边距缩进。
// 「浮起来」的东西只剩四样：账号菜单、Toast、两个对话框，加上页面卡片自己的那一层。
test("nothing inside the page card is a card: no fill, no border, no elevation on a section", () => {
  const ELEVATION = /\bshadow-e[123]\b/;
  const SHELL = new Set([
    "src/components/AppCard.vue",       // 卡片自己：它的边就是那一层阴影
    "src/components/AppSidebar.vue",    // 外壳：当前导航项站在半透明的 rail 上
    "src/components/AppTabBar.vue",     // 外壳：底部标签栏
    "src/components/AppTopBar.vue",     // 外壳 ＋ 账号菜单浮层
    "src/components/AppToast.vue",      // 浮层
    "src/components/LoginDialog.vue",   // 浮层
    "src/components/PrivacyModal.vue",  // 浮层
  ]);

  const offenders = [];
  for (const [path, source] of readVueSources()) {
    if (SHELL.has(path)) continue;
    const template = source.slice(0, source.indexOf("<script"));
    for (const cls of template.match(/class="[^"]*"|:class="[^"]*"/g) ?? []) {
      // 行内填充是明确保留的：chip、徽章、进度轨道、输入框、分段控件的轨道，
      // 以及主 / 警示 / 危险的容器色。它们不是「区块」，它们是元素。
      const isSection = /\brounded-(card|control)\b/.test(cls) && /\bbg-surface-raised\b/.test(cls);
      if (isSection || ELEVATION.test(cls)) offenders.push(`${path}: ${cls.slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [], `these read as nested cards inside the page card:\n${offenders.join("\n")}`);

  // 卡片的边由**一种**机制定义。选的是阴影：`--ui-e2` 在浅色是「接触影 ＋ 环境影」，
  // 在深色它的第一层本来就是一条发丝线，所以同一个 token 覆盖两个主题，不需要第二条声明。
  const card = readSource("src/components/AppCard.vue");
  const cardTag = card.slice(card.indexOf("<section"), card.indexOf(">", card.indexOf("<section")));
  assert.match(cardTag, /\bshadow-e2\b/, "the card's edge is its elevation");
  assert.doesNotMatch(cardTag, /\bborder(?![\w-])|\bborder-divider\b/, "…and only its elevation — never both");
  assert.match(cardTag, /\bbg-surface-raised\b/, "the card carries the paper tone itself");
  assert.match(cardTag, /\bdivide-y\b[^"]*\bdivide-divider\b/, "and it owns the full-bleed rules between its bands");
  assert.doesNotMatch(cardTag, /(?:^|\s)p-\d|(?:^|\s)px-\d/, "the card may not pad, or its rules stop short of the edge");
  for (const [theme, scope] of THEMES) {
    assert.ok(resolveToken(scope, "--ui-e2"), `${theme} must define the card's elevation`);
  }

  // 接缝网格是一个**配方**，调用方只加列数和落位；再加一个 gap 就把接缝抹掉了。
  assert.match(MAIN_CSS, /\.ui-seams\s*\{[^}]*gap:\s*1px/, "the seam grid is defined once, in CSS");
  assert.match(MAIN_CSS, /\.ui-seams\s*>\s*\*\s*\{[^}]*var\(--ui-surface-raised\)/, "and its cells carry the card tone");
  for (const [path, source] of [...readVueSources(), ["src/utils/ui.js", UI_RECIPES]]) {
    for (const cls of source.match(/["`][^"`\n]*ui-seams[^"`\n]*["`]/g) ?? []) {
      assert.doesNotMatch(cls, /\bgap-/, `${path} adds a gap to a seam grid, which erases the seams: ${cls}`);
    }
  }
});

test("the top bar is ruled off at rest, and the rule deepens on scroll", () => {
  const shell = readSource("src/assets/base.css");
  const header = shell.slice(shell.indexOf(".app-header {"), shell.indexOf("}", shell.indexOf(".app-header {")));
  assert.match(header, /border-bottom:\s*1px solid var\(--ui-rule\)/, "the top bar must carry a resting divider — it is the only separation at rest");

  // 静止时靠常驻分隔线分界；滚下去再叠加模糊、背景加深和更实的线，三样由同一个进度变量驱动。
  const bar = readSource("src/components/AppTopBar.vue");
  for (const custom of ["--header-border-mix", "--header-backdrop-blur", "--header-background-mix"]) {
    assert.ok(bar.includes(custom), `the top bar must ramp ${custom} with scroll`);
  }
  assert.match(bar, /backdrop-filter:\s*blur\(var\(--header-backdrop-blur\)\)/, "the blur must ramp with scroll");

  // 滚动主人随断点变；绑死 window.scrollY 会让顶栏在桌面端永远停在未滚动态。
  const surface = readSource("src/composables/useHeaderScrollSurface.js");
  assert.ok(surface.includes(".main-scroll"), "the header must read the breakpoint's actual scroll owner");
  assert.match(surface, /addEventListener\("scroll",[^)]*capture:\s*true/, "scroll does not bubble — the listener must capture");

  for (const [theme, scope] of THEMES) {
    const topbar = parseColor(resolveToken(scope, "--ui-topbar"));
    assert.deepEqual(topbar.rgb, colorOf(scope, "--ui-background"), `${theme} the top bar must carry the canvas colour`);
    assert.ok(topbar.alpha > 0 && topbar.alpha < 1, `${theme} the top bar must stay translucent for the blur to matter`);
  }
});

test("the canvas washes may move the canvas, but never toward the card", () => {
  for (const [theme, scope] of THEMES) {
    const canvas = canvasRange(scope);
    const card = relativeLuminance(colorOf(scope, "--ui-surface-raised"));
    // 规则不钉方向，只钉**不许跨越**：wash 的两端必须和无 wash 的底色落在卡片的同一侧，
    // 否则卡片的边在那一带就没了。
    const unwashed = relativeLuminance(colorOf(scope, "--ui-background"));
    const side = Math.sign(unwashed - card);
    const ends = [canvas.lightest, canvas.darkest].map(relativeLuminance);
    assert.ok(
      ends.every((end) => Math.sign(end - card) === side),
      `${theme} the washed canvas crosses the card tone it is supposed to sit behind`,
    );
    // 起伏不再有下限：毛玻璃的活儿归顶栏了（它模糊的是真的在滚的内容），画布的两道 wash
    // 现在只是一点方向感，振幅越小托盘越有余量变亮。

    // 侧栏同理：它现在是一块铺在画布上的纸色面 + 一条竖线，不再假装是毛玻璃。

    // 暖 wash 的振幅下限也随之作废：它当初是为了喂饱侧栏的采样，现在只是一点方向感，
    // 而且振幅越小，托盘越有余量亮过画布——这正是「卡片太深」的解法。
  }
});

// 到期色阶是有序的，不是分类的：从「快到期」到「长期有效」，与卡片的对比度必须单调下降，
// 相邻两档的亮度差不小于 0.06，两个主题都要成立。
test("the expiry ramp is ordinal in both themes: monotonic contrast, ΔL ≥ 0.06", () => {
  for (const [theme, scope] of THEMES) {
    const ratios = EXPIRY_SCALE.map((token) => measure(scope, token, "--ui-surface-raised"));
    for (let index = 1; index < ratios.length; index += 1) {
      assert.ok(
        ratios[index] < ratios[index - 1],
        `${theme} expiry step ${index + 1} must stand out less than step ${index}`,
      );
    }

    const lightnesses = EXPIRY_SCALE.map((token) => luminance(scope, token));
    for (let index = 1; index < lightnesses.length; index += 1) {
      const delta = Math.abs(lightnesses[index] - lightnesses[index - 1]);
      assert.ok(delta >= 0.06, `${theme} expiry ΔL ${index} is ${delta.toFixed(3)}`);
    }

    assert.ok(
      measure(scope, "--ui-expiry-1", "--ui-surface-raised") >= AA_NON_TEXT,
      `${theme} the nearest-expiry step must clear 3:1 on the region it is drawn in`,
    );
  }

  for (const token of [...EXPIRY_SCALE, "--ui-spent"]) {
    assert.notEqual(
      resolveToken(LIGHT, token),
      resolveToken(DARK, token),
      `${token} must be stepped separately for dark mode`,
    );
  }
});

// 已用 is a warm neutral on purpose: a spent segment must never read as a position on the
// ordinal ramp, and it must never be mistaken for a status colour either.
test("the 已用 grey sits off the expiry ramp and off the status colours", () => {
  for (const [theme, scope] of THEMES) {
    const spent = resolveToken(scope, "--ui-spent").toLowerCase();
    for (const token of [...EXPIRY_SCALE, ...SERIES_SCALE, "--ui-primary", "--ui-danger", "--ui-warning-ink"]) {
      assert.notEqual(spent, resolveToken(scope, token).toLowerCase(), `${theme} 已用 collides with ${token}`);
    }
  }
});

// The lightest expiry step and the 已用 grey both sit under 3:1 on the card. That is allowed
// only because every segment is paired with a printed value and a hairline edge — the same
// relief the old categorical palette used. If the relief disappears, the test fails.
test("sub-3:1 chart marks are relieved by a printed label and a hairline edge", () => {
  const soft = [...EXPIRY_SCALE, "--ui-spent"]
    .filter((token) => measure(LIGHT, token, "--ui-surface-raised") < AA_NON_TEXT);

  if (!soft.length) return;

  assert.match(BASE_CSS, /\.mark-edge\s*\{/, "soft marks need a hairline edge utility");
  const lanes = readSource("src/components/ExpiryLanes.vue");
  assert.match(lanes, /mark-edge/, "every filled segment must draw the hairline edge");
  assert.match(lanes, /lane\.labels/, "every lane must print its segment values");
  assert.match(lanes, /:title="segment\.title"/, "every segment must carry a readable title");
  assert.match(lanes, /role="img"/, "the track needs an accessible name");

  const buckets = readSource("src/utils/usageBuckets.js");
  assert.match(buckets, /labels\.push/, "the model, not the component, decides the labels");
});

test("both themes define every semantic ink and chart token", () => {
  const tokens = [
    "--ui-primary-ink", "--ui-danger-ink", "--ui-warning-ink",
    "--ui-spent", ...EXPIRY_SCALE, ...SERIES_SCALE,
  ];
  for (const [theme, scope] of THEMES) {
    for (const token of tokens) assert.ok(scope.has(token), `${theme} is missing ${token}`);
  }
  for (const token of ["--ui-primary-ink", "--ui-danger-ink", "--ui-warning-ink"]) {
    assert.notEqual(
      resolveToken(LIGHT, token),
      resolveToken(DARK, token),
      `${token} must be overridden for dark mode`,
    );
  }
});

// 方向三「柔和层次」: five steps, no duplicates. 34px is the single hero figure per screen;
// the previous scale had ten steps with duplicated values and was rejected as 字体大小混乱.
test("the type scale is exactly five steps: 12 / 14 / 17 / 22 / 34", () => {
  const sizes = [...MAIN_CSS.matchAll(/--text-([\w-]+):\s*([\d.]+)rem;/g)]
    .filter(([, name]) => !name.includes("--"))
    .map(([, name, rem]) => [name, Number(rem) * 16]);

  assert.deepEqual(
    Object.fromEntries(sizes),
    { caption: 12, body: 14, title: 17, display: 22, hero: 34 },
    "the scale is a closed set of five named steps",
  );
  assert.equal(new Set(sizes.map(([, px]) => px)).size, 5, "no two steps may share a size");
  assert.match(MAIN_CSS, /--text-\*:\s*initial;/, "Tailwind's default sizes must be cleared, not merely unused");

  // Leading may not run away from the size either; the hero is the only step over 30px.
  for (const [, name, rem] of MAIN_CSS.matchAll(/--text-([\w-]+)--line-height:\s*([\d.]+)rem;/g)) {
    const px = Number(rem) * 16;
    assert.ok(px <= 36, `--text-${name}--line-height is ${px}px`);
    if (name !== "hero") assert.ok(px <= 30, `--text-${name}--line-height is ${px}px`);
  }
});

test("34px is a hero figure, used by one component and only for the first slot", () => {
  const carriers = readVueSources().filter(([, source]) => /\btext-hero\b/.test(source));
  assert.deepEqual(
    carriers.map(([path]) => path),
    ["src/components/DashboardHero.vue"],
    "only the dashboard hero may reach the top step",
  );
  const hero = carriers[0][1];
  assert.equal((hero.match(/\btext-hero\b/g) ?? []).length, 1, "one hero figure per screen");
  assert.match(hero, /index === 0 && slot\.figure/, "the hero size is reserved for the first slot");
});

// 「圆角弧度太大」was an explicit rejection: 8 cards / 6 controls / 4 small elements, never more.
test("radii are exactly 8 / 6 / 4, with a circle token for round marks", () => {
  const radii = Object.fromEntries(
    [...MAIN_CSS.matchAll(/--radius-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
  assert.deepEqual(radii, { card: "8px", control: "6px", chip: "4px", dot: "50%" });
  assert.match(MAIN_CSS, /--radius-\*:\s*initial;/, "Tailwind's default radii must be cleared");

  for (const [path, source] of readVueSources()) {
    // Only the four semantic radii exist; `rounded-lg` and friends must not reappear.
    // A corner-scoped form (`rounded-t-card`) is fine as long as it names one of the four.
    const offenders = [...source.matchAll(/\brounded-(?:[tbrlse]{1,2}-)?([\w[\]]+)\b/g)]
      .filter(([, step]) => !["card", "control", "chip", "dot"].includes(step))
      .map(([match]) => match);
    assert.deepEqual(offenders, [], `${path} uses a radius outside the 8 / 6 / 4 set`);
  }
});

test("accent fills are never used as a text colour", () => {
  for (const [path, source] of readVueSources()) {
    const template = source.slice(0, source.indexOf("<script"));
    for (const forbidden of ["text-primary ", "text-primary'", "text-danger ", "text-danger'"]) {
      assert.ok(!template.includes(forbidden), `${path} uses ${forbidden.trim()} instead of the -ink token`);
    }
  }
});

// The WebGL spotlight canvas was the one file allowed to name a ramp step. The light-first
// language has no place for it, so it is gone and the rule is now absolute.
test("no .vue file carries a raw colour value — no exemptions", () => {
  const patterns = [
    [/#[\da-f]{3}\b|#[\da-f]{6}\b|#[\da-f]{8}\b/i, "a hex colour"],
    [/\brgba?\(/, "an rgb() literal"],
    [/\bhsla?\(/, "an hsl() literal"],
    [/\boklch\(/, "an oklch() literal"],
    [/-\[(?:#|rgb|hsl|oklch)/i, "arbitrary-colour syntax"],
    [
      /\b(?:zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
      "a Tailwind palette class",
    ],
    [/\b(?:bg|text|border|fill|stroke|outline|divide|ring)-(?:white|black)\b/, "bg-white / text-black"],
  ];

  for (const [path, source] of readVueSources()) {
    for (const [pattern, label] of patterns) {
      const hit = source.match(pattern);
      assert.ok(!hit, `${path} contains ${label}: ${hit?.[0]}`);
    }
  }

  const files = readVueSources().map(([path]) => path);
  assert.ok(!files.includes("src/components/SpotlightBackground.vue"), "the WebGL canvas is retired");
});

// 闭集不能靠「写在 class 里就管、写进 <style> 就不管」来维持：字号、圆角、粗细一旦
// 落进 scoped CSS 就绕开了全部三条规则。隐私说明那一屏正是这么长出 500 的粗细、
// 18px / 16px 两级新字号和 12px 圆角的。
test("scoped styles obey the same closed sets as the utilities", () => {
  for (const [path, source] of readVueSources()) {
    const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(([, body]) => body).join("\n");
    if (!styles.trim()) continue;
    for (const [match, value] of styles.matchAll(/font-size:\s*([^;]+);/g)) {
      assert.match(value, /var\(--text-/, `${path} sets a font size outside the five-step scale: ${match.trim()}`);
    }
    for (const [match, value] of styles.matchAll(/border-radius:\s*([^;]+);/g)) {
      assert.match(value, /var\(--radius-/, `${path} sets a radius outside the 8 / 6 / 4 set: ${match.trim()}`);
    }
    for (const [match, value] of styles.matchAll(/font-weight:\s*([^;]+);/g)) {
      assert.match(value, /^\s*(?:400|600)\s*$/, `${path} sets a weight outside 400 / 600: ${match.trim()}`);
    }
  }
});

test("no side accent bars anywhere", () => {
  for (const [path, source] of readVueSources()) {
    assert.doesNotMatch(source, /\bborder-[ls]-[248]\b/, `${path} draws a side accent bar`);
    assert.doesNotMatch(source, /\bborder-(?:l|s|left|inline-start)-\[/, `${path} draws a side accent bar`);
  }
});

test("toasts render above dialogs and outside every inert subtree", () => {
  const app = readSource("src/App.vue");
  const modalRoot = app.indexOf('id="app-modal-root"');
  const toastRoot = app.indexOf('id="app-toast-root"');

  assert.ok(toastRoot > modalRoot, "#app-toast-root must be a later sibling than #app-modal-root");
  assert.match(app.slice(modalRoot, modalRoot + 200), /z-\[60\]/);

  const toastElement = app.slice(app.lastIndexOf("<div", toastRoot), app.indexOf(">", toastRoot));
  assert.match(toastElement, /z-\[70\]/, "#app-toast-root must sit above the modal layer");
  assert.doesNotMatch(toastElement, /inert|aria-hidden/, "#app-toast-root must never be inert");
});

test("the toast live region is teleported and stays mounted while empty", () => {
  const toast = readSource("src/components/AppToast.vue");

  assert.match(toast, /<Teleport defer to="#app-toast-root">/);
  const liveRegion = toast.slice(toast.indexOf("<div"), toast.indexOf("<Transition"));
  assert.match(liveRegion, /role="status"/);
  assert.match(liveRegion, /aria-live="polite"/);
  assert.doesNotMatch(liveRegion, /v-if/, "the live region must outlive the message it announces");
});

test("every denser pointer height keeps a 44px mobile baseline", () => {
  for (const [path, source] of readVueSources()) {
    assert.ok(!/\bsm:size-\d{1,2}\b/.test(source), `${path} shrinks an icon-only target below 44px`);
    for (const [, classList] of source.matchAll(/(?:class|BUTTON_BASE|_CLASS)\s*[=:]\s*[`"']([^`"']*\b(?:sm|md|lg):h-(?:9|10)\b[^`"']*)[`"']/g)) {
      assert.match(classList, /\bh-11\b/, `${path} drops below 44px without a 44px mobile baseline`);
    }
    for (const [, classList] of source.matchAll(/class="([^"]*\b(?:sm|md|lg):min-h-(?:9|10)\b[^"]*)"/g)) {
      assert.match(classList, /\bmin-h-11\b/, `${path} drops a row below 44px without a mobile baseline`);
    }
  }
});

// Tailwind's `focus:outline-*` utilities have to be able to beat the token fallback.
test("the :focus-visible fallback stays inside @layer base", () => {
  assert.match(MAIN_CSS, /@import\s+['"]\.\/base\.css['"]\s+layer\(base\)/);
  assert.match(BASE_CSS, /:focus-visible\s*\{\s*outline:\s*2px solid var\(--ui-focus\)/);
});

test("the router exposes four bookmarkable sections under one layout", () => {
  const router = readSource("src/router/index.js");
  assert.match(router, /createWebHistory/, "routes must be real URLs, not hash anchors");
  assert.match(router, /AppLayout/, "the four sections share one shell route");

  for (const [name, title] of [
    ["dashboard", "看板"],
    ["usage", "用量明细"],
    ["services", "已订业务"],
    ["settings", "设置"],
  ]) {
    assert.match(router, new RegExp(`name:\\s*'${name}'`), `missing the ${name} route`);
    assert.match(router, new RegExp(`title:\\s*'${title}'`), `missing the ${title} title`);
  }

  const settings = router.slice(router.indexOf("'settings'"));
  assert.match(settings, /shareable:\s*false/, "settings holds controls, not shareable data");
});

// Four destinations fit a tab bar, so the phone no longer pays two taps and a focus trap for
// navigation. The hamburger and its drawer are gone; nothing may bring them back.
test("the phone navigates with a bottom tab bar, not a hamburger drawer", () => {
  const files = Object.fromEntries(readVueSources());
  assert.ok(!files["src/components/AppNavDrawer.vue"], "the drawer is retired");

  const tabbar = files["src/components/AppTabBar.vue"];
  assert.ok(tabbar, "the tab bar must exist");
  assert.match(tabbar, /<nav[^>]*aria-label="主导航"/);
  assert.match(tabbar, /grid-cols-4/, "all four destinations are present at once");
  assert.match(tabbar, /aria-current/);
  assert.match(tabbar, /'page'/, "the current route must be marked, not merely styled");
  assert.match(tabbar, /\bmin-h-11\b/, "tab targets keep the 44px touch floor");
  assert.match(tabbar, /\bfixed\b/, "the bar stays reachable while the page scrolls");
  assert.match(tabbar, /\blg:hidden\b/, "the rail takes over from lg: up");
  assert.match(tabbar, /safe-area-inset-bottom/, "the bar must clear the home indicator");
  assert.match(tabbar, /NAV_ITEMS/, "sidebar and tab bar share one ordered list, so focus order matches");

  const layout = files["src/views/AppLayout.vue"];
  assert.match(layout, /<AppTabBar\b/);
  assert.match(layout, /<AppSidebar[^>]*\blg:flex\b/, "the rail only appears from lg: up");
  assert.doesNotMatch(layout, /AppNavDrawer|drawerOpen|open-drawer/, "no hamburger survives in the shell");

  for (const [path, source] of Object.entries(files)) {
    assert.doesNotMatch(source, /aria-label="打开导航"/, `${path} still renders a hamburger`);
  }
});

// 「顶栏只留刷新、截图、账号」。标题被删掉不等于这一页没有名字：`document.title` 负责
// 标签页和读屏器念出来的页面名，一个只给读屏器的 <h1> 负责标题大纲。两样都在，才叫删对了。
test("the top bar carries only controls, and the page keeps its name and its heading", () => {
  const bar = readSource("src/components/AppTopBar.vue");
  const template = bar.slice(0, bar.indexOf("<script"));
  assert.doesNotMatch(template, /<h1[\s>]/, "the page title block is gone from the bar");
  assert.doesNotMatch(bar, /\btitle:\s*\{\s*type:\s*String/, "and so is the prop that fed it");
  assert.doesNotMatch(bar, /subtitle/, "and the subtitle with it");
  for (const control of ["刷新", "截图分享当前页面", "账号切换"]) {
    assert.ok(bar.includes(control), `the bar must keep the ${control} control`);
  }

  const layout = readSource("src/views/AppLayout.vue");
  assert.match(layout, /<h1 class="sr-only">\{\{ pageTitle \}\}<\/h1>/, "the route still owns an h1, visually hidden");
  assert.match(layout, /const pageTitle = computed\(\(\) => String\(route\.meta\?\.title/);
  assert.doesNotMatch(layout, /:title="pageTitle"/, "the bar must not be fed a title again");

  const router = readSource("src/router/index.js");
  assert.match(router, /document\.title = section/, "and document.title still follows the route");
});

test("the sidebar is a nav with a current-page indication", () => {
  const sidebar = readSource("src/components/AppSidebar.vue");
  assert.match(sidebar, /<nav[^>]*aria-label="主导航"/);
  assert.match(sidebar, /aria-current=/);
  assert.match(sidebar, /'page'/, "the current route must be marked, not merely styled");
  assert.match(sidebar, /NAV_ITEMS/);
  assert.doesNotMatch(sidebar, /sr-only/, "the rail is wide enough to keep every label on screen");
});

// 「侧栏太窄」「要读起来是自己的一块区域」「你现在这样凸显不出它是一个毛玻璃的感觉」：
// 264px 宽 ＋ 一条通到底的发丝线 ＋ 一层**半透明**的自有色。画布本身带渐变，所以这层半透明
// 真的在采样它背后的东西——这就是 frosted 的效果来源。空操作的 backdrop-filter 仍然不许上：
// §16.1 量过，在一块纯色画布前它只改动 0.07% 的像素、最大通道差 3/255。
test("the rail is 264px wide, ruled, and carries its own translucent tint", () => {
  const sidebar = readSource("src/components/AppSidebar.vue");
  const navOpenTag = sidebar.slice(sidebar.indexOf("<nav"), sidebar.indexOf(">", sidebar.indexOf("<nav")));

  assert.match(navOpenTag, /\bw-66\b/, "the rail is 264px — w-54 (216px) was rejected as too narrow");
  assert.match(navOpenTag, /\bborder-r\b/, "the rail owns the boundary between the two regions");
  assert.match(navOpenTag, /\bborder-divider\b/, "that boundary is a hairline, not a control outline");
  assert.match(navOpenTag, /\bapp-rail\b/, "the rail must not share the canvas colour any more");
  assert.doesNotMatch(navOpenTag, /\bbg-(?:surface|background)\b/, "the tint is the token, not an opaque fill");

  assert.match(BASE_CSS, /\.app-rail\s*\{[^}]*background-color:\s*var\(--ui-rail\)/);
  assert.match(BASE_CSS, /\.app-rail\s*\{[^}]*--ui-shell-sheen/, "the rail draws its own inner edge");

  // 顶栏是同一块外壳的第二块面，走同一条规则：token 化的半透明纸色，不是一块不透明填充，
  // 更不是「没有背景」——它以前就是没有背景，于是屏幕最上面那 56px 是整片裸画布。
  assert.match(BASE_CSS, /\.app-header\s*\{[^}]*background-color:\s*var\(--ui-topbar\)/,
    "the top bar must own a surface instead of showing the bare canvas");
  const bar = readSource("src/components/AppTopBar.vue");
  assert.match(bar, /--ui-shell-sheen/, "and it draws the same inner edge as the rail");
  const headerTag = bar.slice(bar.indexOf("<header"), bar.indexOf(">", bar.indexOf("<header")));
  assert.match(headerTag, /\bapp-header\b/);
  assert.doesNotMatch(headerTag, /\bbg-(?:surface|surface-raised|background)\b/, "the veil is the token, not a fill");

  for (const [name, token] of SHELL_VEILS) {
    for (const [theme, scope] of THEMES) {
      const tint = resolveToken(scope, token);
      const alpha = parseColor(tint).alpha;
      assert.ok(alpha > 0 && alpha < 1, `${theme} ${token} must be translucent, got ${tint}`);
      // Over the canvas it has to land somewhere the canvas is not, or it is still one flat field.
      const over = { rgb: composite(parseColor(tint), parseColor(resolveToken(scope, "--ui-background"))), alpha: 1 };
      // 侧栏必须落在画布之外（它是一块面）；顶栏故意是画布同色，靠模糊和分隔线区分。
      if (name === "rail") {
        const gap = contrastRatio(over.rgb, parseColor(resolveToken(scope, "--ui-background")).rgb);
        assert.ok(gap >= 1.04, `${theme} the ${name} resolves to ${gap.toFixed(3)}× the canvas — still the same colour`);
      }
    }
  }

  // And the canvas must actually have something to show through: a flat field would make the
  // translucency a no-op the same way a flat field makes a blur a no-op.
  assert.match(BASE_CSS, /\.app-shell\s*\{[^}]*background-image:\s*\n?\s*radial-gradient/, "the canvas is washed, not flat");
  for (const [theme, scope] of THEMES) {
    for (const token of ["--ui-canvas-warm", "--ui-canvas-deep"]) {
      assert.ok(scope.has(token), `${theme} is missing ${token}`);
      assert.ok(parseColor(resolveToken(scope, token)).alpha < 1, `${theme} ${token} must be a wash, not a fill`);
    }
  }

  // The one place a blur does real work is the sticky header, where live numbers pass under it.
  const blurring = readVueSources()
    .filter(([, source]) => /backdrop-filter/.test(source))
    .map(([path]) => path);
  assert.deepEqual(
    blurring,
    ["src/components/AppTopBar.vue"],
    "a backdrop-filter is only allowed where something actually passes under the element",
  );
  assert.match(bar, /--header-backdrop-blur/);

  // 滚动上色是**盖在** veil 上的一层，不是替换它：旧写法把 background-color 整个占掉，于是
  // 进度为 0（也就是 lg: 以上永远）时顶栏就是一块透明的东西，屏幕最上面那一条是裸画布。
  const scoped = bar.slice(bar.indexOf("<style"));
  assert.doesNotMatch(scoped, /^\s*background-color:/m, "the scroll tint must not take over the veil's own colour");
  assert.match(scoped, /background-image:\s*linear-gradient\(\s*\n?\s*color-mix\(in srgb, var\(--ui-background\) var\(--header-background-mix\)/,
    "the scroll tint is a layer painted over the veil");
});

// 「一个合理的 UI 设计应该是最外层有一个大的卡片，内部再进行划分」：四条路由各自只有一张
// AppCard，面板降级成卡片内部的区域。
test("each route renders exactly one outer card and no panel floats on its own", () => {
  const shells = {
    "src/views/DashboardView.vue": 1,
    "src/views/UsageView.vue": 1,
    "src/views/ServicesView.vue": 1,
    "src/views/SettingsView.vue": 1,
    "src/components/DashboardSkeleton.vue": 1,
  };

  for (const [path, expected] of Object.entries(shells)) {
    const source = readSource(path);
    assert.equal(
      (source.match(/<AppCard\b/g) ?? []).length,
      expected,
      `${path} must open exactly ${expected} outer card`,
    );
  }

  for (const [path, source] of readVueSources()) {
    if (path in shells || path === "src/components/AppCard.vue") continue;
    assert.doesNotMatch(source, /<AppCard\b/, `${path} must be a region inside the page card, not a card`);
    assert.doesNotMatch(
      source,
      /\bshadow-e2\b/,
      `${path} must not lift itself off the page card — only the outer card is elevated`,
    );
  }

  assert.match(readSource("src/components/AppCard.vue"), /rounded-card[^"]*bg-surface[^"]*shadow-e2/);
});

// 「加粗的字体太多了，一眼看过去很密集，抓不住重点」：权重是一个只有两档的闭集，而 600 只由
// 两件事产生——三个大字号自带的 600（区域的名字、每屏唯一的主数字），以及**恰好三种**「这是
// 当前的那一个」的控件状态。任何 14px / 12px 的数据文字都不许加粗。
test("weight is a closed set of two, and 600 is spent on almost nothing", () => {
  // 收敛之后 600 只剩四个出处，而且其中一个是**唯一的按钮定义**：主按钮的 600 现在
  // 只写在 utils/ui.js 的 filled 变体里，四份手写的按钮常量已经没了。
  const ALLOWED_BOLD = new Set([
    "src/components/AppSidebar.vue",       // 当前导航项 ＋ 产品名（侧栏是这次的排版基准）
    "src/components/AppTabBar.vue",        // 当前标签项
    "src/components/SegmentedControl.vue", // 选中的那一格
    "src/utils/ui.js",                     // filled 按钮：一屏最多一个的主操作
  ]);

  for (const [path, source] of [...readVueSources(), ["src/utils/ui.js", UI_RECIPES]]) {
    for (const weight of ["font-bold", "font-medium", "font-light", "font-extrabold", "font-black", "font-normal"]) {
      assert.ok(!source.includes(weight), `${path} uses ${weight}; the ramp is 400 / 600 only`);
    }
    if (path.endsWith(".vue")) {
      const template = source.slice(0, source.indexOf("<script"));
      assert.doesNotMatch(template, /<(?:b|strong)[\s>]/, `${path} bolds text with a tag instead of the ramp`);
    }
    if (source.includes("font-semibold")) {
      assert.ok(ALLOWED_BOLD.has(path), `${path} adds a hand-written 600; only the active-control set may`);
    }
  }

  // 每一个允许的用法都必须是「当前/主要的那一个」的状态类，不是普通排版。
  for (const path of ALLOWED_BOLD) {
    const source = readSource(path);
    for (const hit of source.matchAll(/font-semibold/g)) {
      // The state that earns the weight can sit on the line above (`:class="cond ? …"`).
      const window = source.slice(Math.max(0, hit.index - 220), hit.index + 120);
      assert.match(
        window,
        /route\.name === item\.name|option\.value === modelValue|bg-primary(?![\w-])|联通套餐查询/,
        `${path} uses 600 outside an active-control state: ${window.slice(-160).trim()}`,
      );
    }
  }
});

// 「同一个页面有这么多种不同的字体、粗细、深黑浅灰」：文字颜色也是一个闭集。侧栏是基准，
// 它只用三档中性墨；其余的都是有语义的角色色，不是第四、第五档灰。
test("text colour is a closed set: three neutral inks plus the role inks", () => {
  const SIZES = new Set(["caption", "body", "title", "display", "hero"]);
  const ALIGN = new Set(["left", "right", "center"]);
  const NEUTRAL_INK = ["on-surface", "on-surface-variant", "on-surface-muted"];
  const ROLE_INK = [
    "primary-ink", "danger-ink", "warning-ink",
    "on-primary", "on-primary-container", "on-warning-container", "on-danger-container",
  ];
  const ALLOWED = new Set([...NEUTRAL_INK, ...ROLE_INK]);

  assert.equal(NEUTRAL_INK.length, 3, "three neutral steps: 主文字 / 次要 / 最弱");
  // 三档必须真的分得开：两档灰只差十来个色阶时，读者看到的是「一种灰印了两遍」，
  // 「深黑浅灰」的抱怨就是这么来的。
  for (const [theme, scope] of THEMES) {
    const steps = NEUTRAL_INK.map((name) => measure(scope, `--ui-${name}`, "--ui-surface-raised"));
    for (let index = 1; index < steps.length; index += 1) {
      const gap = Math.max(steps[index - 1], steps[index]) / Math.min(steps[index - 1], steps[index]);
      assert.ok(gap >= 1.2, `${theme} ink step ${index} only separates ${gap.toFixed(3)}×`);
    }
  }

  const used = new Set();
  // 模板 ＋ `<script setup>` 里的 class 常量 ＋ 收敛层的配方。把类名搬进 script 或 .js 不是
  // 逃逸通道——StatusChip 的语气表、AppButton 的变体表都住在那里，它们也在这个闭集里。
  // `<style>` 由另一条测试单独管（同样的闭集，另一套语法）。
  const scanned = [
    ...readVueSources().map(([path, source]) => {
      const style = source.indexOf("<style");
      return [path, style > 0 ? source.slice(0, style) : source];
    }),
    ["src/utils/ui.js", UI_RECIPES],
  ];
  for (const [path, template] of scanned) {
    for (const [, name] of template.matchAll(/\btext-([a-z][\w-]*)/g)) {
      if (SIZES.has(name) || ALIGN.has(name)) continue;
      assert.ok(ALLOWED.has(name), `${path} paints text with text-${name}, outside the closed set`);
      used.add(name);
    }
  }
  // 闭集必须是「实际用到的那一组」，不许留着没人用的名额慢慢长回去。
  assert.deepEqual([...used].sort(), [...ALLOWED].sort(), "every name in the set must earn its place");
});

// ──────────────────────────────────────────────────────────────────────────────
// 收敛的**证据**：一个反复出现的图形只有一个定义。这条测试是这一轮的看门人——
// 下一个人想「就这一处特殊一下」时，它会红。
//
// 每一行是：[这件事叫什么, 唯一的定义在哪, 谁不许再手写它, 手写长什么样]
const CONVERGED = [
  {
    name: "页面卡片",
    home: "src/components/AppCard.vue",
    pattern: /\brounded-card\b[^"]*\bshadow-e2\b/,
  },
  {
    name: "区块（标题 ＋ 可内滚的主体 ＋ 脚注）",
    home: "src/components/AppSection.vue",
    pattern: /\bpane-scroll\b[^"]*\bscroll-shade\b/,
  },
  {
    name: "标题行（抬头 band 与区块标题共用）",
    home: "src/utils/ui.js",
    pattern: /\bflex-wrap\b[^"`]*\bitems-baseline\b[^"`]*\bgap-x-3\b[^"`]*\bpx-5\b/,
  },
  {
    name: "抬头标题的字号",
    home: "src/utils/ui.js",
    pattern: /\bsm:text-display\b/,
  },
  {
    name: "状态徽章",
    home: "src/components/StatusChip.vue",
    pattern: /\bh-6\b[^"]*\brounded-chip\b[^"]*\bpx-2\.5\b/,
  },
  {
    name: "按钮",
    home: "src/utils/ui.js",
    pattern: /\binline-flex\b[^"`]*\bh-11\b[^"`]*\bgap-2\b[^"`]*\brounded-control\b[^"`]*\bpx-4\b/,
  },
  {
    name: "分段控件",
    home: "src/components/SegmentedControl.vue",
    pattern: /\brounded-control\b[^"]*\bbg-surface-sunken\b[^"]*\bp-1\b/,
  },
  {
    name: "账号行",
    home: "src/components/AccountList.vue",
    pattern: /accountDisplayName/,
  },
  {
    name: "进度轨道",
    home: "src/components/ProgressTrack.vue",
    pattern: /\bh-1\.5\b[^"]*\brounded-chip\b[^"]*\bbg-surface-sunken\b/,
  },
  {
    name: "对话框抬头",
    home: "src/components/DialogHeader.vue",
    pattern: /\bsize-9\b[^"]*\bbg-primary-container\b/,
  },
  {
    name: "输入框",
    home: "src/components/TextField.vue",
    pattern: /\brounded-control\b border\b[^`]*\bbg-surface-sunken\b[^`]*\bplaceholder:/,
  },
  {
    name: "骨架区块",
    home: "src/components/SkeletonSection.vue",
    pattern: /\bskeleton\b[^"]*\bh-5\b/,
  },
  {
    name: "脚注 / 降级提示",
    home: "src/components/SectionNote.vue",
    pattern: /\bflex\b[^"]*\bitems-baseline\b[^"]*\bgap-1\.5\b[^"]*\btext-caption\b[^"]*\bleading-relaxed\b/,
  },
];

test("every recurring pattern has exactly one home, and nobody hand-rolls a second one", () => {
  for (const { name, home, pattern } of CONVERGED) {
    assert.match(readSource(home), pattern, `${name} must actually be defined in ${home}`);
    for (const [path, source] of [...readVueSources(), ["src/utils/ui.js", UI_RECIPES]]) {
      if (path === home) continue;
      assert.doesNotMatch(source, pattern, `${path} hand-rolls 「${name}」 — it belongs to ${home}`);
    }
  }

  // 区块本身不带任何自己的面：没有底色、没有描边、没有圆角、没有阴影。
  const section = readSource("src/components/AppSection.vue");
  const sectionTag = section.slice(section.indexOf("<section"), section.indexOf(">", section.indexOf("<section")));
  assert.doesNotMatch(sectionTag, /\bbg-|\bborder|\brounded-|\bshadow-/, "a section is spacing and type, not a card");

  // 四条路由都必须走同一批组件——「看板成立、明细不成立」正是上一轮的病。
  for (const [path, expected] of [
    ["src/views/DashboardView.vue", ["AppCard", "CHART_BAND"]],
    ["src/views/UsageView.vue", ["AppCard", "PageHeader", "StatusChip", "SkeletonSection"]],
    ["src/views/ServicesView.vue", ["AppCard", "PageHeader", "StatusChip"]],
    ["src/views/SettingsView.vue", ["AppCard", "AppSection", "AppButton", "AccountList", "ui-seams"]],
  ]) {
    const source = readSource(path);
    for (const token of expected) {
      assert.ok(source.includes(token), `${path} must use the shared ${token}`);
    }
  }
  // 抬头 band 只有三条路由有（设置页没有「内容标题」，它的第一块区块就是内容）。
  assert.ok(readSource("src/components/DashboardHero.vue").includes("<PageHeader"));
});

// ──────────────────────────────────────────────────────────────────────────────
// 交互状态是三条配方，不是每个控件各写一遍。这是这一轮最大的一类重复：
// 焦点环在 11 个文件里手写了 19 遍，其中 6 处用外扩、5 处用内嵌，凭的是当时改到哪一个。
// 现在它们只有一个出处，而「外扩还是内嵌」是一条写下来的规则（控件离容器边有多近）。
test("focus, hover and transition are three recipes with one home each", () => {
  const RECIPES = [
    ["焦点环", /focus-visible:outline-2/],
    ["hover / active 覆盖层", /hover:bg-hover-overlay/],
    ["颜色过渡", /transition-colors duration-150 ease-standard/],
  ];

  for (const [name, pattern] of RECIPES) {
    assert.match(UI_RECIPES, pattern, `${name} must be defined in src/utils/ui.js`);
    for (const [path, source] of readVueSources()) {
      assert.doesNotMatch(source, pattern, `${path} hand-writes 「${name}」; import it from utils/ui.js`);
    }
  }

  // 两种焦点环都必须真的存在，而且都必须被用到——留一个没人用的名额，下一轮就会有人
  // 「按感觉」二选一，这正是它当初分裂成两派的过程。
  for (const constant of ["FOCUS_RING", "FOCUS_RING_INSET"]) {
    assert.match(UI_RECIPES, new RegExp(`export const ${constant} = `), `${constant} must exist`);
    const users = readVueSources().filter(([, source]) => new RegExp(`\\b${constant}\\b`).test(source));
    assert.ok(users.length > 0, `${constant} has no call site; delete it or use it`);
  }

  // 按钮的高度只有一档：44px 触摸基线 → 36px 指针。对话框那一套 sm:h-10 是补丁留下的
  // 第三档，删掉之后不许回来。
  assert.match(UI_RECIPES, /\bh-11\b[^`]*\bsm:h-9\b/, "one button height ramp");
  for (const [path, source] of [...readVueSources(), ["src/utils/ui.js", UI_RECIPES]]) {
    assert.doesNotMatch(source, /\bsm:h-10\b/, `${path} re-introduces a third control height`);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 全宽分隔线的**条数**是一个被想过的数字，不是「加到看起来够为止」。Material 3 说卡片是
// 一个整体的容器、分隔线是它内部的分隔手段，同时也警告分隔线用多了就变成噪音。所以规则是
// 「用最少的几条把结构说清楚，剩下的交给留白和标题层级」。
//
// 线的条数 ＝ 卡片直接子元素数 − 1（`divide-y` 的定义），所以这张表就是每条路由的 band 表。
// 加一块 band 必须在这里登记，也就必须先回答「这条线是不是真的需要」。
const CARD_BANDS = [
  {
    route: "src/views/DashboardView.vue",
    bands: 4,
    // 抬头 ／ 主数字 ／ 四格事实 ／ 图区。三条线：身份和数据之间、两条列数不同的
    // 数据带之间（3 列 vs 4 列，不分开会读成一张错位的表）、数据和图表之间。
    tags: ["<DashboardHero", ':class="CHART_BAND"'],
  },
  {
    route: "src/views/UsageView.vue",
    bands: 4,
    // 抬头 ／ 流量 ／ 语音 ／ 短信。三条线，三张表各自成段。
    tags: ["<PageHeader", "<ResourceTable"],
  },
  {
    route: "src/views/ServicesView.vue",
    bands: 2,
    // 抬头 ／ 分组网格。只有一条线——分组之间的缝由接缝网格画，不占全宽线的名额。
    tags: ["<PageHeader", "<ServiceSection"],
  },
  {
    route: "src/views/SettingsView.vue",
    bands: 1,
    // 整页就是一张接缝网格，一条全宽线都不需要：行与行、列与列的分界都是网格的 1px gap。
    tags: ['class="ui-seams'],
  },
];

test("the full-bleed rules are counted, not accumulated", () => {
  for (const { route, bands, tags } of CARD_BANDS) {
    const source = readSource(route);
    const card = source.slice(source.indexOf("<AppCard"), source.lastIndexOf("</AppCard>"));
    assert.ok(card.length > 0, `${route} must render the shared card`);
    for (const tag of tags) {
      assert.ok(card.includes(tag), `${route} must place ${tag} directly in the card`);
    }
    assert.ok(bands >= 1, `${route} declares ${bands} band(s) → ${bands - 1} full-bleed rule(s)`);
  }

  // 看板的抬头组件是**三个根节点**，卡片的 divide-y 才数得对它们。少一个或多一个，
  // 屏幕上就少一条或多一条线。
  const hero = readSource("src/components/DashboardHero.vue");
  const heroTemplate = hero.slice(0, hero.indexOf("<script"));
  const roots = (heroTemplate.match(/^ {2}<(?:PageHeader|div|dl)\b/gm) ?? []).length;
  assert.equal(roots, 3, "DashboardHero is exactly three bands: header, metrics, facts");

  // 全宽线只有一个来源。任何人想在 band 上补一条 border-t，这里就红。
  for (const { route } of CARD_BANDS) {
    const source = readSource(route);
    const card = source.slice(source.indexOf("<AppCard"), source.lastIndexOf("</AppCard>"));
    assert.doesNotMatch(card, /class="[^"]*\bborder-t\b/, `${route} draws its own rule; the card owns them`);
  }
});

// 文字到卡片外沿的插入量在全项目只有一个值：手机 20px（px-5），指针 24px（sm:px-6）。
// 卡片不再有内边距（分隔线必须通到两边），所以每一个 band 都得自己带上这一个值。
// 规则写成「≥16px 的横向内边距只许是这一对」——它挡得住的正是真实的回归方式：
// 新加一块区域时顺手写 px-4 或 px-6，屏幕上就多出一条对不齐的左边。
test("every band uses the one horizontal inset, and the card carries none", () => {
  const BANDS = [
    "src/utils/ui.js",                          // HEADING_ROW：抬头 band ＋ 区块标题行
    "src/components/AppSection.vue",            // 滚动主体 ＋ 脚注
    "src/components/SkeletonSection.vue",
    "src/components/DashboardHero.vue",         // 主数字格 ＋ 事实格
    "src/components/DashboardSkeleton.vue",
  ];

  for (const path of BANDS) {
    const source = readSource(path);
    const classAttributes = source.match(/class="[^"]*"|:class="[^"]*"|`[^`]*`|"[^"\n]*px-\d[^"\n]*"/g) ?? [];
    for (const cls of classAttributes) {
      // 控件（按钮、chip、输入框）不是 band，它们各有各的内边距——判据是圆角：
      // band 永远没有圆角（卡片替它裁边），有圆角的一定是元素。
      if (/\brounded-/.test(cls)) continue;
      for (const [, step] of cls.matchAll(/(?:^|[\s"`[])(?:sm:)?px-(\d+(?:\.\d+)?)/g)) {
        if (Number(step) * 4 < 16) continue;
        assert.ok(
          ["5", "6"].includes(step),
          `${path} insets a band by px-${step} (${Number(step) * 4}px) instead of the one recipe: ${cls.slice(0, 90)}`,
        );
      }
    }
    assert.match(source, /\bpx-5\b/, `${path} must carry the shared inset`);
  }
  assert.match(UI_RECIPES, /\bpx-5\b sm:px-6/, "the recipe pairs the phone and pointer steps");

  const card = readSource("src/components/AppCard.vue");
  const cardTag = card.slice(card.indexOf("<section"), card.indexOf(">", card.indexOf("<section")));
  assert.doesNotMatch(cardTag, /(?:^|\s)(?:sm:|lg:)?p[xy]?-\d/, "the card must not pad; the bands do");
});

// 「外层的卡片在每个页面应该是一样大的，而且它距离上面的刷新、截图、账号那一行太近了」。
test("the page card has one geometry on every route, and clears the top bar", () => {
  const layout = readSource("src/views/AppLayout.vue");
  const main = layout.slice(layout.indexOf("<main"), layout.indexOf(">", layout.indexOf("<main")));
  assert.match(main, /\bpt-4\b/, "the card must not touch the top bar on a phone");
  assert.match(main, /\blg:pt-6\b/, "and it gets a wider gap where the bar is a real toolbar");

  const capture = layout.slice(layout.indexOf('ref="captureTargetRef"'), layout.indexOf("<RouterView"));
  assert.match(capture, /\bmax-w-\[76rem\]/, "same width on every route");
  assert.match(capture, /\bmx-auto\b/, "and the same left edge");
  assert.match(capture, /\blg:min-h-full\b/, "and the same height: a short page pads, it does not shrink");
  // 卡片可以被压缩，区块因此才能在自己内部滚——但这是**下限**不是上限：钉成 lg:h-full 会把
  // 右列那两块到期分组图裁在半行上，刻度也一起被裁掉，那不是「内容超出就内滚」，那是图没了。
  assert.match(readSource("src/components/AppCard.vue"), /\blg:min-h-0\b/);
  assert.doesNotMatch(capture, /\blg:h-full\b/, "the card's height is a floor, not a ceiling");
  assert.match(MAIN_CSS, /\.is-capturing\s*\{\s*\n?\s*height:\s*auto;/, "an export lifts the cap as well as the stretch");
  assert.match(capture, /\bflex\b[^"]*\bflex-col\b/, "which needs the card to be a stretchable flex child");
  assert.match(readSource("src/components/AppCard.vue"), /\blg:grow\b/);
  // 导出的图不该继承这个拉伸，否则内容短的一页会带一条空托盘。
  assert.match(MAIN_CSS, /\.is-capturing\s*\{[^}]*min-height:\s*0;/);
});

// 内容的强调色不受品牌色限制，但它必须是一套**验证过**的板：固定顺序、按实体分配、
// 每一块都配一个印出来的数值。
test("the categorical set is fixed-order, per-entity and never colour-only", () => {
  for (const [theme, scope] of THEMES) {
    for (const token of SERIES_SCALE) {
      const ratio = measure(scope, token, "--ui-surface-raised");
      assert.ok(ratio >= AA_NON_TEXT, `${theme} ${token} is ${ratio.toFixed(2)}:1 on the region it is drawn in`);
    }
    const hues = SERIES_SCALE.map((token) => resolveToken(scope, token).toLowerCase());
    assert.equal(new Set(hues).size, 3, `${theme} the three slots must be three colours`);
  }

  // 槽位跟着资源种类走，不跟着它排到第几格——分组重排时颜色不许跟着换。
  for (const [path, mapping] of [
    ["src/components/DashboardHero.vue", /flow:\s*"bg-series-1",\s*voice:\s*"bg-series-2",\s*sms:\s*"bg-series-3"/],
    ["src/components/ResourceTable.vue", /flow:\s*"bg-series-1",\s*voice:\s*"bg-series-2",\s*sms:\s*"bg-series-3"/],
  ]) {
    assert.match(readSource(path), mapping, `${path} must bind the slot to the section, not to its rank`);
  }

  // 每一条上色的条都印着自己的数值，并带一个可读的名字。两处现在共用同一个 ProgressTrack，
  // 所以「必须有文字等价物」这条钉在组件上：label 是必填 prop，且同时落到 aria-label 和 title。
  const track = readSource("src/components/ProgressTrack.vue");
  assert.match(track, /label:\s*\{\s*type:\s*String,\s*required:\s*true\s*\}/, "a coloured meter must say what it is");
  assert.match(track, /:aria-label="label"/);
  const hero = readSource("src/components/DashboardHero.vue");
  assert.match(hero, /:label="`\$\{slot\.label\}，条形占比/, "the hero meter names itself and prints its share");
  const table = readSource("src/components/ResourceTable.vue");
  assert.match(table, /percentText/, "and every table bar prints its own percentage");
});

// 同一行的兄弟面板必须齐底：看板用显式的 2×2 落位，已订业务用两列 grid，靠 grid 的 stretch
// 把每一行拉到同一条底边，而不是靠两条各自堆叠的列。
test("panels that share a row share a bottom edge", () => {
  const dashboard = readSource("src/views/DashboardView.vue");
  const grid = dashboard.slice(dashboard.indexOf(':class="CHART_BAND"'), dashboard.indexOf("</AppCard>"));

  // 落位是一份常量，视图和骨架屏都 import 它——一致性由 import 保证，不是靠「两边都写同一串」。
  assert.match(UI_RECIPES, /CHART_BAND = "ui-seams[^"]*@\[60rem\]:grid-cols-\[minmax\(0,1fr\)_21\.25rem\]"/, "two columns from 60rem up");
  assert.match(grid, /:class="CHART_BAND"/, "the seam between the two columns is the grid's own 1px gap");
  assert.doesNotMatch(grid, /\bgap-\d|\bborder-t\b|\bborder-l\b/, "no second mechanism for the same seam");
  // 「本月消耗去向」删掉之后是 3 格：流量占满左列两行，语音和短信各占右列一行。
  // 左列那一格跨行，所以它的底边天然就是右下那一格的底边。
  for (const index of [0, 1, 2]) {
    assert.ok(grid.includes(`CHART_CELLS[${index}]`), `cell ${index} must be placed explicitly, so the row stretches together`);
  }
  // 三个落位串必须真的存在，而且必须覆盖满 2×2 的网格：接缝网格的底色就是分隔线色，
  // 一个空格子会露成一整块分隔线色的矩形。
  for (const cell of [
    "@[60rem]:col-start-1 @[60rem]:row-start-1 @[60rem]:row-span-2",
    "@[60rem]:col-start-2 @[60rem]:row-start-1",
    "@[60rem]:col-start-2 @[60rem]:row-start-2",
  ]) {
    assert.ok(UI_RECIPES.includes(cell), `CHART_CELLS must declare ${cell}`);
  }
  assert.doesNotMatch(grid, /items-start/, "a start-aligned row would let one panel end short of the other");

  // 内容超出就在面板里滚，面板不长高：每格都有一个上限。而这个上限必须压在**滚动主体**上
  // （`body-class`），不许压在区域自己身上：区域得能被 grid 拉到整行的高度，否则视口一变高
  // 就会露出一条空带——实测 980px 高时语音区域比它那一行短了 49px，谁也解释不了那 49px。
  assert.equal(
    (grid.match(/body-class="@\[60rem\]:max-h-\d+"/g) ?? []).length,
    3,
    "every dashboard cell declares its ceiling, and it lands on the scrolling body",
  );
  assert.doesNotMatch(grid, /(?<!body-)class="[^"]*@\[60rem\]:max-h-\d+/, "a ceiling on the region itself would fight the row");

  const panel = readSource("src/components/AppSection.vue");
  assert.match(panel, /:class="\[bodyClass,/, "AppSection puts the ceiling on .pane-scroll, not on the section");

  // 骨架屏必须用同一套落位，否则数字落地时会跳一下。它读的是同一份常量，所以「一样」是
  // 结构性的，不是两处抄写碰巧一致。
  const skeleton = readSource("src/components/DashboardSkeleton.vue");
  for (const constant of ["HERO_BAND", "FACT_BAND", "CHART_BAND", "CHART_CELLS"]) {
    assert.ok(skeleton.includes(constant), `the skeleton must reproduce the real layout via ${constant}`);
  }
  for (const constant of ["HERO_BAND", "FACT_BAND"]) {
    assert.ok(readSource("src/components/DashboardHero.vue").includes(constant), `the hero must use ${constant}`);
  }

  const services = readSource("src/components/ServiceSection.vue");
  assert.match(services, /@\[48rem\]:grid-cols-2/, "service groups are grid cells, not masonry columns");
  assert.match(services, /body-class="@\[48rem\]:max-h-\d+"/, "a long group scrolls inside its cell, and the ceiling lands on its body");
  assert.match(services, /\bui-seams\b/, "the two columns are divided by the same seam as everywhere else");
  // 接缝网格的底色**就是**分隔线色，所以奇数个格子必须把最后一格拉满整行，否则空出来的
  // 那一格会变成一整块分隔线色的矩形。会变长的那两处网格（已订业务、设置）都必须声明它。
  assert.match(services, /@\[48rem\]:odd:last:col-span-2/, "an odd group count must fill its last row");
  assert.match(readSource("src/views/SettingsView.vue"), /@\[60rem\]:col-span-2/, "settings' fifth section fills its row");

  // 设置页也走同一条规则：五块区块排成两列三行，同一行齐底。
  const settings = readSource("src/views/SettingsView.vue");
  assert.match(settings, /class="ui-seams[^"]*@\[60rem\]:grid-cols-2\b/, "settings is a seam grid too, not a stack of cards");
  assert.equal((settings.match(/<AppSection\b/g) ?? []).length, 5, "five settings sections, one component");
});

// 内部滚动必须被发现得到、够得着，而且不能把页面滚动吃掉。
test("an internally scrolling pane is discoverable, focusable and never traps the page", () => {
  const panel = readSource("src/components/AppSection.vue");

  assert.match(panel, /class="[^"]*\bscroll-shade\b/, "a clipped edge must show a scroll shadow");
  assert.match(BASE_CSS, /\.scroll-shade\s*\{/, "the shadow is CSS-only, so it survives every resize");
  assert.match(BASE_CSS, /background-attachment|no-repeat local/, "the cover gradients must scroll with the content");

  assert.match(panel, /:tabindex="overflowing \? 0 : undefined"/, "reachable by keyboard only when it can scroll");
  assert.match(panel, /:role="overflowing \? 'region' : undefined"/);
  assert.match(panel, /aria-label="[^"]*可在此区域内滚动/, "and it says so, in Chinese");
  assert.doesNotMatch(panel, /overscroll-contain/, "a pane must chain to the page instead of swallowing the scroll");

  const overflow = readSource("src/utils/paneOverflow.js");
  assert.match(overflow, /ResizeObserver/, "the flag is measured, never assumed");
  assert.match(overflow, /scrollHeight - pane\.clientHeight/);
});

// ──────────────────────────────────────────────────────────────────────────────
// 滚动归属是一条**全项目登记制**的规则，不是每个会滚的盒子各自猜一个 overscroll 值。
// 上一轮的病根：主区拿到了 `contain`，但**文档**从来没有被禁止回弹——而在 lg: 以上
// 文档并不是滚动的那一个，它一回弹带走的就是整份文档，也就是侧栏和顶栏。macOS 上
// 「没有可滚的余量」并不能阻止视口回弹，只有根元素上的 overscroll-behavior 能。
//
// 四种角色，四个值。任何新的滚动容器都必须在这张表里登记，否则这条测试就红。
const SCROLL_OWNERS = [
  ["src/views/AppLayout.vue", 1, "content", "主区：内容的滚动主人，链条断在它身上，回弹留给它自己"],
  ["src/components/AppSidebar.vue", 1, "chrome", "侧栏的导航列表：外壳永远不动，连自己的回弹也不要"],
  ["src/components/AppTopBar.vue", 1, "overlay", "账号菜单：打开时它就是自己的主人"],
  ["src/components/LoginDialog.vue", 1, "overlay", "登录对话框正文"],
  ["src/components/PrivacyModal.vue", 1, "overlay", "隐私说明正文"],
  ["src/components/AppSection.vue", 1, "pane", "区域内部的面板：滚到头必须把滚动交还给主人"],
];
const SCROLL_RULE = {
  content: { require: /\bmain-scroll\b/, forbid: /\boverscroll-(?:none|contain)\b/ },
  chrome: { require: /\boverscroll-none\b/, forbid: /\boverscroll-contain\b/ },
  overlay: { require: /\boverscroll-contain\b/, forbid: /\boverscroll-none\b/ },
  pane: { require: null, forbid: /\boverscroll-(?:none|contain)\b/ },
};

test("every scrollable box declares which of the four scroll roles it plays", () => {
  const scrollable = /\boverflow-(?:y-)?(?:auto|scroll)\b/g;
  const registry = new Map(SCROLL_OWNERS.map(([path, count, role, why]) => [path, { count, role, why }]));

  for (const [path, source] of readVueSources()) {
    const template = source.slice(0, source.indexOf("<script"));
    const hits = [...template.matchAll(scrollable)];
    const entry = registry.get(path);
    if (!hits.length) {
      assert.ok(!entry, `${path} lost its scroll container; the registry still lists it`);
      continue;
    }
    assert.ok(entry, `${path} opens a scroll container that is not in the scroll-ownership registry`);
    assert.equal(hits.length, entry.count, `${path} now has ${hits.length} scroll containers, registry says ${entry.count}`);

    const rule = SCROLL_RULE[entry.role];
    // 每一个会滚的元素所在的那个 class 串都要满足它这一档的规则。
    for (const [classList] of template.matchAll(/class="[^"]*\boverflow-(?:y-)?(?:auto|scroll)\b[^"]*"/g)) {
      if (rule.require) assert.match(classList, rule.require, `${path} (${entry.why}) is missing its scroll role`);
      assert.doesNotMatch(classList, rule.forbid, `${path} (${entry.why}) uses the wrong overscroll value`);
    }
  }
});

test("the document may only bounce at the breakpoint where it is the scroller", () => {
  // lg: 以上文档不是滚动的那一个，所以连回弹的资格都没有；根元素上的值会传播到视口，
  // 这是唯一能关掉 macOS 橡皮筋的开关。
  const guard = BASE_CSS.slice(BASE_CSS.indexOf("@media (min-width: 64rem)"));
  assert.match(guard, /:root,\s*\n\s*body\s*\{\s*\n\s*overscroll-behavior:\s*none;/,
    "from lg: up the document must be forbidden from bouncing");
  assert.match(guard, /\.app-shell\s*\{\s*\n\s*height:\s*100dvh;\s*\n\s*overflow:\s*hidden;\s*\n\s*overflow:\s*clip;/,
    "and it must have nothing to scroll in the first place — clipped, not a second scroll container");
  // lg: 以下文档就是内容的滚动主人，那里的回弹是它应得的，不许一刀切关掉。
  const unscoped = BASE_CSS.slice(0, BASE_CSS.indexOf("@media (min-width: 64rem)"));
  assert.doesNotMatch(unscoped, /overscroll-behavior:\s*none/,
    "on a phone the document is the content scroller — it keeps its bounce");
});

// 「主区滚到头的回弹不能把侧栏也带着动」：主区自己是滚动容器，contain 把链条断在它身上。
test("the main region owns the scroll and contains its own overscroll", () => {
  assert.match(BASE_CSS, /\.main-scroll\s*\{\s*overscroll-behavior:\s*contain;/);

  const layout = readSource("src/views/AppLayout.vue");
  assert.match(layout, /class="[^"]*\bmain-scroll\b/, "the main element carries the containment");
  assert.match(layout, /\blg:overflow-y-auto\b/, "and it is the element that scrolls, from lg: up");
  assert.match(layout, /\blg:h-dvh\b/, "which requires the shell to be pinned to one viewport");
  assert.match(layout, /\blg:overflow-hidden\b/, "so the document behind it has nothing left to bounce");
  assert.match(layout, /<AppSidebar[^>]*class="[^"]*\blg:flex\b/);
  assert.doesNotMatch(
    layout.slice(layout.indexOf("<AppSidebar"), layout.indexOf("/>", layout.indexOf("<AppSidebar"))),
    /\bsticky\b/,
    "the rail is a sibling of the scroller, not something stuck to a scrolling page",
  );

  // A dialog locks the document; from lg: up the document is not what scrolls.
  assert.match(MAIN_CSS, /\.app-locked \.main-scroll\s*\{\s*overflow:\s*hidden;/);
  assert.match(layout, /'app-locked': loginOpen/);
  assert.match(readSource("src/App.vue"), /'app-locked': privacyOpen/);
});

// 分享出去的图必须是整块面板，不是碰巧滚到的那一屏。
test("a shared screenshot lifts every height cap for the frame it captures", () => {
  assert.match(MAIN_CSS, /\.is-capturing \.app-section,\s*\.is-capturing \.pane-scroll\s*\{\s*max-height:\s*none;/);
  const layout = readSource("src/views/AppLayout.vue");
  assert.match(layout, /'is-capturing': isSharing/, "the class rides on the sharing flag");
  const capture = layout.slice(layout.indexOf('ref="captureTargetRef"'), layout.indexOf("<RouterView"));
  assert.match(capture, /is-capturing/, "and it sits on the captured subtree itself");
});

// 「主显示区的文字过于密集」的答案是行距和节奏，不是把字号吹大——上一轮正因为「都做那么大」
// 被否掉过。三个小档的行距必须 ≥ 1.45 倍，而字号阶梯一格没动。
test("the density fix is leading and rhythm, not a bigger type ramp", () => {
  const leading = Object.fromEntries(
    [...MAIN_CSS.matchAll(/--text-([\w-]+)--line-height:\s*([\d.]+)rem;/g)]
      .map(([, name, rem]) => [name, Number(rem) * 16]),
  );
  const sizes = { caption: 12, body: 14, title: 17, display: 22, hero: 34 };

  for (const step of ["caption", "body", "title"]) {
    const ratio = leading[step] / sizes[step];
    assert.ok(ratio >= 1.45, `--text-${step} leads at ${ratio.toFixed(2)}×, too tight for dense Chinese text`);
  }
  assert.match(MAIN_CSS, /--text-caption--letter-spacing:/, "the smallest step carries a hair of tracking");

  // 内边距是第二根杠杆。收敛之后它只有**一层**：卡片不再补贴任何一部分（分隔线要通到两边），
  // 所以区块自己那一个值就是文字到卡片外沿的全部距离，而它必须不小于当初定死的 20 / 24。
  const section = readSource("src/components/AppSection.vue");
  const card = readSource("src/components/AppCard.vue");
  const scale = (source, pattern) => {
    const hit = source.match(pattern);
    assert.ok(hit, `${pattern} not found`);
    return Number(hit[1]) * 4;
  };
  const cardTag = card.slice(card.indexOf("<section"), card.indexOf(">", card.indexOf("<section")));
  assert.doesNotMatch(cardTag, /(?:^|\s)(?:sm:|lg:)?p[xy]?-\d/, "the card must not pad; the bands do");
  const inset = { base: scale(section, /(?:^|[\s"])px-(\d+(?:\.\d+)?)/), sm: scale(section, /(?:^|[\s"])sm:px-(\d+(?:\.\d+)?)/) };
  assert.ok(inset.base >= 20, `phone inset is ${inset.base}px, under 20`);
  assert.ok(inset.sm >= 24, `pointer inset is ${inset.sm}px, under 24`);
  assert.match(section, /\bpt-4\b/);
});

// The line is a privacy assurance: it needs one permanent home, and exactly one.
test("the privacy assurance stays in the sidebar footer and is never duplicated", () => {
  const note = "数据只保存在本机浏览器";
  const carriers = readVueSources().filter(([, source]) => source.includes(note));

  assert.deepEqual(
    carriers.map(([path]) => path),
    ["src/components/AppSidebar.vue"],
    "the assurance must appear in exactly one component",
  );

  const sidebar = carriers[0][1];
  assert.equal(
    (sidebar.match(new RegExp(note, "g")) ?? []).length,
    2,
    "once as the visible line, once as its hover title",
  );

  const footer = sidebar.slice(sidebar.indexOf("<footer"), sidebar.indexOf("</footer>"));
  assert.match(footer, /mt-auto/, "the note anchors to the bottom of the nav, not to the page");
  assert.match(footer, /bg-divider/, "a rule is what makes it read as the sidebar's footer");

  const classLists = [...footer.matchAll(/:?class="([^"]*)"/g)].map(([, list]) => list).join(" ");
  assert.doesNotMatch(classLists, /\bhidden\b/, "the assurance must stay on screen");
});

test("dialogs keep their role, focus trap and Escape route", () => {
  for (const [file, trap] of [["LoginDialog", /focusFirstControl/], ["PrivacyModal", /handleDialogTab/]]) {
    const dialog = readSource(`src/components/${file}.vue`);
    assert.match(dialog, /role="dialog"/, `${file} must be a dialog`);
    assert.match(dialog, /aria-modal="true"/, `${file} must be modal`);
    // Escape 现在来自共享原语，而且是挂在 document 的捕获阶段上的——见下一条测试。
    assert.match(dialog, /useDismissable\(/, `${file} must close on Escape through the shared primitive`);
    assert.match(dialog, /useDocumentScrollLock/, `${file} must lock the page behind it`);
    assert.match(dialog, trap, `${file} must trap focus inside itself`);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 覆盖层的关闭方式是一条规则，不是每个组件各写一遍。
// 症状是账号菜单「点外面不关、按 Escape 不关」，根因有两个，而且都是**类**问题：
//   1. 那个铺在页面上的「透明遮罩按钮」是 `fixed inset-0`，但它的定位祖先是带
//      `backdrop-filter` 的顶栏——一个非 none 的 backdrop-filter 会给 fixed 后代造出
//      新的包含块，于是「全屏遮罩」实测只有 1016×56，只盖住了顶栏那一条；
//   2. `@keydown.esc` 挂在布局的 <div> 上，而 macOS 的 Chrome 点按钮不给按钮焦点，
//      键盘事件根本不经过那个 div。
// 两个坑都只能靠「document 级 + pointerdown + 焦点/路由」的共享原语一次性填掉。
const OVERLAYS = [
  ["src/components/AppTopBar.vue", "账号菜单"],
  ["src/components/LoginDialog.vue", "登录对话框"],
  ["src/components/PrivacyModal.vue", "隐私说明对话框"],
];

test("every dismissable overlay goes through the one shared primitive", () => {
  const composable = readSource("src/composables/useDismissable.js");
  assert.match(composable, /addEventListener/, "the primitive must listen on the document, not on a subtree");
  assert.match(composable, /document\[method\]\("pointerdown", onPointerDown, true\)/,
    "outside dismissal listens for pointerdown (so a text-selection drag survives), in the capture phase");
  assert.match(composable, /document\[method\]\("focusin", onFocusIn, true\)/, "focus leaving the overlay dismisses it");
  assert.match(composable, /document\[method\]\("keydown", onKeyDown, true\)/, "Escape is a document-level key handler");
  assert.match(composable, /route\.fullPath/, "a route change dismisses whatever is open");
  assert.match(composable, /target\?\.isConnected\) target\.focus/, "focus returns to the trigger");
  assert.match(composable, /stack\.at\(-1\) !== entry/, "Escape only reaches the topmost overlay");

  for (const [path, label] of OVERLAYS) {
    const source = readSource(path);
    assert.match(source, /useDismissable\(/, `${label} must adopt the shared primitive`);
  }

  // 对话框有焦点陷阱，焦点不会合法地离开它，所以只关掉这一条；外部按下（＝点遮罩）
  // 走的是和菜单同一条规则。
  for (const file of ["LoginDialog", "PrivacyModal"]) {
    assert.match(readSource(`src/components/${file}.vue`), /focusLeave: false/,
      `${file} keeps its focus trap, so the shared focus-leave rule is switched off explicitly`);
  }

  // 旧写法不许留下：既不许再铺「透明遮罩按钮」，也不许再把 Escape 挂在某个 DOM 子树上。
  // 那种按钮两次都是静默失效的：一次因为定位祖先带了 backdrop-filter，一次因为后面来了
  // 一个 `relative` 的兄弟节点把它整个盖住。
  for (const [path, source] of readVueSources()) {
    assert.doesNotMatch(
      source,
      /<button[^>]*class="[^"]*\binset-0\b[^"]*"/,
      `${path} re-introduces a full-screen click catcher; use useDismissable instead`,
    );
    assert.doesNotMatch(
      source,
      /@keydown\.esc/,
      `${path} binds Escape to a subtree; macOS Chrome does not focus a clicked button, so it never fires`,
    );
  }
});

// 触发器必须把状态说出来，否则读屏器只看到一个没有反馈的按钮。
test("the account menu trigger tracks its own expanded state", () => {
  const bar = readSource("src/components/AppTopBar.vue");
  assert.match(bar, /aria-haspopup="menu"/);
  assert.match(bar, /:aria-expanded="menuOpen"/, "aria-expanded must be bound to the same ref the panel is");
  assert.match(bar, /v-if="menuOpen"[\s\S]{0,400}role="menu"/, "the panel is the thing that ref opens");
});

test("charts respect prefers-reduced-motion and never loop", () => {
  assert.match(BASE_CSS, /\.chart-animate\s*\{/);
  const reduced = BASE_CSS.slice(BASE_CSS.indexOf("prefers-reduced-motion: reduce"));
  assert.match(reduced, /\.chart-animate/, "chart transitions must be disabled for reduced motion");

  // 会动的图形只有两种：到期分组里的色块（ExpiryLanes 自己画）和占比条（现在只有一个
  // ProgressTrack）。收敛之后 `chart-animate` 只出现在这两处——多一处就说明又有人手写了一条。
  const animators = readVueSources()
    .filter(([, source]) => source.includes("chart-animate"))
    .map(([path]) => path)
    .sort();
  assert.deepEqual(
    animators,
    ["src/components/ExpiryLanes.vue", "src/components/ProgressTrack.vue"],
    "only the two chart marks animate, and each is defined once",
  );
  for (const path of animators) {
    assert.doesNotMatch(readSource(path), /animation:/, `${path} must not run a looping animation`);
  }
});

// Anything the app worked out for itself has to say so, exactly the way QCI prints 8（推断）.
test("inferred conclusions are labelled as inferred and carry their reasoning", () => {
  const buckets = readSource("src/utils/usageBuckets.js");
  assert.match(buckets, /CARRY_OVER_LABEL = "本月底作废（推断）"/);
  assert.match(buckets, /CARRY_OVER_HINT/, "the label must be able to explain itself");

  const tag = readSource("src/components/NoticeTag.vue");
  assert.match(tag, /hint: \{ type: String, required: true \}/, "an amber badge without a reason is not allowed");
  assert.match(tag, /:title="hint"/);

  for (const file of ["ExpiryLanes", "ResourceTable"]) {
    const source = readSource(`src/components/${file}.vue`);
    assert.match(source, /expiry\.inferred/, `${file} must branch on whether the fact was inferred`);
    assert.match(source, /NoticeTag/, `${file} must render the badge`);
  }
});

// 钳位出来的百分比不是事实：对不上账的时候必须撤掉占比并明说，而不是画一条 100% 的条。
test("a section whose numbers do not reconcile loses its ratio and says so", () => {
  const buckets = readSource("src/utils/usageBuckets.js");
  assert.match(buckets, /remainPercent: total > 0 && !unreconciled\.length/);

  const hero = readSource("src/components/DashboardHero.vue");
  assert.match(hero, /const broken = section\.remainPercent === null/);
  assert.match(hero, /数字对不上/, "the degraded state must be named on screen");
  assert.match(hero, /<NoticeTag/, "and it must carry its explanation");
  assert.match(hero, /v-if="slot\.percent !== null"/, "no bar may be drawn from a clamped ratio");
  assert.match(hero, /v-if="slot\.prose"/, "a row of figures keeps its separators even without a ratio");

  for (const file of ["ExpiryLanes", "ResourceTable"]) {
    const source = readSource(`src/components/${file}.vue`);
    assert.match(source, /unreconciled/, `${file} must surface the mismatch`);
    assert.match(source, /钳位/, `${file} must say the bar was clamped`);
  }
});

// 「你的备注标注文字太多了，这也是之前导致首页看着很乱，信息很密集的原因之一。」
// 说明性的静态句子（以「。」结尾、模板里写死的一整句）是这类噪音的形状：它既不是数据，
// 也不随数据变，读者第二次来就不会再读它。规则因此是**结构性**的：视图里不许出现这种句子。
// 事实要么留在 title / EmptyNote 里（空态那三句是需求点名要区分的结论，它们经 props 传入，
// 不在模板里写死），要么就是可以从屏幕上直接看出来的、该删的复述。
test("no route paints a static explanatory sentence into its own template", () => {
  const VIEWS = ["DashboardView", "UsageView", "ServicesView", "SettingsView"];
  for (const name of VIEWS) {
    const source = readSource(`src/views/${name}.vue`);
    const template = source.slice(0, source.indexOf("<script"));
    for (const [, body] of template.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      if (body.includes("{{") || body.includes("<")) continue;
      assert.doesNotMatch(
        body,
        /。/,
        `${name} still writes an explanatory sentence into the page: ${body.trim().slice(0, 40)}…`,
      );
    }
  }

  // 那两条被点名要留下的除外：推断徽章是正确性披露，QCI 与签约速率的 title 是它的依据。
  assert.match(readSource("src/utils/usageBuckets.js"), /CARRY_OVER_LABEL = "本月底作废（推断）"/);
  const hero = readSource("src/components/DashboardHero.vue");
  assert.match(hero, /QCI_HINT/, "the QCI tooltip stays");
  assert.match(hero, /:title="fact\.hint"/, "and it is still attached to the fact it explains");
});

// 「运营商返回 0 条」和「压根没返回这个分组」是两种事实，空态必须说清是哪一种。
test("empty states distinguish a zero-record answer from a missing answer", () => {
  const empty = readSource("src/components/EmptyNote.vue");
  assert.match(empty, /title/);
  assert.match(empty, /text/);

  for (const file of ["src/views/DashboardView.vue", "src/views/UsageView.vue"]) {
    const source = readSource(file);
    assert.match(source, /present/, `${file} must branch on whether the block came back at all`);
    assert.match(source, /返回 0 条记录/, `${file} must name the zero-record case`);
    assert.match(source, /未取到/, `${file} must name the missing-block case`);
  }
});

// 不限量的包没有分母，永远不能出现在任何占比图里。
test("unmetered buckets never enter a proportion chart", () => {
  const buckets = readSource("src/utils/usageBuckets.js");
  assert.match(buckets, /const metered = entries\.filter\(\(entry\) => !entry\.unlimited/);
  assert.match(buckets, /remainPercent: unlimited \|\| !knownTotal \? null/);

  const table = readSource("src/components/ResourceTable.vue");
  assert.match(table, /entry\.unlimited \? "不限量"/, "an unmetered row shows a badge, never a ratio");
});

test("every UI string is Simplified Chinese", () => {
  // Static attributes only; `:aria-label="expr"` is a binding, not a literal string.
  const attributes = /(?<![:\w-])(?:aria-label|title|alt|placeholder)="([^"{}]+)"/g;
  for (const [path, source] of readVueSources()) {
    for (const [, value] of source.matchAll(attributes)) {
      if (!/[A-Za-z]/.test(value)) continue;
      assert.ok(/[一-龥]/.test(value), `${path} has a non-Chinese UI string: ${value}`);
    }
  }
});

test("no fixture or source names a real subscriber field", () => {
  const forbidden = /viceCardlist|usernumber|userMobile/;
  for (const [path, source] of readVueSources()) {
    assert.doesNotMatch(source, forbidden, `${path} reads a per-sub-card identifying field`);
  }
  for (const file of ["src/utils/usageBuckets.js", "src/utils/usageNames.js", "src/utils/chartScale.js"]) {
    assert.doesNotMatch(readSource(file), forbidden, `${file} reads a per-sub-card identifying field`);
  }
});
