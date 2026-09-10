<template>
  <!-- 每个分组是外层卡片里的一块圆角区域：两列 grid 天然把同一行的两个分组拉到同一条底边，
       短的补白、长的在自己格子里滚动，区域之间是一道缝而不是发丝线。 -->
  <div v-if="loaded && groups.length" class="grid min-w-0 grow gap-2 sm:gap-3 @[48rem]:grid-cols-2">
    <PagePanel
      v-for="group in groups"
      :key="group.id"
      :title="group.title"
      body-class="@[48rem]:max-h-96"
    >
      <template #meta>
        <span class="shrink-0 text-caption text-on-surface-muted tabular-nums">{{ group.items.length }} 项</span>
      </template>

      <ul>
        <li
          v-for="(item, index) in group.items"
          :key="item.key"
          data-service-item="row"
          class="flex min-w-0 items-baseline justify-between gap-3 border-t border-divider py-2"
          :class="index ? '' : 'border-t-0 pt-0'"
        >
          <span class="min-w-0 flex-1 truncate text-body text-on-surface" :title="item.name">{{ item.name }}</span>
          <span class="shrink-0 text-caption text-on-surface-muted tabular-nums">{{ item.since }}</span>
        </li>
      </ul>
    </PagePanel>
  </div>

  <div v-else-if="loaded" class="grow rounded-control bg-surface-raised px-4 py-4 sm:px-5">
    <h2 class="text-title text-on-surface">已订业务</h2>
    <EmptyNote class="mt-3" :title="emptyTitle" :text="emptyText" />
  </div>

  <div v-else class="grid min-w-0 grow gap-2 sm:gap-3 @[48rem]:grid-cols-2" aria-busy="true" aria-live="polite">
    <span class="sr-only">正在查询已订业务</span>
    <div
      v-for="group in SKELETON_GROUPS"
      :key="group"
      class="rounded-control bg-surface-raised px-4 pb-4 pt-4 sm:px-5"
    >
      <div class="skeleton h-5 w-28 rounded-chip"></div>
      <div v-for="row in SKELETON_ROWS" :key="row" class="mt-3 flex items-baseline justify-between gap-3">
        <div class="skeleton h-4 min-w-0 flex-1 rounded-chip"></div>
        <div class="skeleton h-3 w-20 shrink-0 rounded-chip"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import EmptyNote from "@/components/EmptyNote.vue";
import PagePanel from "@/components/PagePanel.vue";
import { groupServices } from "@/domain/services";

const SKELETON_GROUPS = 4;
const SKELETON_ROWS = 3;

const props = defineProps({
  services: { type: Array, default: () => [] },
  hasList: { type: Boolean, default: false },
  loaded: { type: Boolean, default: false },
});

// 分组来自 domain/services：编号认得的归类，认不出的一律落到「其他业务」，不丢条目。
// 只有排列顺序是这里的事：两列 grid 里同一行必须齐底，条目数相近的挨在一起才不会为了对齐
// 撑出一个几百像素的空洞。「其他业务」是兜底桶，永远压在最后。
const groups = computed(() => [...groupServices(props.services)].sort((first, second) => {
  if (first.id === "other" || second.id === "other") return first.id === "other" ? 1 : -1;
  return second.items.length - first.items.length;
}));
const emptyTitle = computed(() => (props.hasList ? "当前账号没有已订业务" : "未取到已订业务清单"));
const emptyText = computed(() => (
  props.hasList
    ? "联通接口返回的业务清单为空，说明该号码目前没有生效中的已订业务。"
    : "可稍后刷新或重新登录后再试；拿不到清单时 QCI 会显示为未确认。"
));
</script>
