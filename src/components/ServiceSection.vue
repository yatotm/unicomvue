<template>
  <!-- 每个分组是卡片里的一块区域。两列之间是接缝网格的 1px 竖缝，行与行之间是同一条网格
       画出来的横线——之前这里是「两列 grid + gap」，也就是一堆浮在托盘上的小卡。
       网格天然把同一行拉到同一条底边：短的补白，长的在自己格子里滚。 -->
  <div v-if="loaded && groups.length" class="ui-seams min-w-0 grow lg:min-h-0 @[48rem]:grid-cols-2">
    <!-- 分组数是奇数时，最后一格必须占满整行：接缝网格的底色就是分隔线色，空出来的那一格
         会变成一整块分隔线色的矩形，而不是一道缝。 -->
    <AppSection
      v-for="group in groups"
      :key="group.id"
      class="@[48rem]:odd:last:col-span-2"
      :title="group.title"
      body-class="@[48rem]:max-h-96"
    >
      <template #meta>
        <span class="shrink-0 text-caption text-on-surface-muted tabular-nums">{{ group.items.length }} 项</span>
      </template>

      <ul>
        <li
          v-for="item in group.items"
          :key="item.key"
          data-service-item="row"
          class="flex min-w-0 items-baseline justify-between gap-3 border-t border-divider py-2 first:border-t-0 first:pt-0"
        >
          <span class="min-w-0 flex-1 truncate text-body text-on-surface" :title="item.name">{{ item.name }}</span>
          <span class="shrink-0 text-caption text-on-surface-muted tabular-nums">{{ item.since }}</span>
        </li>
      </ul>
    </AppSection>
  </div>

  <AppSection v-else-if="loaded" title="已订业务" class="grow lg:min-h-0">
    <EmptyNote :title="emptyTitle" :text="emptyText" />
  </AppSection>

  <!-- 活动区留在网格外面：`.ui-seams > *` 会把它算成一个格子，而 sr-only 的元素一旦参与
       nth-child 计数，「奇数时最后一格占满整行」那条规则就会数错。 -->
  <div v-else class="flex min-w-0 grow flex-col lg:min-h-0" aria-busy="true" aria-live="polite">
    <span class="sr-only">正在查询已订业务</span>
    <div class="ui-seams grow lg:min-h-0 @[48rem]:grid-cols-2">
      <SkeletonSection v-for="group in SKELETON_GROUPS" :key="group" title-width="w-28" :rows="SKELETON_ROWS" />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import AppSection from "@/components/AppSection.vue";
import EmptyNote from "@/components/EmptyNote.vue";
import SkeletonSection from "@/components/SkeletonSection.vue";
import { groupServices } from "@/domain/services";

const SKELETON_GROUPS = 4;
const SKELETON_ROWS = 3;

const props = defineProps({
  services: { type: Array, default: () => [] },
  hasList: { type: Boolean, default: false },
  loaded: { type: Boolean, default: false },
});

// 分组来自 domain/services：编号认得的归类，认不出的一律落到「其他业务」，不丢条目。
// 只有排列顺序是这里的事：两列网格里同一行必须齐底，条目数相近的挨在一起才不会为了对齐
// 撑出一个几百像素的空洞。「其他业务」是兜底桶，永远压在最后。
const groups = computed(() => [...groupServices(props.services)].sort((first, second) => {
  if (first.id === "other" || second.id === "other") return first.id === "other" ? 1 : -1;
  return second.items.length - first.items.length;
}));
const emptyTitle = computed(() => (props.hasList ? "当前账号没有已订业务" : "未取到已订业务清单"));
const emptyText = computed(() => (
  props.hasList
    ? "联通接口返回的业务清单为空，说明该号码目前没有生效中的已订业务。"
    : "可稍后刷新或重新登录后再试；拿不到清单时 QCI 会显示为未确认。"
));
</script>
