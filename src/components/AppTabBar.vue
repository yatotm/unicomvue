<template>
  <!-- Four destinations fit a tab bar, so the phone gets them all at once instead of behind a
       hamburger: one tap instead of two, and no dialog to trap focus in. -->
  <nav
    class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 elevate-up bg-surface-raised px-1.5 pt-1.5 lg:hidden"
    :style="{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }"
    aria-label="主导航"
  >
    <RouterLink
      v-for="item in NAV_ITEMS"
      :key="item.name"
      :to="{ name: item.name }"
      class="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control py-1 text-caption transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      :class="route.name === item.name
        ? 'bg-primary-container font-semibold text-on-primary-container'
        : 'text-on-surface-muted active:bg-pressed-overlay'"
      :title="item.hint"
      :aria-current="route.name === item.name ? 'page' : undefined"
    >
      <component :is="item.icon" :size="18" :stroke-width="1.6" class="shrink-0" aria-hidden="true" />
      <span class="truncate">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
import { RouterLink, useRoute } from "vue-router";
import { NAV_ITEMS } from "@/utils/navigation";

const route = useRoute();
</script>
