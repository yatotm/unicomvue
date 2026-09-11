<template>
  <!-- 三块 band，都是卡片的直接子元素：抬头 / 主数字 / 四个事实。它们之间的横线由 AppCard 的
       divide-y 画，band 内部的竖缝和横线由 .ui-seams 的 1px gap 画。这一整块以前是
       「一行标题 + 两张 6px 的嵌套小卡」。 -->
  <PageHeader>
    <template #title>
      <!-- 手机上套餐名独占一行，剩下的状态和计数才排得进第二行。 -->
      <h2 class="flex min-w-0 max-w-full max-sm:basis-full">
        <button
          type="button"
          class="-mx-2 flex min-h-11 min-w-0 touch-manipulation select-none items-center gap-1.5 rounded-control px-2 text-left sm:min-h-9"
          :class="[PAGE_TITLE, TRANSITION, FOCUS_RING_INSET, HOVER_OVERLAY]"
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
    </template>

    <StatusChip :tone="statusKind === 'error' ? 'danger' : 'accent'" dot :text="statusText" />
    <StatusChip
      v-if="hasLimitService"
      tone="danger"
      dot
      text="限速服务"
      hint="已订业务中检测到“限速服务(50027)”，该业务会压低上网速率"
    />

    <p v-if="serviceCount" class="ml-auto shrink-0 text-caption text-on-surface-muted">
      已订业务<span class="ml-1.5 text-body text-on-surface tabular-nums">{{ serviceCount }} 项</span>
    </p>
  </PageHeader>

  <div :class="HERO_BAND">
    <div
      v-for="(slot, index) in slots"
      :key="slot.id"
      class="flex min-w-0 flex-col gap-1 px-5 py-4 sm:px-6"
      :class="index === 0 ? 'max-sm:col-span-2' : ''"
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
      <ProgressTrack
        v-if="slot.percent !== null"
        class="mt-1.5"
        :fill="slot.mark"
        :percent="slot.percent"
        :label="`${slot.label}，条形占比 ${slot.percent.toFixed(1)}%`"
      />

      <!-- 数字之间用点隔开且不换行；散文式的说明必须能换行，否则窄格子会把它切掉。
           判据是这一格印的是数字还是句子，不是有没有占比——对不上账的格子仍然是一排数字。 -->
      <SectionNote v-if="slot.prose" class="mt-3">{{ slot.facts.join("") }}</SectionNote>
      <!-- 分隔点必须和它后面那条事实绑在一起换行。原先它们是两个相邻的行内元素，窄格子
           一换行就把「·」孤零零留在上一行的行尾。 -->
      <p v-else class="mt-1.5 flex flex-wrap items-baseline text-caption text-on-surface-variant">
        <span v-for="(fact, factIndex) in slot.facts" :key="fact" class="whitespace-nowrap tabular-nums">
          <span v-if="factIndex" class="px-1.5 text-on-surface-muted" aria-hidden="true">·</span>{{ fact }}
        </span>
      </p>
    </div>
  </div>

  <dl :class="FACT_BAND">
    <div
      v-for="fact in facts"
      :key="fact.key"
      class="flex min-w-0 flex-col gap-0.5 px-5 py-3 sm:px-6"
      :title="fact.hint"
    >
      <dt class="text-caption text-on-surface-muted">{{ fact.label }}</dt>
      <dd class="truncate text-title text-on-surface tabular-nums">{{ fact.value }}</dd>
    </div>
  </dl>
</template>

<script setup>
import { computed } from "vue";
import { Copy } from "@lucide/vue";
import NoticeTag from "@/components/NoticeTag.vue";
import PageHeader from "@/components/PageHeader.vue";
import ProgressTrack from "@/components/ProgressTrack.vue";
import SectionNote from "@/components/SectionNote.vue";
import StatusChip from "@/components/StatusChip.vue";
import { FACT_BAND, FOCUS_RING_INSET, HERO_BAND, HOVER_OVERLAY, PAGE_TITLE, TRANSITION } from "@/utils/ui";

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
</script>
