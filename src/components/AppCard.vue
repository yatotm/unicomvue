<template>
  <!-- 一页唯一的外层卡片：一个「托盘」。它自己带内边距，所以内部的圆角区域永远不会盖到它的
       四个角上——这正是之前左下 / 右下读起来是直角的原因（一块不透明、直角、和卡片同色的
       .pane-scroll 正好压在角上）。lg: 起它被拉到主区的完整高度，四条路由因此是同一个矩形。 -->
  <section class="flex min-w-0 flex-col gap-2 rounded-card bg-surface p-2 shadow-e2 sm:gap-3 sm:p-3 lg:grow">
    <slot />
  </section>
</template>
