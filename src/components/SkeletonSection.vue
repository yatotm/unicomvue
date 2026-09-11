<template>
  <!-- 加载态的区块。之前有三份实现（看板骨架屏、用量明细内联、已订业务内联），每份都自己
       挑了一套宽度。这里一份：和 AppSection 同一套内边距和节奏，行的形状按 variant 切换，
       所以数字落地时不跳。 -->
  <div class="flex min-w-0 flex-col px-5 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5" aria-hidden="true">
    <div class="skeleton h-5 rounded-chip" :class="titleWidth"></div>

    <template v-if="variant === 'lane'">
      <div v-for="row in rows" :key="row" class="mt-3.5 grid gap-2">
        <div class="skeleton h-3 max-w-full rounded-chip" :class="lineWidth"></div>
        <div class="skeleton h-4.5 w-full rounded-chip"></div>
      </div>
    </template>

    <template v-else-if="variant === 'table'">
      <div v-for="row in rows" :key="row" class="mt-3.5 flex items-center gap-3">
        <div class="skeleton h-4 min-w-0 flex-1 rounded-chip"></div>
        <div class="skeleton hidden h-3 w-24 rounded-chip sm:block"></div>
        <div class="skeleton h-3 w-16 rounded-chip"></div>
        <div class="skeleton hidden h-1.5 w-32 rounded-chip sm:block"></div>
      </div>
    </template>

    <template v-else>
      <div v-for="row in rows" :key="row" class="mt-3 flex items-baseline justify-between gap-3">
        <div class="skeleton h-4 min-w-0 flex-1 rounded-chip"></div>
        <div class="skeleton h-3 w-20 shrink-0 rounded-chip"></div>
      </div>
    </template>
  </div>
</template>

<script setup>
defineProps({
  // `lane`（到期分组图） / `table`（明细表） / `list`（已订业务）
  variant: { type: String, default: "list" },
  rows: { type: Number, default: 3 },
  titleWidth: { type: String, default: "w-32" },
  lineWidth: { type: String, default: "w-40" },
});
</script>
