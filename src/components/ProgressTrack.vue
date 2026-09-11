<template>
  <!-- 占比条。之前看板用 h-2 且带 shadow-e1、明细表用 h-1.5 不带——同一个图形两个高度，
       其中一个还违反了「阴影只给浮层」。这里只有一个：sunken 轨道 + 分类色的填充。
       不限量的包没有分母，所以它拿的是同一个色相扫过去的不确定进度条，而不是一条画到底的实条。 -->
  <span
    class="block h-1.5 min-w-0 overflow-hidden rounded-chip bg-surface-sunken"
    role="img"
    :aria-label="label"
    :title="label"
  >
    <span
      class="chart-animate block h-full rounded-chip"
      :class="[fill, unlimited ? 'progress-unlimited' : '']"
      :style="{ width: `${percent}%` }"
    ></span>
  </span>
</template>

<script setup>
defineProps({
  // `bg-series-1|2|3`——分类色板按资源种类固定分配，字面量由调用方给出（Tailwind 只扫源码
  // 里真正出现过的候选串）。
  fill: { type: String, required: true },
  percent: { type: Number, default: 100 },
  unlimited: { type: Boolean, default: false },
  label: { type: String, required: true },
});
</script>
