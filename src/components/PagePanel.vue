<template>
  <!-- 卡片内部的一块区域：自己也是一张圆角卡（6px，比外层的 8px 小一档），铺在托盘色之上的
       纸色里。它没有阴影——整页只有最外那一张浮起来，所以读起来仍然是一个整体，不是一堆散落的
       浮卡。同一行的兄弟区域由 grid 拉伸到同一条底边：内容短就补白，内容超出就在区域内部滚动，
       区域本身不长高。overflow-hidden 让内部的滚动面板不会把这块的圆角磨成直角。 -->
  <section
    class="page-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-control bg-surface-raised"
    :aria-labelledby="headingId"
  >
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 px-4 pb-3 pt-4 sm:px-5">
      <h2 :id="headingId" class="min-w-0 text-title text-on-surface" :title="hint || undefined">
        {{ title }}
      </h2>
      <slot name="meta" />
    </div>

    <!-- 天花板压在**滚动主体**上，不压在区域自己身上：区域必须能被 grid 拉到整行的高度，
         否则一行里两块的高度就由「谁先撞到自己的上限」决定，视口一变高就露出一条谁也
         解释不了的空带（实测 980px 高时语音区域比它那一行短了 49px）。压在主体上，
         「内容超出就在自己内部滚、区域本身不因为内容长高」这条规则一点没变。 -->
    <div
      ref="paneRef"
      class="pane-scroll scroll-shade min-h-0 grow overflow-y-auto overflow-x-clip px-4 sm:px-5"
      :class="[bodyClass, $slots.footer ? '' : 'pb-4']"
      :tabindex="overflowing ? 0 : undefined"
      :role="overflowing ? 'region' : undefined"
      :aria-label="overflowing ? `${title}（内容较长，可在此区域内滚动）` : undefined"
    >
      <!-- min-h-full + flex 让「空态」这类单块内容用 my-auto 居中：面板被拉伸补白时，
           一个居中的结论读起来是有意为之，靠在顶上的一小块才像窟窿。 -->
      <div ref="contentRef" class="flex min-h-full min-w-0 flex-col">
        <slot />
      </div>
    </div>

    <div v-if="$slots.footer" class="px-4 pb-4 pt-2.5 sm:px-5">
      <slot name="footer" />
    </div>
  </section>
</template>

<script setup>
import { useId, useTemplateRef } from "vue";
import { usePaneOverflow } from "@/utils/paneOverflow";

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
