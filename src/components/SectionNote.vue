<template>
  <!-- 区块底部的脚注。两种语气：`quiet` 是补充说明，`warning` 是降级提示（数字对不上）。
       之前它在 ExpiryLanes 和 ResourceTable 各写了两遍，四串 class 两两只差一个 margin
       和一个 leading-relaxed——同一件事的四个近似写法。 -->
  <p
    class="flex items-baseline gap-1.5 text-caption leading-relaxed"
    :class="tone === 'warning' ? 'text-on-warning-container' : 'text-on-surface-muted'"
    :title="hint || undefined"
  >
    <TriangleAlert
      v-if="tone === 'warning'"
      :size="12"
      :stroke-width="1.6"
      class="shrink-0 translate-y-0.5 text-warning-ink"
      aria-hidden="true"
    />
    <span class="min-w-0"><slot /></span>
  </p>
</template>

<script setup>
import { TriangleAlert } from "@lucide/vue";

defineProps({
  tone: { type: String, default: "quiet" },
  hint: { type: String, default: "" },
});
</script>
