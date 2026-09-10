<template>
  <PagePanel :title="section.label">
    <template #meta>
      <p class="min-w-0 text-caption text-on-surface-muted">{{ section.countText }}</p>
      <p v-if="section.total > 0" class="ml-auto shrink-0 text-caption text-on-surface-muted">
        剩余<span class="mx-2 text-body text-on-surface tabular-nums">{{ section.unit.text(section.remain) }}</span>
        / 总量 <span class="tabular-nums">{{ section.totalText }}</span>
      </p>
    </template>

    <template v-if="rows.length">
      <p class="resource-row resource-row--head text-caption text-on-surface-muted" aria-hidden="true">
        <span class="cell-name">名称</span>
        <span class="cell-expiry">到期</span>
        <span class="cell-remain">剩余</span>
        <span class="cell-used">已用</span>
        <span class="cell-total">总量</span>
        <span class="cell-bar">剩余占比</span>
      </p>

      <ul>
        <li
          v-for="row in rows"
          :key="row.key"
          data-resource-row="row"
          class="resource-row border-t border-divider py-2.5"
        >
          <span class="cell-name flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span v-if="rows.length > 1" class="shrink-0 text-caption text-on-surface-muted tabular-nums">{{ row.ordinal }}</span>
            <span class="min-w-0 truncate text-body text-on-surface" :title="row.rawName">{{ row.name }}</span>
            <DataChip v-for="chip in row.chips" :key="chip" :text="chip" />
            <DataChip
              v-for="tag in row.tags"
              :key="tag"
              :text="tag"
              :tone="tag === '无限量' ? 'accent' : 'quiet'"
            />
          </span>

          <span class="cell-expiry min-w-0 text-caption text-on-surface-variant tabular-nums">
            <NoticeTag v-if="row.expiry.inferred" :label="row.expiry.label" :hint="row.expiry.hint" />
            <span v-else class="truncate" :title="row.expiry.hint">{{ row.expiry.label }}</span>
          </span>

          <span class="cell-remain text-body text-on-surface tabular-nums">
            <span class="text-caption text-on-surface-muted sm:sr-only">剩余</span>
            {{ row.remainText }}
          </span>
          <span class="cell-used text-body text-on-surface-variant tabular-nums">
            <span class="text-caption text-on-surface-muted sm:sr-only">已用</span>
            {{ row.usedText }}
          </span>
          <span class="cell-total text-body text-on-surface-variant tabular-nums">
            <span class="text-caption text-on-surface-muted sm:sr-only">总量</span>
            {{ row.totalText }}
          </span>

          <span class="cell-bar flex min-w-0 items-center gap-2">
            <span
              class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-chip bg-surface-sunken"
              role="img"
              :aria-label="row.barLabel"
              :title="row.barLabel"
            >
              <!-- 条的颜色是这一节资源种类的分类色；不限量的包没有分母，用同一个色相扫过的
                   不确定进度条，而不是一条画到底的实条。 -->
              <span
                class="chart-animate block h-full rounded-chip"
                :class="[sectionFill, row.unlimited ? 'progress-unlimited' : '']"
                :style="{ width: `${row.remainPercent ?? 100}%` }"
              ></span>
            </span>
            <span class="w-11 shrink-0 text-right text-caption text-on-surface-variant tabular-nums">{{ row.percentText }}</span>
          </span>
        </li>
      </ul>

      <p
        v-if="section.unreconciled.length"
        class="mt-2.5 flex items-baseline gap-1.5 border-t border-divider pt-2.5 text-caption leading-relaxed text-on-warning-container"
      >
        <TriangleAlert :size="12" :stroke-width="1.6" class="shrink-0 translate-y-0.5 text-warning-ink" aria-hidden="true" />
        <span>{{ section.unreconciled.length }} 条资源的「剩余＋已用」与总量对不上，占比条按总量钳位显示，数字仍是运营商原样返回的。</span>
      </p>
      <p v-if="section.note" class="mt-2.5 border-t border-divider pt-2.5 text-caption leading-relaxed text-on-surface-muted">
        {{ section.note }}
      </p>
    </template>

    <EmptyNote v-else :title="emptyTitle" :text="emptyText" />
  </PagePanel>
</template>

<script setup>
import { computed } from "vue";
import { TriangleAlert } from "@lucide/vue";
import DataChip from "@/components/DataChip.vue";
import EmptyNote from "@/components/EmptyNote.vue";
import NoticeTag from "@/components/NoticeTag.vue";
import PagePanel from "@/components/PagePanel.vue";

const props = defineProps({
  section: { type: Object, required: true },
  emptyTitle: { type: String, required: true },
  emptyText: { type: String, required: true },
});

// 分类色板按资源种类固定分配，和看板概览那三条一致，永远不轮换。类名必须是字面量，
// Tailwind 只扫源码里真正出现过的候选串。
const SECTION_FILL = { flow: "bg-series-1", voice: "bg-series-2", sms: "bg-series-3" };
const sectionFill = computed(() => SECTION_FILL[props.section.id] ?? "bg-series-1");

const rows = computed(() => props.section.entries.map((entry) => ({
  ...entry,
  // 不限量的包没有分母，所以永远不给百分比，只给一个不确定进度的条和一枚 chip。
  percentText: entry.unlimited ? "不限量" : entry.remainPercent === null ? "—" : `${entry.remainPercent.toFixed(1)}%`,
  barLabel: entry.unlimited
    ? `${entry.name}：不限量，没有分母，无法给出剩余占比`
    : `${entry.name}：剩余 ${entry.remainText}，已用 ${entry.usedText}，总量 ${entry.totalText}`,
})));
</script>

<style scoped>
/* One DOM order, two layouts: the phone stacks name, expiry, then a three-up figure row;
   pointer widths line every column up so the figures can be compared down the page. */
.resource-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-areas:
    "name name name"
    "expiry expiry expiry"
    "remain used total"
    "bar bar bar";
  align-items: baseline;
  gap: 4px 12px;
}

.resource-row--head {
  display: none;
}

.cell-name { grid-area: name; }
.cell-expiry { grid-area: expiry; }
.cell-remain { grid-area: remain; }
.cell-used { grid-area: used; }
.cell-total { grid-area: total; }
.cell-bar { grid-area: bar; align-self: center; }

@media (min-width: 48rem) {
  .resource-row {
    grid-template-columns: minmax(0, 1.6fr) 10.5rem 5.5rem 5.5rem 5.5rem minmax(7rem, 1fr);
    grid-template-areas: "name expiry remain used total bar";
    align-items: center;
    gap: 0 12px;
  }

  .resource-row--head {
    display: grid;
  }

  .cell-remain,
  .cell-used,
  .cell-total,
  .resource-row--head .cell-remain,
  .resource-row--head .cell-used,
  .resource-row--head .cell-total {
    text-align: right;
  }
}
</style>
