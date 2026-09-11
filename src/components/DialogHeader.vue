<template>
  <!-- 两个对话框的抬头之前是逐字相同的两份：同一枚 36px 的容器色徽章、同一个标题 + 副标题、
       同一颗关闭钮。这里一份。 -->
  <div class="flex min-w-0 items-start justify-between gap-3">
    <div class="flex min-w-0 items-start gap-3">
      <span
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-container text-on-primary-container"
        aria-hidden="true"
      >
        <slot name="icon" />
      </span>
      <div class="min-w-0">
        <h2 :id="titleId" class="text-title text-on-surface">{{ title }}</h2>
        <p class="mt-1 text-caption text-on-surface-variant">{{ subtitle }}</p>
      </div>
    </div>

    <button
      v-if="closable"
      ref="closeButtonRef"
      type="button"
      :class="ICON_BUTTON"
      title="关闭"
      :aria-label="closeLabel"
      @click="emit('close')"
    >
      <X :size="20" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
import { useTemplateRef } from "vue";
import { X } from "@lucide/vue";
import { ICON_BUTTON } from "@/utils/ui";

defineProps({
  titleId: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  closeLabel: { type: String, required: true },
  closable: { type: Boolean, default: true },
});

const emit = defineEmits(["close"]);
const closeButtonRef = useTemplateRef("closeButtonRef");

defineExpose({ focus: () => closeButtonRef.value?.focus() });
</script>
