<template>
  <!-- 全项目唯一的按钮。之前这件事有四套写法：设置页一组常量、顶栏另一组常量、登录对话框
       六串手写的 class、隐私说明两串——连指针高度都分成了 36px 和 40px 两档。
       变体的定义在 utils/ui.js，测试和组件读同一份。 -->
  <component
    :is="tag"
    :class="[BUTTON_BASE, BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.outlined]"
    :type="tag === 'button' ? type : undefined"
  >
    <slot />
  </component>
</template>

<script setup>
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/utils/ui";

defineProps({
  // `button` / `a` / RouterLink —— 形状归变体管，语义归标签管。
  tag: { type: [String, Object], default: "button" },
  variant: { type: String, default: "outlined" },
  type: { type: String, default: "button" },
});
</script>
