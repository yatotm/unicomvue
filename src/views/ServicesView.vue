<template>
  <!-- 一页一张大卡片：抬头是卡片自己的标题行，每个业务分组是它内部的一块圆角区域，
       两列 grid 保证同一行齐底。 -->
  <AppCard>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-4 pt-1 sm:px-5">
      <!-- 分组规则和日期含义挪进了标题的 title：那是一次性的说明，不该每次进来都占一行。 -->
      <h2
        class="shrink-0 text-title text-on-surface tabular-nums sm:text-display"
        title="日期为业务生效日期；分组按业务编号归类，组内按条目数从多到少排列"
      >{{ total }} 项生效中的业务</h2>
      <p
        v-if="hasLimitService"
        class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-chip bg-danger-container px-2.5 text-caption text-on-danger-container"
        title="已订业务中检测到“限速服务(50027)”，该业务会压低上网速率"
      >
        <span class="size-1.5 shrink-0 rounded-chip bg-danger" aria-hidden="true"></span>
        限速服务
      </p>
      <p
        v-if="networkQuality"
        class="ml-auto inline-flex h-6 shrink-0 items-center rounded-chip bg-primary-container px-2.5 text-caption text-on-primary-container"
        title="联通已订业务接口返回的网络质量业务等级（VIP / VVIP），QCI 正是由它推断得出。"
      >
        网络质量业务 {{ networkQuality }}
      </p>
    </div>

    <ServiceSection :services="services" :has-list="hasServiceList" :loaded="hasLoaded" />
  </AppCard>
</template>

<script setup>
import { computed } from "vue";
import AppCard from "@/components/AppCard.vue";
import ServiceSection from "@/components/ServiceSection.vue";
import { groupServices } from "@/domain/services";
import { useDashboardContext } from "@/utils/dashboardContext";

const {
  services,
  hasServiceList,
  hasLoaded,
  hasLimitService,
  networkQuality,
} = useDashboardContext();

const total = computed(() => (
  groupServices(services.value).reduce((count, group) => count + group.items.length, 0)
));
</script>
