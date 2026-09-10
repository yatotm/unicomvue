<template>
  <span
    class="inline-flex shrink-0 items-center rounded-chip px-1.5 py-px text-caption tabular-nums"
    :class="tone === 'accent'
      ? 'bg-primary-container text-on-primary-container'
      : 'bg-surface-sunken text-on-surface-variant'"
  >
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup>
defineProps({
  text: { type: String, default: "" },
  // `accent` is for a property the reader must not skim past, such as 不限量.
  tone: { type: String, default: "quiet" },
});
</script>
