<template>
  <!-- 一页一张大卡片：套餐抬头是卡片自己的标题行，三张资源表是它内部的圆角区域，靠留白分隔。 -->
  <AppCard>
    <template v-if="hasLoaded">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-4 pt-1 sm:px-5">
        <h2 class="min-w-0 max-w-full truncate text-title text-on-surface sm:text-display" :title="packageName">
          {{ packageName || "余量 / 用量展示" }}
        </h2>
        <p
          class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-chip px-2.5 text-caption"
          :class="statusKind === 'error' ? 'bg-danger-container text-on-danger-container' : 'bg-primary-container text-on-primary-container'"
        >
          <span
            class="size-1.5 shrink-0 rounded-chip"
            :class="statusKind === 'error' ? 'bg-danger' : 'bg-primary'"
            aria-hidden="true"
          ></span>
          {{ statusText }}
        </p>
        <p
          v-if="hasLimitService"
          class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-chip bg-danger-container px-2.5 text-caption text-on-danger-container"
          title="已订业务中检测到“限速服务(50027)”，该业务会压低上网速率"
        >
          <span class="size-1.5 shrink-0 rounded-chip bg-danger" aria-hidden="true"></span>
          限速服务
        </p>
        <!-- 签约速率和 QCI 是看板那四格的事实，它们在那里带着推断依据的 title；
             在这一页原样再印一遍只是又一行小字。留下的是这一页真正需要的那个：数据有多新。 -->
        <p class="ml-auto shrink-0 text-caption text-on-surface-muted tabular-nums">
          上次刷新 {{ lastUpdatedAt }}
        </p>
      </div>

      <ResourceTable
        v-for="card in cards"
        :key="card.section.id"
        class="grow"
        :section="card.section"
        :empty-title="card.emptyTitle"
        :empty-text="card.emptyText"
      />
    </template>

    <template v-else>
      <span class="sr-only" aria-busy="true" aria-live="polite">正在查询余量与用量</span>
      <div
        v-for="block in 3"
        :key="block"
        class="grow rounded-control bg-surface-raised px-4 pb-4 pt-4 sm:px-5"
        aria-hidden="true"
      >
        <div class="skeleton h-5 w-32 rounded-chip"></div>
        <div v-for="row in 3" :key="row" class="mt-3.5 flex items-center gap-3">
          <div class="skeleton h-4 min-w-0 flex-1 rounded-chip"></div>
          <div class="skeleton hidden h-3 w-24 rounded-chip sm:block"></div>
          <div class="skeleton h-3 w-16 rounded-chip"></div>
          <div class="skeleton hidden h-1.5 w-32 rounded-chip sm:block"></div>
        </div>
      </div>
    </template>
  </AppCard>
</template>

<script setup>
import { computed } from "vue";
import AppCard from "@/components/AppCard.vue";
import ResourceTable from "@/components/ResourceTable.vue";
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
