<template>
  <div class="flex min-w-0 flex-col gap-2 sm:gap-3">
    <!-- 套餐抬头是整张卡片的标题行，直接落在托盘上：它不该也被包成一块圆角区域，否则页面读起来
         就是一摞并列的盒子，而不是「一张卡片 + 里面的几块区域」。 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-1 sm:px-5">
      <!-- 手机上套餐名独占一行，剩下的状态和计数才排得进第二行。 -->
      <h2 class="flex min-w-0 max-w-full max-sm:basis-full">
        <button
          type="button"
          class="-mx-2 flex min-h-11 min-w-0 touch-manipulation select-none items-center gap-1.5 rounded-control px-2 text-left text-title text-on-surface transition-colors duration-150 ease-standard hover:bg-hover-overlay active:bg-pressed-overlay focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:min-h-9 sm:text-display"
          :title="tokenButtonTitle"
          aria-label="点击复制 onlin_token，长按复制 ecs_token"
          @click="emit('copy-onlin', $event)"
          @pointerdown="emit('press-start', $event)"
          @pointerup="emit('press-end', $event)"
          @pointerleave="emit('press-cancel')"
          @pointercancel="emit('press-cancel')"
          @contextmenu.prevent
          @dragstart.prevent
        >
          <span class="min-w-0 truncate">{{ plan || "余量 / 用量展示" }}</span>
          <Copy :size="13" class="shrink-0 text-on-surface-muted" aria-hidden="true" />
        </button>
      </h2>

      <p
        class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-chip px-2.5 text-caption"
        :class="statusClass"
      >
        <span class="size-1.5 shrink-0 rounded-chip" :class="statusDotClass" aria-hidden="true"></span>
        <span class="min-w-0 truncate">{{ statusText }}</span>
      </p>

      <p
        v-if="hasLimitService"
        class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-chip bg-danger-container px-2.5 text-caption text-on-danger-container"
        title="已订业务中检测到“限速服务(50027)”，该业务会压低上网速率"
      >
        <span class="size-1.5 shrink-0 rounded-chip bg-danger" aria-hidden="true"></span>
        限速服务
      </p>

      <p v-if="serviceCount" class="ml-auto shrink-0 text-caption text-on-surface-muted">
        已订业务<span class="ml-1.5 text-body text-on-surface tabular-nums">{{ serviceCount }} 项</span>
      </p>
    </div>

    <div class="hero-grid overflow-hidden rounded-control bg-surface-raised">
      <div
        v-for="(slot, index) in slots"
        :key="slot.id"
        class="flex min-w-0 flex-col gap-1 px-4 py-3.5 sm:px-5"
        :class="index ? 'border-divider sm:border-l' : ''"
      >
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-on-surface-muted">
          <span class="min-w-0">{{ slot.label }}</span>
          <NoticeTag v-if="slot.notice" :label="slot.notice" :hint="slot.noticeHint" />
        </p>

        <p v-if="index === 0 && slot.figure" class="flex items-baseline gap-1.5">
          <span class="text-hero text-on-surface tabular-nums">{{ slot.figure }}</span>
          <span class="text-body text-on-surface-variant">{{ slot.unit }}</span>
        </p>
        <p v-else class="flex items-baseline gap-1.5">
          <span class="text-display tabular-nums" :class="slot.figure ? 'text-on-surface' : 'text-on-surface-variant'">
            {{ slot.figure || slot.fallback }}
          </span>
          <span v-if="slot.figure" class="text-caption text-on-surface-variant">{{ slot.unit }}</span>
        </p>

        <!-- 条的颜色跟着「资源种类」这个实体走，不跟着它排到第几格：分组少一个的时候，
             剩下两格的颜色不会跟着换。 -->
        <div
          v-if="slot.percent !== null"
          class="mt-1 h-2 overflow-hidden rounded-chip bg-surface-sunken shadow-e1"
          role="img"
          :aria-label="`${slot.label}，条形占比 ${slot.percent.toFixed(1)}%`"
        >
          <span
            class="chart-animate block h-full rounded-chip"
            :class="slot.mark"
            :style="{ width: `${slot.percent}%` }"
          ></span>
        </div>

        <!-- 数字之间用点隔开且不换行；散文式的说明必须能换行，否则窄格子会把它切掉。
             判据是这一格印的是数字还是句子，不是有没有占比——对不上账的格子仍然是一排数字。 -->
        <p v-if="slot.prose" class="mt-3 text-caption leading-relaxed text-on-surface-variant">
          {{ slot.facts.join("") }}
        </p>
        <p v-else class="mt-1 flex flex-wrap items-baseline text-caption text-on-surface-variant">
          <template v-for="(fact, factIndex) in slot.facts" :key="fact">
            <span v-if="factIndex" class="px-1.5 text-on-surface-muted" aria-hidden="true">·</span><span class="whitespace-nowrap tabular-nums">{{ fact }}</span>
          </template>
        </p>
      </div>
    </div>

    <dl class="fact-grid overflow-hidden rounded-control bg-surface-raised">
      <div
        v-for="(fact, index) in facts"
        :key="fact.key"
        class="flex min-w-0 flex-col gap-0.5 px-4 py-3 sm:px-5"
        :class="factBorderClass(index)"
        :title="fact.hint"
      >
        <dt class="text-caption text-on-surface-muted">{{ fact.label }}</dt>
        <dd class="truncate text-title text-on-surface tabular-nums">{{ fact.value }}</dd>
      </div>
    </dl>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Copy } from "@lucide/vue";
import NoticeTag from "@/components/NoticeTag.vue";

