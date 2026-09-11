<template>
  <!-- 侧栏是自己的一块区域，不是主区的延长线：264px 宽、右侧一条通到底的发丝线，而且永远不随
       主区滚动（主区才是滚动容器）。.app-rail 给它一层半透明的纸色——画布本身带渐变，所以画布
       的明暗会从这块面板里透出来，它读起来是一块浮在画布上的半透明面板，而不是同一块画布。 -->
  <nav
    class="app-rail flex min-h-0 w-66 flex-col border-r border-divider px-3 pb-4 pt-4"
    aria-label="主导航"
  >
    <div class="flex min-w-0 items-center gap-3 px-2.5 pb-4">
      <span
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary"
        aria-hidden="true"
      >
        <Gauge :size="17" :stroke-width="1.6" />
      </span>
      <span class="min-w-0">
        <span class="block truncate text-body font-semibold text-on-surface">联通套餐查询</span>
        <span class="block truncate text-caption text-on-surface-muted">本机运行</span>
      </span>
    </div>

    <div class="mx-2.5 h-px bg-divider" role="separator"></div>

    <!-- 外壳的滚动条用 `overscroll-none`：侧栏既不把滚动传出去，自己也不回弹（§0.1.1）。 -->
    <ul class="mt-3 grid min-h-0 gap-1 overflow-y-auto overscroll-none">
      <li v-for="item in NAV_ITEMS" :key="item.name">
        <RouterLink
          :to="{ name: item.name }"
          :class="[NAV_ROW, route.name === item.name
            ? 'bg-surface-raised font-semibold text-on-surface'
            : `text-on-surface-variant ${HOVER_OVERLAY}`]"
          :title="item.hint"
          :aria-current="route.name === item.name ? 'page' : undefined"
        >
          <component
            :is="item.icon"
            :size="17"
            :stroke-width="1.6"
            class="shrink-0"
            :class="route.name === item.name ? 'text-primary-ink' : ''"
            aria-hidden="true"
          />
          <span class="min-w-0 truncate">{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>

    <!-- The privacy line is the nav's own footer: a rule anchors it to the sidebar instead of
         leaving it floating at the bottom of the page. -->
    <footer class="mt-auto grid gap-3 pt-5">
      <div class="mx-2.5 h-px bg-divider" role="separator"></div>
      <p
        class="flex min-w-0 items-center gap-2 px-2.5 text-caption text-on-surface-muted"
        title="数据只保存在本机浏览器"
      >
        <ShieldCheck :size="13" :stroke-width="1.4" class="shrink-0" aria-hidden="true" />
        <span class="min-w-0 truncate">数据只保存在本机浏览器</span>
      </p>
    </footer>
  </nav>
</template>

<script setup>
import { RouterLink, useRoute } from "vue-router";
import { Gauge, ShieldCheck } from "@lucide/vue";
import { NAV_ITEMS } from "@/utils/navigation";
import { HOVER_OVERLAY, NAV_ROW } from "@/utils/ui";

const route = useRoute();
</script>
