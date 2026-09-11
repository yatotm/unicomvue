<template>
  <!-- 卡片的直接子元素：抬头 + 业务分组网格，一条全宽横线；分组之间的缝由接缝网格画。 -->
  <AppCard>
    <PageHeader
      numeric
      :title="`${total} 项生效中的业务`"
      hint="日期为业务生效日期；分组按业务编号归类，组内按条目数从多到少排列"
    >
      <StatusChip
        v-if="hasLimitService"
        tone="danger"
        dot
        text="限速服务"
        hint="已订业务中检测到“限速服务(50027)”，该业务会压低上网速率"
      />
      <StatusChip
        v-if="networkQuality"
        class="ml-auto"
        :text="`网络质量业务 ${networkQuality}`"
        hint="联通已订业务接口返回的网络质量业务等级（VIP / VVIP），QCI 正是由它推断得出。"
      />
    </PageHeader>

    <ServiceSection :services="services" :has-list="hasServiceList" :loaded="hasLoaded" />
  </AppCard>
</template>

<script setup>
import { computed } from "vue";
import AppCard from "@/components/AppCard.vue";
import PageHeader from "@/components/PageHeader.vue";
import ServiceSection from "@/components/ServiceSection.vue";
import StatusChip from "@/components/StatusChip.vue";
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
