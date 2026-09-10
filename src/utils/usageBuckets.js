// 看板的展示模型：把运营商原样返回的 OCS 分组，整理成「按到期时间分组的绝对量条」
// 需要的几何与文案。
//
// 三条必须守住的事实：
//   1. 「本月底作废」是从资源名里的「上月结转限本月使用」推断出来的，接口没有这个字段，
//      所以标签一律带（推断），措辞一旦对不上就退回按 endDate 分组，绝不假装知道。
//   2. 同名条目靠 (名称, 总量, 到期) 认身份，只有这三项也撞车时才退回下标，
//      否则刷新一次 ①②③ 就换了意思。
//   3. 绝不假设 剩余 + 已用 = 总量。对不上时钳位显示，并把这条明确标出来。
//
// 数据管线（src/domain、src/composables）不动，这里只做展示侧的推导。

import { detailKey, detailName, formatFlowFromMB, formatMinutes, toNum } from "../domain/usage.js";
import { gridRatios, niceScale, percent } from "./chartScale.js";
import { CARRY_OVER_MARK, isCarriedOver, splitResourceName } from "./usageNames.js";

const ORDINALS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
// 总量与「剩余＋已用」相差超过这个比例才算对不上；再小就是运营商的四舍五入。
const RECONCILE_TOLERANCE = 0.01;
// 窄过这个比例的色块在屏幕上只剩一根线，画出来反而误导，改由文字交代。
const MIN_SEGMENT_PERCENT = 0.6;
// 贴条标签之间至少要留出这么多水平空间才不会撞在一起。
const ANCHOR_GAP_PERCENT = 26;

export const CARRY_OVER_LABEL = "本月底作废（推断）";
export const CARRY_OVER_HINT =
  `依据资源名称中的「${CARRY_OVER_MARK}」推断，联通接口并未返回这条到期信息；`
  + "运营商换了措辞就会退回按接口的到期日期分组。";

export function ordinalMark(index) {
  return index < ORDINALS.length ? ORDINALS[index] : `(${index + 1})`;
}

// 刻度必须落在人读得出的整数上，所以尺子按展示单位算：流量超过 1GB 就以 GB 为单位取整刻度，
// 否则 0–80000MB 会印出 19.53 / 39.06 这种没人会念的刻度。
function trimmed(value, decimals) {
  return Number(value.toFixed(decimals)).toString();
}

const FLOW_UNIT = Object.freeze({
  id: "flow",
  countLabel: "个流量包",
  itemLabel: "流量包",
  parts(value) {
    return value >= 1024
      ? { value: (value / 1024).toFixed(2), unit: "GB" }
      : { value: value.toFixed(2), unit: "MB" };
  },
  text: (value) => formatFlowFromMB(value),
  bare: (value) => formatFlowFromMB(value),
  ruler: (max) => (max >= 1024 ? { divisor: 1024, suffix: "GB" } : { divisor: 1, suffix: "MB" }),
  tick: (value, decimals = value >= 10 ? 0 : 1) => trimmed(value, decimals),
});

const VOICE_UNIT = Object.freeze({
  id: "voice",
  countLabel: "个语音包",
  itemLabel: "语音包",
  parts: (value) => ({ value: String(Math.round(value)), unit: "分钟" }),
  text: (value) => formatMinutes(value),
  bare: (value) => String(Math.round(value)),
  ruler: () => ({ divisor: 1, suffix: "分钟" }),
  tick: (value) => String(Math.round(value)),
});

const SMS_UNIT = Object.freeze({
  id: "sms",
  countLabel: "个短信包",
  itemLabel: "短信包",
  parts: (value) => ({ value: String(Math.round(value)), unit: "条" }),
  text: (value) => `${Math.round(value)}条`,
  bare: (value) => String(Math.round(value)),
  ruler: () => ({ divisor: 1, suffix: "条" }),
  tick: (value) => String(Math.round(value)),
});

