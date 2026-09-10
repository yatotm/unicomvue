<template>
  <div class="grid grid-cols-3 gap-1 rounded-control bg-surface-sunken p-1" role="group" aria-label="显示主题">
    <button
      v-for="option in THEME_OPTIONS"
      :key="option.value"
      type="button"
      class="inline-flex h-11 min-w-0 items-center justify-center gap-1 rounded-control text-caption transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      :class="themeMode === option.value
        ? 'bg-surface-raised font-semibold text-primary-ink shadow-e1'
        : 'text-on-surface-variant hover:bg-hover-overlay hover:text-on-surface'"
      :title="option.title"
      :aria-label="option.title"
      :role="inMenu ? 'menuitemradio' : undefined"
      :aria-checked="inMenu ? themeMode === option.value : undefined"
      :aria-pressed="inMenu ? undefined : themeMode === option.value"
      @click="selectTheme(option.value)"
    >
      <component :is="option.icon" :size="16" class="shrink-0" aria-hidden="true" />
      <span class="truncate">{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { Monitor, Moon, Sun } from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";

const THEME_OPTIONS = [
  { value: "light", label: "浅色", title: "浅色主题", icon: Sun },
  { value: "system", label: "系统", title: "跟随系统主题", icon: Monitor },
  { value: "dark", label: "深色", title: "深色主题", icon: Moon },
];

defineProps({
  // Inside a role="menu" panel the segmented control has to expose menu semantics instead.
  inMenu: { type: Boolean, default: false },
});

const emit = defineEmits(["change"]);
const { themeMode, setTheme } = useTheme();

function selectTheme(mode) {
  setTheme(mode);
  emit("change", mode);
}
</script>
