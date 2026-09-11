<template>
  <!-- 卡片内部的一块区域。它**不是一张卡**：没有底色、没有描边、没有阴影、没有圆角。
       和相邻区块的分界来自卡片的 `divide-y` 或接缝网格 `.ui-seams` 的 1px gap，
       内部的层级来自标题和留白。这一条就是这次收敛的核心——之前每块区域都是一张 6px 的
       小卡，一页读起来是一摞盒子。

       同一行的兄弟区块由网格拉到同一条底边：内容短就补白，内容超出就在**滚动主体**里滚，
       区块本身不长高。天花板压在主体上而不是区块上，否则一行的高度就由「谁先撞到自己的
       上限」决定，视口一变高就露出一条谁也解释不了的空带。 -->
  <section class="app-section flex min-h-0 min-w-0 flex-col" :aria-labelledby="headingId">
    <div :class="[HEADING_ROW, 'pb-3 pt-4 sm:pt-5']">
      <h2 :id="headingId" class="min-w-0 text-title text-on-surface" :title="hint || undefined">
        {{ title }}
      </h2>
      <slot name="meta" />
    </div>

    <div
      ref="paneRef"
      class="pane-scroll scroll-shade min-h-0 grow overflow-y-auto overflow-x-clip px-5 sm:px-6"
      :class="[bodyClass, $slots.footer ? '' : 'pb-4 sm:pb-5']"
      :tabindex="overflowing ? 0 : undefined"
      :role="overflowing ? 'region' : undefined"
      :aria-label="overflowing ? `${title}（内容较长，可在此区域内滚动）` : undefined"
    >
      <!-- min-h-full + flex 让「空态」这类单块内容用 my-auto 居中：区块被拉伸补白时，
           一个居中的结论读起来是有意为之，靠在顶上的一小块才像窟窿。 -->
      <div ref="contentRef" class="flex min-h-full min-w-0 flex-col">
        <slot />
      </div>
    </div>

    <div v-if="$slots.footer" class="px-5 pb-4 pt-2.5 sm:px-6 sm:pb-5">
      <slot name="footer" />
    </div>
  </section>
</template>

<script setup>
import { useId, useTemplateRef } from "vue";
import { usePaneOverflow } from "@/utils/paneOverflow";
import { HEADING_ROW } from "@/utils/ui";

defineProps({
  title: { type: String, required: true },
  // 说明性长句放进标题的 title 里：事实一条不少，但不再和标题、合计挤在同一行。
  hint: { type: String, default: "" },
  // 这一块的高度天花板，落在滚动主体上（见上面的注释）。
  bodyClass: { type: String, default: "" },
});

const headingId = useId();
const paneRef = useTemplateRef("paneRef");
const contentRef = useTemplateRef("contentRef");
const { overflowing } = usePaneOverflow(paneRef, contentRef);
</script>
