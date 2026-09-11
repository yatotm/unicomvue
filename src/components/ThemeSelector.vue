<template>
  <SegmentedControl
    :options="THEME_OPTIONS"
    :model-value="themeMode"
    label="显示主题"
    :in-menu="inMenu"
    @update:model-value="selectTheme"
  />
</template>

<script setup>
import { Monitor, Moon, Sun } from "@lucide/vue";
import SegmentedControl from "@/components/SegmentedControl.vue";
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
