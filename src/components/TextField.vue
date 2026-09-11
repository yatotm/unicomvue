<template>
  <!-- 一个带标签的输入。登录对话框里之前有四段近似的 20 行 markup（手机号、验证码、密码、
       token），四串输入框 class 只差一两个 focus 状态。这里一份：输入框是 sunken 的面 +
       3:1 的描边，出错时整条边和焦点环一起换成危险色。 -->
  <div class="min-w-0">
    <label :for="fieldId" class="mb-1 block text-caption text-on-surface-variant">{{ label }}</label>

    <textarea
      v-if="multiline"
      :id="fieldId"
      ref="controlRef"
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      :class="[controlClass, 'resize-none py-2 [overflow-wrap:anywhere]']"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="emit('update:modelValue', $event.target.value.trim())"
    ></textarea>
    <!-- 后缀槽是给「输入框 + 一个动作」这一种形状用的（获取验证码）：窄屏一列，xs 起并排。 -->
    <div v-else :class="$slots.suffix ? 'grid min-w-0 grid-cols-1 gap-2 xs:grid-cols-[minmax(0,1fr)_auto]' : ''">
      <input
        :id="fieldId"
        ref="controlRef"
        :value="modelValue"
        :type="type"
        :inputmode="inputmode || undefined"
        :autocomplete="autocomplete || undefined"
        :maxlength="maxlength || undefined"
        :placeholder="placeholder"
        :class="[controlClass, 'h-11', numeric ? 'tabular-nums' : '']"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="emit('update:modelValue', trim ? $event.target.value.trim() : $event.target.value)"
        @keydown.enter="emit('submit')"
      />
      <slot name="suffix" />
    </div>

    <p v-if="error" :id="messageId" class="mt-1 text-caption text-danger-ink">{{ error }}</p>
    <p v-else-if="hint" :id="messageId" class="mt-1 text-caption text-on-surface-variant">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed, useId, useTemplateRef } from "vue";
import { TRANSITION } from "@/utils/ui";

const CONTROL_BASE = `w-full min-w-0 rounded-control border bg-surface-sunken px-3 text-body text-on-surface ${TRANSITION} placeholder:text-on-surface-muted hover:border-primary focus:bg-surface-raised focus:outline-2 focus:outline-offset-0`;
const CONTROL_REST = "border-outline focus:border-primary focus:outline-primary";
const CONTROL_ERROR = "border-danger focus:border-danger focus:outline-danger";

const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, required: true },
  type: { type: String, default: "text" },
  inputmode: { type: String, default: "" },
  autocomplete: { type: String, default: "" },
  maxlength: { type: Number, default: 0 },
  placeholder: { type: String, default: "" },
  error: { type: String, default: "" },
  hint: { type: String, default: "" },
  multiline: { type: Boolean, default: false },
  rows: { type: Number, default: 4 },
  numeric: { type: Boolean, default: false },
  trim: { type: Boolean, default: true },
});

const emit = defineEmits(["update:modelValue", "submit"]);

const fieldId = useId();
const messageId = useId();
const controlRef = useTemplateRef("controlRef");

const controlClass = computed(() => `${CONTROL_BASE} ${props.error ? CONTROL_ERROR : CONTROL_REST}`);
const describedBy = computed(() => (props.error || props.hint ? messageId : undefined));

defineExpose({ focus: (options) => controlRef.value?.focus(options) });
</script>
