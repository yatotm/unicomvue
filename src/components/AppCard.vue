<template>
  <!-- 一页唯一的卡片。它对画布的分界**只有一种机制：阴影**（`shadow-e2`），没有描边。
       理由是这一对 token 已经把两个主题都算进去了：浅色用「1px 接触影 + 一道很宽的环境影」，
       读起来是纸搁在画布上；深色里阴影本来就看不见，所以 `--ui-e2` 的第一层就是一条发丝线。
       同一个 token，两个主题，一条声明——再加一条 border 就是同一件事说两遍。

       卡片内部**没有嵌套卡片**：区块不带底色、不带描边、不带阴影，靠这里的
       `divide-y divide-divider` 分开。线由卡片来画，于是「这一页有几条全宽线」永远等于
       「卡片有几个直接子元素减一」——数得清，也没有哪个区块能偷偷给自己加一条。
       卡片没有内边距（线必须通到两边），左右插入量整体下放给每个 band 自己的 px-5 sm:px-6。 -->
  <section class="flex min-w-0 flex-col divide-y divide-divider overflow-hidden rounded-card bg-surface-raised shadow-e2 lg:min-h-0 lg:grow">
    <slot />
  </section>
</template>
