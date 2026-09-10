<template>
  <PagePanel :title="title" :hint="caption" :body-class="bodyClass">
    <template #meta>
      <p v-if="section.groups.length > 1" class="ml-auto shrink-0 text-caption text-on-surface-muted">
        合计<span class="ml-2 text-body text-on-surface tabular-nums">{{ totalText }}</span>
      </p>
    </template>

    <div v-if="section.groups.length" class="flex grow flex-col">
      <div
        v-for="lane in section.groups"
        :key="lane.key"
        class="border-t border-divider pb-2.5 pt-3 first:border-t-0 first:pt-0"
      >
        <!-- 到期时间和这条 lane 的合计是一对，永远同行；包名和 chip 单独占一行。原先三样挤在
             一行，窄栏一换行就把合计孤零零甩到最后一行，也正是「文字过于密集」的来源。 -->
        <div class="flex items-baseline gap-x-3">
          <NoticeTag v-if="lane.expiry.inferred" :label="lane.expiry.label" :hint="lane.expiry.hint" />
          <span
            v-else
            class="min-w-0 truncate text-body text-on-surface tabular-nums"
            :title="lane.expiry.hint"
          >{{ lane.expiry.label }}</span>

          <span v-if="collapsed" class="shrink-0 text-caption text-on-surface-muted">{{ lane.count }} 个包</span>

          <span class="ml-auto shrink-0 text-title text-on-surface tabular-nums">
            {{ lane.amount.value }} {{ lane.amount.unit }}
          </span>
        </div>

        <p
          v-if="!collapsed"
          class="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1.5 text-caption text-on-surface-variant"
        >
          <template v-for="(entry, index) in lane.entries" :key="entry.key">
            <span v-if="index" class="text-on-surface-muted" aria-hidden="true">＋</span>
            <!-- 编号和名字必须一起换行，否则长名字会把编号孤零零留在上一行。 -->
            <span class="flex min-w-0 items-baseline gap-1.5">
              <span v-if="numbered" class="shrink-0 text-on-surface-muted tabular-nums">{{ entry.ordinal }}</span>
              <span class="min-w-0 truncate" :title="entry.rawName">{{ entry.name }}</span>
            </span>
            <DataChip v-for="chip in entry.chips" :key="chip" :text="chip" />
          </template>
        </p>

        <div
          class="relative mt-2 h-4.5"
          role="img"
          :aria-label="laneSummary(lane)"
        >
          <span
            v-for="(line, index) in section.grid"
            :key="index"
            class="absolute -top-0.5 -bottom-0.5 w-px bg-divider"
            :style="{ left: `${line * 100}%` }"
            aria-hidden="true"
          ></span>
          <span
            v-for="segment in lane.segments"
            :key="segment.key"
            class="chart-animate absolute top-0 h-4.5 rounded-chip"
            :class="[segment.fill, segment.outlined ? 'border border-dashed border-outline' : 'mark-edge']"
            :style="segmentStyle(segment)"
            :title="segment.title"
            aria-hidden="true"
          ></span>
        </div>

        <p
          v-if="lane.anchored"
          class="relative mt-1.5 h-5 text-caption text-on-surface-variant"
        >
          <span
            v-for="label in lane.labels"
            :key="label.key"
            class="absolute top-0 whitespace-nowrap tabular-nums"
            :class="label.strong ? 'text-on-surface' : ''"
            :style="{ left: `${label.startPercent}%` }"
          >{{ label.text }}</span>
        </p>
        <p
          v-else
          class="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption text-on-surface-variant"
        >
          <span
            v-for="label in lane.labels"
            :key="label.key"
            class="whitespace-nowrap tabular-nums"
            :class="label.strong ? 'text-on-surface' : ''"
          >{{ label.text }}</span>
        </p>

        <p
          v-if="lane.unreconciled.length"
          class="mt-1.5 flex items-baseline gap-1.5 text-caption text-on-warning-container"
        >
          <TriangleAlert :size="12" :stroke-width="1.6" class="shrink-0 translate-y-0.5 text-warning-ink" aria-hidden="true" />
          <span>{{ reconcileText(lane) }}</span>
        </p>
      </div>

      <!-- 刻度尺留在滚动区里，和条形共用同一个内容盒：面板出现滚动条时两者一起变窄，刻度才
           不会和条形错位。mt-auto 把它钉在面板底边——被拉伸补白时空白落在条形和刻度之间，
           读起来是图表的绘图区，而不是一段悬空的死角。 -->
      <p class="relative mt-auto h-6 border-t border-divider pt-1.5 text-caption text-on-surface-muted">
        <span
          v-for="(tick, index) in section.axis"
          :key="tick.key"
          class="absolute top-1 whitespace-nowrap tabular-nums"
          :class="index === 0 ? '' : index === section.axis.length - 1 ? '-translate-x-full' : '-translate-x-1/2'"
          :style="{ left: `${tick.ratio * 100}%` }"
        >{{ tick.text }}</span>
      </p>
    </div>

    <EmptyNote v-else :title="emptyTitle" :text="emptyText" />

    <template v-if="section.unlimited.length || section.note" #footer>
      <!-- 「没有分母就画不出占比」这句解释挪进了 title：事实一条不少，屏幕上少一行小字。 -->
      <p
        v-if="section.unlimited.length"
        class="border-t border-divider pt-2.5 text-caption leading-relaxed text-on-surface-variant"
        title="不限量资源没有分母，画不出占比，所以不进条形图，只报绝对已用量"
      >
        <span class="text-on-surface">不限量资源不进条形图</span>
        <span v-for="entry in section.unlimited" :key="entry.key" class="ml-1.5 whitespace-nowrap tabular-nums">
          {{ entry.name }} 已用 {{ entry.usedText }}
        </span>
      </p>

      <p
        v-if="section.note"
        class="border-t border-divider pt-2.5 text-caption leading-relaxed text-on-surface-muted"
        :class="section.unlimited.length ? 'mt-2.5' : ''"
      >
        {{ section.note }}
      </p>
    </template>
  </PagePanel>