const SECTIONS = [
  { id: "flow", index: 0, label: "流量", unit: FLOW_UNIT, intervals: 4 },
  { id: "voice", index: 1, label: "语音", unit: VOICE_UNIT, intervals: 2 },
  { id: "sms", index: 2, label: "短信", unit: SMS_UNIT, intervals: 2 },
];

// —— 原始分组的合并 ——
// 口径直接复用 domain/usage.js 的 detailKey：resources 与 unshared 同下标合并，同一块只留一次。
// 两处各写一份就会出现「卡片里有、条形图里没有」这种对不上的情况。

function blockAt(data, index) {
  const resource = Array.isArray(data?.resources) ? data.resources[index] : null;
  const unshared = Array.isArray(data?.unshared) ? data.unshared[index] : null;
  const present = Boolean(resource) || Boolean(unshared);
  const details = [];
  const seen = new Set();

  for (const detail of [resource?.details, unshared?.details].flatMap((list) => (
    Array.isArray(list) ? list.filter(Boolean) : []
  ))) {
    const key = detailKey(detail);
    if (seen.has(key)) continue;
    seen.add(key);
    details.push(detail);
  }

  return { present, details, aggregate: resource ?? unshared ?? null };
}

// —— 到期时间 ——

const DATE_PATTERNS = [
  /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/,
  /^(\d{4})(\d{2})(\d{2})/,
];
const FOREVER = /长期|永久|不限期|无限期|不到期/;