const QCI_HINT = "QCI 由已订购的网络质量业务推断：VVIP → 6，VIP → 8，两者都没有 → 9；"
  + "接口若明确返回 QCI 则以接口为准，拿不到业务列表时显示未确认。签约速率与 QCI 无关。";
const NETWORK_QUALITY_HINT = "联通已订业务接口返回的网络质量业务等级（VIP / VVIP），左侧 QCI 正是由它推断得出。";
const LAST_REFRESH_HINT = "最近一次成功查询余量的本机时间，默认每 30 秒自动刷新一次。";

const props = defineProps({
  model: { type: Object, required: true },
  plan: { type: String, default: "" },
  statusText: { type: String, default: "" },
  statusKind: { type: String, default: "info" },
  hasLimitService: { type: Boolean, default: false },
  serviceCount: { type: Number, default: 0 },
  lastUpdatedAt: { type: String, default: "—" },
  signedRate: { type: String, default: "—" },
  signedRateTitle: { type: String, default: "" },
  qciLevel: { type: String, default: "—" },
  networkQuality: { type: String, default: "" },
  tokenButtonTitle: { type: String, default: "" },
});

const emit = defineEmits(["copy-onlin", "press-start", "press-end", "press-cancel"]);

const statusClass = computed(() => (
  props.statusKind === "error"
    ? "bg-danger-container text-on-danger-container"
    : "bg-primary-container text-on-primary-container"
));
const statusDotClass = computed(() => (props.statusKind === "error" ? "bg-danger" : "bg-primary"));

// 分类色板按「资源种类」固定分配，永远不轮换：分组重新排序（有额度的排前面）时颜色跟着实体走。
const SECTION_MARK = { flow: "bg-series-1", voice: "bg-series-2", sms: "bg-series-3" };

// 有额度的分组排前面，第一格才是这一屏唯一的 34px 主数字。
// 次要格子只有一半宽，硬塞三个事实会折成三行，所以那里省掉总量——占比已经说了同一件事。
function describe(section, isHero) {
  const { label } = section;
  const mark = SECTION_MARK[section.id] ?? "bg-series-1";

  if (section.total > 0) {
    // 运营商的剩余、已用、总量对不上时，占比只能靠钳位算出来——那就不是事实了。
    // 数字照印（那确实是接口返回的），但百分比和条形一并撤掉，并挂上降级提示。
    const broken = section.remainPercent === null;
    return {
      id: section.id,
      mark,
      label: broken ? `${label}剩余` : `${label}剩余 · 占总量 ${section.remainPercent.toFixed(1)}%`,
      notice: broken ? "数字对不上" : "",
      prose: false,
      noticeHint: broken
        ? `运营商返回的剩余与已用加起来对不上总量，${section.unreconciled.length} 条资源不一致，`
          + "所以这里不给占比；条形按总量钳位显示，数字仍是接口原样返回的。"
        : "",
      figure: section.remainParts.value,
      unit: section.remainParts.unit,
      fallback: "",
      percent: section.remainPercent,
      facts: [
        `已用 ${section.usedText}`,
        ...(isHero ? [`总量 ${section.totalText}`] : []),
        section.countText,
      ],
    };
  }

  if (section.unlimited.length) {
    return {
      id: section.id,
      mark,
      label: `${label} · 不限量`,
      notice: "",
      noticeHint: "",
      prose: true,
      figure: "",
      unit: "",
      fallback: "不限量",
      percent: null,
      facts: [`已用 ${section.usedText}`, `${section.unlimited.length} 个不限量包`],
    };
  }

  return {
    id: section.id,
    mark,
    label,
    notice: "",
    noticeHint: "",
    prose: true,
    figure: "",
    unit: "",
    fallback: section.present ? "未订购" : "未取到",
    percent: null,
    facts: section.present
      ? [`本套餐不含${label}资源，运营商返回 0 条记录。`]
      : [`运营商没有返回${label}分组，可稍后刷新重试。`],
  };
}

const slots = computed(() => {
  const sections = [props.model.flow, props.model.voice, props.model.sms];
  const ranked = [
    ...sections.filter((section) => section.total > 0),
    ...sections.filter((section) => section.total <= 0),
  ];
  return ranked.map((section, index) => describe(section, index === 0));
});

const facts = computed(() => [
  { key: "last", label: "上次刷新", value: props.lastUpdatedAt, hint: LAST_REFRESH_HINT },
  { key: "rate", label: "签约速率", value: props.signedRate, hint: props.signedRateTitle },
  { key: "qci", label: "QCI", value: props.qciLevel, hint: QCI_HINT },
  { key: "quality", label: "网络质量业务", value: props.networkQuality || "—", hint: NETWORK_QUALITY_HINT },
]);

function factBorderClass(index) {
  return [
    index % 2 ? "border-l border-divider" : "",
    index >= 2 ? "border-t border-divider sm:border-t-0" : "",
    index && index % 2 === 0 ? "sm:border-l sm:border-divider" : "",
  ].filter(Boolean).join(" ");
}
</script>

<style scoped>
/* The hero figure gets the wider cell; below `sm:` it takes the whole row so 34px never has to
   compete with a second number for the same line. */
.hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.hero-grid > :first-child {
  grid-column: 1 / -1;
  border-bottom: 1px solid var(--ui-divider);
}

.fact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

@media (min-width: 40rem) {
  .hero-grid {
    grid-template-columns: 1.5fr 1fr 1fr;
  }

  .hero-grid > :first-child {
    grid-column: auto;
    border-bottom: 0;
  }

  .fact-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
