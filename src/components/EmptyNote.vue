<template>
  <!-- 空态是一条结论，不是一个缺口：说清楚是「运营商返回 0 条」还是「没取到」。 -->
  <div class="my-auto flex flex-col gap-2 rounded-control bg-surface-sunken px-4 py-3.5">
    <p class="text-title text-on-surface-variant">{{ title }}</p>
    <p class="text-caption leading-relaxed text-on-surface-muted">{{ text }}</p>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  text: { type: String, required: true },
});
</script>
