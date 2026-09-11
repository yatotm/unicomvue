<template>
  <!-- 空态是一条结论，不是一个缺口：说清楚是「运营商返回 0 条」还是「没取到」。
       它不再是一块填色的盒子——卡片内部没有嵌套面，一条结论靠字号层级和留白站住就够了。 -->
  <div class="my-auto flex flex-col gap-1.5 py-3">
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
