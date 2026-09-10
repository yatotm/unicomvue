<template>
  <!-- The skeleton reproduces the real geometry — one outer card, one wide hero cell, two narrow
       ones, a four-up fact row, then the two ruled chart columns — so nothing jumps when the
       numbers land. -->
  <AppCard aria-busy="true" aria-live="polite">
    <span class="sr-only">正在查询余量与用量</span>

    <div class="px-4 pt-1 sm:px-5">
      <div class="skeleton h-6 w-64 max-w-full rounded-chip"></div>
    </div>
    <div class="hero-grid overflow-hidden rounded-control bg-surface-raised">
      <div v-for="cell in 3" :key="cell" class="flex flex-col gap-2.5 px-4 py-3.5 sm:px-5">
        <div class="skeleton h-3 w-28 rounded-chip"></div>
        <div class="skeleton rounded-chip" :class="cell === 1 ? 'h-8 w-40' : 'h-6 w-24'"></div>
        <div class="skeleton h-2 w-full rounded-chip"></div>
        <div class="skeleton h-3 w-44 max-w-full rounded-chip"></div>
      </div>
    </div>
    <div class="fact-grid overflow-hidden rounded-control bg-surface-raised">
      <div v-for="fact in 4" :key="fact" class="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
        <div class="skeleton h-3 w-16 rounded-chip"></div>
        <div class="skeleton h-4 w-24 rounded-chip"></div>
      </div>
    </div>

    <div class="grid min-w-0 grow gap-2 sm:gap-3 @[60rem]:grid-cols-[minmax(0,1fr)_21.25rem]">
      <div
        v-for="block in CHART_BLOCKS"
        :key="block.cell"
        class="rounded-control bg-surface-raised px-4 pb-4 pt-4 sm:px-5"
        :class="block.cell"
      >
        <div class="skeleton h-5 rounded-chip" :class="block.title"></div>
        <div v-for="row in block.rows" :key="row" class="mt-3.5 grid gap-2">
          <div class="skeleton h-3 max-w-full rounded-chip" :class="block.line"></div>
          <div class="skeleton h-4.5 w-full rounded-chip"></div>
        </div>
      </div>
    </div>
  </AppCard>
</template>

<script setup>
import AppCard from "@/components/AppCard.vue";

// 和真实布局同一套落位：流量占满左列两行，语音和短信各占右列一行，
// 骨架屏因此不会在数字落地时跳一下。
const CHART_BLOCKS = [
  {
    cell: "@[60rem]:col-start-1 @[60rem]:row-start-1 @[60rem]:row-span-2",
    title: "w-40",
    line: "w-56",
    rows: 5,
  },
  { cell: "@[60rem]:col-start-2 @[60rem]:row-start-1", title: "w-32", line: "w-40", rows: 2 },
  { cell: "@[60rem]:col-start-2 @[60rem]:row-start-2", title: "w-24", line: "w-36", rows: 1 },
];
</script>

<style scoped>
.hero-grid,
.fact-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.hero-grid > :first-child {
  grid-column: 1 / -1;
}

@media (min-width: 40rem) {
  .hero-grid {
    grid-template-columns: 1.5fr 1fr 1fr;
  }

  .hero-grid > :first-child {
    grid-column: auto;
  }

  .fact-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