function parseExpiryDate(text) {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const [year, month, day] = match.slice(1, 4).map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

function endOfMonth(now) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// 结转包的到期日只能推断；推断不出来的一律不认领，退回接口给的 endDate。
export function resolveExpiry(detail, now = new Date()) {
  const rawName = detailName(detail);
  const rawEnd = String(detail?.endDate ?? "").trim();
  const date = parseExpiryDate(rawEnd);

  if (isCarriedOver(rawName)) {
    return {
      kind: "carry-over",
      key: "carry-over",
      date: endOfMonth(now),
      label: CARRY_OVER_LABEL,
      inferred: true,
      hint: CARRY_OVER_HINT,
      tier: 1,
    };
  }

  if (date) {
    const sameMonth = date.slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return {
      kind: "date",
      key: `date:${date}`,
      date,
      label: `${date} 到期`,
      inferred: false,
      hint: `联通接口返回的到期时间：${rawEnd}`,
      tier: sameMonth ? 1 : 2,
    };
  }

  if (rawEnd && FOREVER.test(rawEnd)) {
    return {
      kind: "forever",
      key: "forever",
      date: "",
      label: "长期有效 · 不会到期",
      inferred: false,
      hint: `联通接口返回的到期时间：${rawEnd}`,
      tier: 3,
    };
  }

  return {
    kind: "unknown",
    key: "unknown",
    date: "",
    label: "到期时间未知",
    inferred: false,
    hint: "联通接口没有返回这批资源的到期时间，所以既不能说它长期有效，也不能说它快到期了。",
    tier: 4,
  };
}

const TIER_FILL = { 1: "bg-expiry-1", 2: "bg-expiry-2", 3: "bg-expiry-3", 4: "" };

// —— 条目 ——

// 空字符串是「没给」，不是 0：把它读成 0 会让一个 10GB 的包显示成剩余 0。
function reported(value) {
  const raw = String(value ?? "").trim();
  return raw === "" ? null : toNum(raw);
}

function readAmounts(detail) {
  return {
    total: reported(detail?.total),
    used: Math.max(0, reported(detail?.use) ?? 0),
    remain: reported(detail?.remain),
  };
}

// 用量明细只标**例外**，不标默认值：「通用」和「有上限」是绝大多数包的常态，把它们
// 逐行印出来等于每一行都挂两枚不带信息的 chip（实测富样本 8 行里 7 行因此折成两行）。
// 专属、其他、类型未知、不限量、共享属性都是例外，仍然逐条标出。
const FLOW_TYPES = { 1: "", 2: "专属", 3: "其他" };
const SHARE_MARKS = { 0: "共享", 1: "非共享" };

function entryTags(detail, unlimited, unit) {
  if (unit.id !== "flow") return [];
  const flowType = String(detail?.flowType ?? "").trim();
  const share = unlimited ? SHARE_MARKS[String(detail?.typemark ?? "").trim()] : "";
  return [
    FLOW_TYPES[flowType] ?? (flowType ? `流量(${flowType})` : "类型未知"),
    share,
    unlimited ? "无限量" : "",
  ].filter(Boolean);
}

function buildEntry(detail, index, unit, now) {
  const { name, chips, sizeChip, raw } = splitResourceName(detailName(detail));
  const unlimited = String(detail?.limited) === "1";
  const { total, used, remain } = readAmounts(detail);
  const knownTotal = !unlimited && Number.isFinite(total) && total > 0 ? total : 0;
  const knownRemain = Number.isFinite(remain) && remain >= 0 ? remain : null;
  const sum = used + (knownRemain ?? 0);
  const reconciled = !knownTotal
    || knownRemain === null
    || Math.abs(sum - knownTotal) <= Math.max(1, knownTotal * RECONCILE_TOLERANCE);

  // 钳位：条不能画出刻度，也不能出现负数段。
  const safeRemain = Math.min(knownRemain ?? Math.max(0, knownTotal - used), knownTotal);
  const safeUsed = Math.min(used, Math.max(0, knownTotal - safeRemain));

  return {
    key: "",
    index,
    ordinal: ordinalMark(index),
    name: name || (unit.id === "flow" ? "流量" : unit.id === "voice" ? "语音" : "短信"),
    rawName: raw,
    chips,
    sizeChip,
    tags: entryTags(detail, unlimited, unit),
    unlimited,
    total: knownTotal,
    used,
    remain: knownRemain ?? Math.max(0, knownTotal - used),
    barRemain: safeRemain,
    barUsed: safeUsed,
    reconciled,
    reportedSum: sum,
    expiry: resolveExpiry(detail, now),
    totalText: unlimited ? "不限量" : unit.text(knownTotal),
    usedText: unit.text(used),
    remainText: unlimited ? "不限量" : unit.text(knownRemain ?? Math.max(0, knownTotal - used)),
    // 不限量的包没有分母，所以永远不给占比，只给已用量。
    remainPercent: unlimited || !knownTotal ? null : percent(safeRemain, knownTotal),
    usedPercent: unlimited || !knownTotal ? null : percent(safeUsed, knownTotal),
  };
}

// (名称, 总量, 到期) 才是一条资源的身份；三项全撞才退回下标。
export function assignKeys(entries) {
  const used = new Set();
  return entries.map((entry) => {
    const base = `${entry.rawName}|${entry.unlimited ? "∞" : entry.total}|${entry.expiry.key}`;
    const key = used.has(base) ? `${base}#${entry.index}` : base;
    used.add(key);
    return { ...entry, key };
  });
}

// —— 到期分组 ——

// 一段一个标签：剩余段印剩余，已用段印已用；小到画不出来的已用量并进剩余标签，
// 免得一个看不见的色块下面孤零零挂着一个数字。
function laneLabels(entries, unit, scaleMax, numbered) {
  const labels = [];
  let cursor = 0;

  for (const entry of entries) {
    const prefix = numbered ? `${entry.ordinal} ` : "";
    const usedVisible = percent(entry.barUsed, scaleMax) >= MIN_SEGMENT_PERCENT;
    const trace = entry.barUsed > 0 && !usedVisible ? ` · 全月只用掉 ${unit.text(entry.barUsed)}` : "";

    if (entry.barRemain > 0) {
      labels.push({
        key: `${entry.key}:remain`,
        start: cursor,
        text: `${prefix}剩余 ${unit.bare(entry.barRemain)}${trace}`,
        strong: true,
      });
    }
    cursor += entry.barRemain;
    if (entry.barUsed > 0 && usedVisible) {
      labels.push({
        key: `${entry.key}:used`,
        start: cursor,
        text: `${entry.barRemain > 0 ? "" : prefix}已用 ${unit.bare(entry.barUsed)}`,
        strong: false,
      });
    }
    cursor += entry.barUsed;
  }

  return labels;
}

// 贴着条画的标签只在放得下时才贴；放不下就退回一行可换行的清单，绝不让两个数字叠在一起。
function anchorable(starts) {
  if (starts.length > 3) return false;
  if (starts.at(-1) > 72) return false;
  return starts.every((start, index) => index === 0 || start - starts[index - 1] >= ANCHOR_GAP_PERCENT);
}

function buildLane(key, entries, unit, scaleMax, numbered) {
  const [first] = entries;
  const segments = [];
  let cursor = 0;

  for (const entry of entries) {
    if (entry.barRemain > 0) {
      segments.push({
        key: `${entry.key}:remain`,
        tone: "remain",
        fill: TIER_FILL[first.expiry.tier],
        outlined: first.expiry.tier === 4,
        start: percent(cursor, scaleMax),
        size: percent(entry.barRemain, scaleMax),
        title: `${entry.name}：剩余 ${unit.text(entry.barRemain)}`,
      });
    }
    cursor += entry.barRemain;
    if (percent(entry.barUsed, scaleMax) >= MIN_SEGMENT_PERCENT) {
      segments.push({
        key: `${entry.key}:used`,
        tone: "used",
        fill: "bg-spent",
        outlined: false,
        start: percent(cursor, scaleMax),
        size: percent(entry.barUsed, scaleMax),
        title: `${entry.name}：已用 ${unit.text(entry.barUsed)}`,
      });
    }
    cursor += entry.barUsed;
  }

  const labels = laneLabels(entries, unit, scaleMax, numbered)
    .map((label) => ({ ...label, startPercent: percent(label.start, scaleMax) }));

  return {
    key,
    expiry: first.expiry,
    entries,
    count: entries.length,
    total: entries.reduce((sum, entry) => sum + entry.total, 0),
    used: entries.reduce((sum, entry) => sum + entry.used, 0),
    remain: entries.reduce((sum, entry) => sum + entry.remain, 0),
    amount: unit.parts(entries.reduce((sum, entry) => sum + entry.total, 0)),
    segments: segments.map((segment, index) => ({ ...segment, index })),
    labels,
    anchored: anchorable(labels.map((label) => label.startPercent)),
    unreconciled: entries.filter((entry) => !entry.reconciled),
  };
}

// 到期近的排前面：结转/本月内 → 有到期日 → 长期有效 → 到期未知。
function bucketByExpiry(entries) {
  const buckets = new Map();

  for (const entry of entries) {
    if (!buckets.has(entry.expiry.key)) buckets.set(entry.expiry.key, []);
    buckets.get(entry.expiry.key).push(entry);
  }

  return [...buckets.entries()].sort(([, first], [, second]) => (
    first[0].expiry.tier - second[0].expiry.tier
    || String(first[0].expiry.date).localeCompare(String(second[0].expiry.date))
  ));
}

// —— 坐标轴 ——

// 刻度的小数位由步长决定，不由每个刻度自己决定：0 / 7.5 / 15 / 23 / 30 这种参差不齐的
// 一串数字会让人以为刻度不等距。
function tickDecimals(step) {
  const fraction = String(step).split(".")[1] ?? "";
  return Math.min(2, fraction.length);
}

function buildAxis(ticks, divisor, suffix, unit, step) {
  const decimals = tickDecimals(step);
  return ticks.map((value, index) => {
    const last = index === ticks.length - 1;
    const text = unit.tick(value / divisor, decimals);
    return {
      key: `tick-${index}`,
      ratio: index / (ticks.length - 1),
      text: last ? `${text} ${suffix}` : text,
    };
  });
}

// —— 分组模型 ——

function buildSection(data, section, now) {
  const { present, details, aggregate } = blockAt(data, section.index);
  const usable = details.filter((detail) => (
    detail?.hide !== true && (section.id !== "flow" || String(detail?.elemType) === "3")
  ));
  const entries = assignKeys(usable.map((detail, index) => buildEntry(detail, index, section.unit, now)));
  const metered = entries.filter((entry) => !entry.unlimited && entry.total > 0);
  const unlimited = entries.filter((entry) => entry.unlimited);
  const undenominated = entries.filter((entry) => !entry.unlimited && entry.total <= 0);

  const unreconciled = entries.filter((entry) => !entry.reconciled);
  const total = metered.reduce((sum, entry) => sum + entry.total, 0);
  // 概览里的已用必须和总量同口径：不限量包没有分母，它的用量不能混进这个减法里，
  // 否则「已用 + 剩余」会对不上「总量」。消耗去向那张图是绝对量，那里才算全部。
  const used = metered.reduce((sum, entry) => sum + entry.used, 0);
  const usedAll = entries.reduce((sum, entry) => sum + entry.used, 0);
  const remain = metered.reduce((sum, entry) => sum + entry.remain, 0);
  // 全组同名时 lane 头部只报个数，编号就必须落到条下面的标签上；
  // lane 头部已经逐条列了名字和编号时再印一遍就是重复。
  const sameName = entries.length > 1 && entries.every((entry) => entry.name === entries[0].name);

  const buckets = bucketByExpiry(metered);
  const laneTotals = buckets.map(([, list]) => list.reduce((sum, entry) => sum + entry.total, 0));
  const peak = Math.max(0, ...laneTotals);
  const { divisor, suffix } = section.unit.ruler(peak);
  const scale = niceScale(peak / divisor, section.intervals);
  const scaleMax = scale.max * divisor;
  const groups = buckets.map(([key, list]) => (
    buildLane(key, list, section.unit, scaleMax, sameName || list.length > 1)
  ));

  return {
    id: section.id,
    label: section.label,
    unit: section.unit,
    present,
    aggregate,
    entries,
    metered,
    unlimited,
    undenominated,
    groups,
    scaleMax,
    scaleSuffix: suffix,
    axis: scale.ticks.length
      ? buildAxis(scale.ticks.map((tick) => tick * divisor), divisor, suffix, section.unit, scale.step)
      : [],
    grid: gridRatios(scale.ticks.length),
    total,
    used,
    usedAll,
    remain,
    // 数字对不上的时候占比只能靠钳位算出来，那就不是事实了：宁可不给百分比，也不给一个假的。
    remainPercent: total > 0 && !unreconciled.length
      ? Math.max(0, Math.min(100, (remain / total) * 100))
      : null,
    totalText: section.unit.text(total),
    usedText: section.unit.text(used),
    usedAllText: section.unit.text(usedAll),
    remainParts: section.unit.parts(remain),
    countText: unlimited.length
      ? `${entries.length} ${section.unit.countLabel}（${unlimited.length} 个不限量）`
      : `${entries.length} ${section.unit.countLabel}`,
    unreconciled,
    hasData: entries.length > 0,
    // 同名条目靠返回顺序区分，所以编号规则必须写在卡片上，而不是留给人猜。
    note: sameName
      ? `运营商返回 ${entries.length} 条同名「${entries[0].name}」，按返回顺序编号 ${entries.map((entry) => entry.ordinal).join("")}`
      : "",
  };
}

export function buildUsageModel(data, now = new Date()) {
  const [flow, voice, sms] = SECTIONS.map((section) => buildSection(data, section, now));
  return {
    ok: Boolean(data),
    plan: String(data?.packageName ?? "").trim(),
    flow,
    voice,
    sms,
    unreconciled: [flow, voice, sms].flatMap((section) => section.unreconciled),
  };
}
