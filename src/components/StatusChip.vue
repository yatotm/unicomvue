<template>
  <!-- 抬头那一行的状态徽章。之前它在看板、用量明细、已订业务三处各手写了一遍（限速服务
       那一枚是逐字重复的三份），点还用了 `rounded-chip`——4px 圆角画在 6px 的方块上，
       那不是一个点。这里只有一个定义：三种语气，点可选。 -->
  <p
    class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-chip px-2.5 text-caption"
    :class="TONES[tone] ?? TONES.accent"
    :title="hint || undefined"
  >
    <span
      v-if="dot"
      class="size-1.5 shrink-0 rounded-dot"
      :class="DOTS[tone] ?? DOTS.accent"
      aria-hidden="true"
    ></span>
    <span class="min-w-0 truncate"><slot>{{ text }}</slot></span>
  </p>
</template>

<script setup>
const TONES = Object.freeze({
  accent: "bg-primary-container text-on-primary-container",
  danger: "bg-danger-container text-on-danger-container",
});

const DOTS = Object.freeze({
  accent: "bg-primary",
  danger: "bg-danger",
});

defineProps({
  text: { type: String, default: "" },
  tone: { type: String, default: "accent" },
  hint: { type: String, default: "" },
  dot: { type: Boolean, default: false },
});
</script>
