<template>
  <!-- 卡片的直接子元素：抬头 + 三张资源表，三条全宽横线。 -->
  <AppCard>
    <template v-if="hasLoaded">
      <PageHeader :title="packageName || '余量 / 用量展示'">
        <StatusChip :tone="statusKind === 'error' ? 'danger' : 'accent'" dot :text="statusText" />
        <StatusChip
          v-if="hasLimitService"
          tone="danger"
          dot
          text="限速服务"
          hint="已订业务中检测到“限速服务(50027)”，该业务会压低上网速率"
        />
        <!-- 签约速率和 QCI 是看板那四格的事实，它们在那里带着推断依据的 title；
             在这一页原样再印一遍只是又一行小字。留下的是这一页真正需要的那个：数据有多新。 -->
        <p class="ml-auto shrink-0 text-caption text-on-surface-muted tabular-nums">
          上次刷新 {{ lastUpdatedAt }}
        </p>
      </PageHeader>

      <ResourceTable
        v-for="card in cards"
        :key="card.section.id"
        class="grow lg:min-h-0"
        :section="card.section"
        :empty-title="card.emptyTitle"
        :empty-text="card.emptyText"
      />
    </template>

    <template v-else>
      <span class="sr-only" aria-busy="true" aria-live="polite">正在查询余量与用量</span>
      <SkeletonSection v-for="block in 3" :key="block" class="grow lg:min-h-0" variant="table" :rows="3" />
    </template>
  </AppCard>
</template>

<script setup>
import { computed } from "vue";
import AppCard from "@/components/AppCard.vue";
import PageHeader from "@/components/PageHeader.vue";
import ResourceTable from "@/components/ResourceTable.vue";
import SkeletonSection from "@/components/SkeletonSection.vue";
import StatusChip from "@/components/StatusChip.vue";
import { useDashboardContext } from "@/utils/dashboardContext";

const {
  statusText,
  statusKind,
  lastUpdatedAt,
  usageModel,
  packageName,
  hasLimitService,
  hasLoaded,
} = useDashboardContext();

// 空态要说清楚是「运营商返回 0 条」还是「压根没返回这个分组」，两者不是一回事。
function emptyCopy(section) {
  return section.present
    ? {
      emptyTitle: `本套餐不含${section.label}资源`,
      emptyText: `运营商在${section.label}分组下返回 0 条记录：既不是查询失败，也没有可用余量。`,
    }
    : {
      emptyTitle: `未取到${section.label}分组`,
      emptyText: `运营商这次没有返回${section.label}分组，可稍后刷新重试；这与「套餐不含${section.label}」不是一回事。`,
    };
}

const cards = computed(() => [usageModel.value.flow, usageModel.value.voice, usageModel.value.sms]
  .map((section) => ({ section, ...emptyCopy(section) })));
</script>
