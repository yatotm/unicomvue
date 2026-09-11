<template>
  <!-- 骨架屏复刻的是真实的几何：一张卡片、一条抬头、一条 34px 主数字的 band、一条四格事实
       band、两列图区。band 的接缝用的是同一个 .ui-seams 配方——之前这里把 DashboardHero 的
       两段 grid CSS 抄了一份在自己的 <style scoped> 里，两处一改就散。 -->
  <AppCard aria-busy="true" aria-live="polite">
    <div class="px-5 py-3 sm:px-6 sm:py-4">
      <span class="sr-only">正在查询余量与用量</span>
      <div class="skeleton h-6 w-64 max-w-full rounded-chip" aria-hidden="true"></div>
    </div>

    <div :class="HERO_BAND" aria-hidden="true">
      <div
        v-for="cell in 3"
        :key="cell"
        class="flex flex-col gap-2.5 px-5 py-4 sm:px-6"
        :class="cell === 1 ? 'max-sm:col-span-2' : ''"
      >
        <div class="skeleton h-3 w-28 rounded-chip"></div>
        <div class="skeleton rounded-chip" :class="cell === 1 ? 'h-8 w-40' : 'h-6 w-24'"></div>
        <div class="skeleton h-1.5 w-full rounded-chip"></div>
        <div class="skeleton h-3 w-44 max-w-full rounded-chip"></div>
      </div>
    </div>

    <div :class="FACT_BAND" aria-hidden="true">
      <div v-for="fact in 4" :key="fact" class="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
        <div class="skeleton h-3 w-16 rounded-chip"></div>
        <div class="skeleton h-4 w-24 rounded-chip"></div>
      </div>
    </div>

    <div :class="CHART_BAND">
      <SkeletonSection
        v-for="block in CHART_BLOCKS"
        :key="block.cell"
        :class="block.cell"
        variant="lane"
        :rows="block.rows"
        :title-width="block.title"
        :line-width="block.line"
      />
    </div>
  </AppCard>
</template>

<script setup>
import AppCard from "@/components/AppCard.vue";
import SkeletonSection from "@/components/SkeletonSection.vue";
import { CHART_BAND, CHART_CELLS, FACT_BAND, HERO_BAND } from "@/utils/ui";

// 和真实布局同一套落位：流量占满左列两行，语音和短信各占右列一行，
// 骨架屏因此不会在数字落地时跳一下。
const CHART_BLOCKS = [
  { cell: CHART_CELLS[0], title: "w-40", line: "w-56", rows: 5 },
  { cell: CHART_CELLS[1], title: "w-32", line: "w-40", rows: 2 },
  { cell: CHART_CELLS[2], title: "w-24", line: "w-36", rows: 1 },
];
</script>
