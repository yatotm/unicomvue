<template>
  <!-- 琥珀色小徽章只有两种用法：一是推断出来的结论（必须带「（推断）」，和 QCI 的
       「8（推断）」一个规矩），二是运营商数字对不上的降级提示。两种都必须能解释自己，
       所以 hint 是必填的。 -->
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded-chip bg-warning-container px-1.5 py-0.5 text-caption text-on-warning-container"
    :title="hint"
  >
    <TriangleAlert :size="12" :stroke-width="1.6" class="shrink-0 text-warning-ink" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<script setup>
import { TriangleAlert } from "@lucide/vue";

defineProps({
  label: { type: String, required: true },
  hint: { type: String, required: true },
});
</script>
