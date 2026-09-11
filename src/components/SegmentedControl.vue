<template>
  <!-- 分段控件：一条 sunken 的轨道 + 一块浮起来的当前格。主题选择器和登录方式选择器之前是
       两份实现，一个用 8px 圆角一个用 6px、一个给当前格加了 600 一个没加。这里是同一份：
       轨道 6px，格子 6px，当前格靠**色阶**站出来（raised 站在 sunken 上，契约里钉着
       1.20× / ΔE 6），不靠阴影——阴影只留给真正的浮层。 -->
  <div
    class="flex gap-1 rounded-control bg-surface-sunken p-1"
    :role="inMenu ? undefined : 'group'"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-control px-2 text-caption sm:h-9"
      :class="[
        TRANSITION,
        FOCUS_RING_INSET,
        option.value === modelValue
          ? 'bg-surface-raised font-semibold text-primary-ink'
          : `text-on-surface-variant ${HOVER_OVERLAY} hover:text-on-surface`,
      ]"
      :title="option.title || option.label"
      :aria-label="option.title || option.label"
      :role="inMenu ? 'menuitemradio' : undefined"
      :aria-checked="inMenu ? option.value === modelValue : undefined"
      :aria-pressed="inMenu ? undefined : option.value === modelValue"
      @click="emit('update:modelValue', option.value)"
    >
      <component v-if="option.icon" :is="option.icon" :size="16" class="shrink-0" aria-hidden="true" />
      <span class="truncate">{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { FOCUS_RING_INSET, HOVER_OVERLAY, TRANSITION } from "@/utils/ui";

defineProps({
  // [{ value, label, title?, icon? }]
  options: { type: Array, required: true },
  modelValue: { type: String, default: "" },
  label: { type: String, required: true },
  // 放进 role="menu" 的面板里时，分段控件要换成菜单语义。
  inMenu: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);
</script>