</template>

<script setup>
import { computed } from "vue";
import { TriangleAlert } from "@lucide/vue";
import DataChip from "@/components/DataChip.vue";
import EmptyNote from "@/components/EmptyNote.vue";
import NoticeTag from "@/components/NoticeTag.vue";
import PagePanel from "@/components/PagePanel.vue";

// 相邻色块之间留一道缝，否则两个包会读成一个包。缝从后一段身上扣，起点不动，刻度才准。
const SEGMENT_GAP_PX = 2;

const props = defineProps({
  section: { type: Object, required: true },
  title: { type: String, required: true },
  caption: { type: String, default: "" },
  emptyTitle: { type: String, required: true },
  emptyText: { type: String, required: true },
  bodyClass: { type: String, default: "" },
});

const totalText = computed(() => `${props.section.unit.parts(props.section.total).value} ${props.section.unit.parts(props.section.total).unit}`);
// 全组同名时逐条列名字只是把同一个词印三遍，不如直接报个数，编号留给条下面的标签。
const collapsed = computed(() => Boolean(props.section.note));
// 只有一条资源时编号没有区分作用，印出来只是噪音。
const numbered = computed(() => props.section.entries.length > 1);

function segmentStyle(segment) {
  const gap = segment.index === 0 ? 0 : SEGMENT_GAP_PX;
  return {
    left: `calc(${segment.start}% + ${gap}px)`,
    width: `max(2px, calc(${segment.size}% - ${gap}px))`,
  };
}

function laneSummary(lane) {
  return `${lane.expiry.label}：合计 ${lane.amount.value}${lane.amount.unit}，`
    + lane.labels.map((label) => label.text).join("，");
}

function reconcileText(lane) {
  const unit = props.section.unit;
  return lane.unreconciled
    .map((entry) => (
      `${entry.name} 的剩余 ${unit.text(entry.remain)} 加已用 ${unit.text(entry.used)} `
      + `对不上总量 ${unit.text(entry.total)}，条形按总量钳位显示`
    ))
    .join("；");
}
</script>
