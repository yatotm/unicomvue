<template>
  <!-- 卡片最上面那一条 band：这一页在看什么（内容，不是页面标题——页面名归 document.title
       和只给读屏器的 <h1>），后面跟着这一页自己的状态徽章和一个右对齐的计数。
       三条数据路由用的是**同一个**组件，之前它们各自手写了一遍，连 items-center /
       items-baseline 这种细节都不一样。 -->
  <div :class="[HEADING_ROW, 'py-3 sm:py-4']">
    <slot name="title">
      <h2
        class="min-w-0 max-w-full truncate"
        :class="[PAGE_TITLE, numeric ? 'tabular-nums' : '']"
        :title="hint || title"
      >{{ title }}</h2>
    </slot>
    <slot />
  </div>
</template>

<script setup>
import { HEADING_ROW, PAGE_TITLE } from "@/utils/ui";

defineProps({
  title: { type: String, default: "" },
  hint: { type: String, default: "" },
  // 标题里带数字（「23 项生效中的业务」）时才切等宽数字，普通套餐名不需要。
  numeric: { type: Boolean, default: false },
});
</script>
