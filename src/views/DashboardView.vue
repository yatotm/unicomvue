<template>
  <!-- 一页一张大卡片：概览和三张到期分组图都是它内部的圆角区域，靠留白分隔，不再是一条条
       发丝线。 -->
  <AppCard v-if="hasLoaded">
    <DashboardHero
      :model="model"
      :plan="packageName"
      :status-text="statusText"
      :status-kind="statusKind"
      :has-limit-service="hasLimitService"
      :service-count="serviceCount"
      :last-updated-at="lastUpdatedAt"
      :signed-rate="signedRate"
      :signed-rate-title="signedRateTitle"
      :qci-level="qciLevel"
      :network-quality="networkQuality"
      :token-button-title="tokenButtonTitle"
      @copy-onlin="copyClickToken"
      @press-start="startTokenLongPress"
      @press-end="finishTokenLongPress"
      @press-cancel="cancelTokenLongPress"
    />

    <!-- 显式落位：流量占满左列的两行，语音和短信各占右列一行。DOM 顺序就是手机上一列到底
         的阅读顺序。「本月消耗去向」已经删掉——到期分组里每个包本来就印着自己的已用与剩余，
         那张点图只是把同一批数字换个方式再画一遍。同一行的两块由 grid 拉伸到同一条底边，
         左列那一块因为跨了两行，底边天然和短信对齐。 -->
    <div class="grid min-w-0 grow gap-2 sm:gap-3 @[60rem]:grid-cols-[minmax(0,1fr)_21.25rem]">
      <ExpiryLanes
        class="@[60rem]:col-start-1 @[60rem]:row-start-1 @[60rem]:row-span-2"
        body-class="@[60rem]:max-h-176"
        :section="model.flow"
        title="流量按到期时间分组"
        :caption="flowCaption"
        empty-title="没有可分组的流量资源"
        empty-text="运营商在流量分组下没有返回带额度的资源：既可能是套餐本身不含流量包，也可能是这次查询没取到明细。"
      />
      <ExpiryLanes
        class="@[60rem]:col-start-2 @[60rem]:row-start-1"
        body-class="@[60rem]:max-h-80"
        :section="model.voice"
        title="语音按到期时间分组"
        :caption="voiceCaption"
        empty-title="没有可分组的语音资源"
        :empty-text="voiceEmptyText"
      />
      <ExpiryLanes
        class="@[60rem]:col-start-2 @[60rem]:row-start-2"
        body-class="@[60rem]:max-h-80"
        :section="model.sms"
        title="短信"
        :caption="`${model.sms.entries.length} 条资源`"
        :empty-title="smsEmptyTitle"
        :empty-text="smsEmptyText"
      />
    </div>
  </AppCard>

  <DashboardSkeleton v-else />
</template>

<script setup>
import { computed } from "vue";
import AppCard from "@/components/AppCard.vue";
import DashboardHero from "@/components/DashboardHero.vue";
import DashboardSkeleton from "@/components/DashboardSkeleton.vue";
import ExpiryLanes from "@/components/ExpiryLanes.vue";
import { TOKEN_LONG_PRESS_MS } from "@/config/unicom";
import { useDashboardContext } from "@/utils/dashboardContext";

const {
  statusText,
  statusKind,
  lastUpdatedAt,
  signedRate,
  signedRateTitle,
  qciLevel,
  networkQuality,
  usageModel,
  packageName,
  hasLimitService,
  hasLoaded,
  services,
  onlinToken,
  ecsToken,
  copyText,
  showToast,
} = useDashboardContext();

const model = computed(() => usageModel.value);
const serviceCount = computed(() => services.value.length);

// 一条都没有的时候就没有刻度可言，说明文字里也不能出现「0–0」这种空刻度。
function scaleLabel(section) {
  const { value, unit } = section.unit.parts(section.scaleMax);
  return `${Number(value)}${unit === "GB" || unit === "MB" ? unit : ` ${unit}`}`;
}

const flowCaption = computed(() => (
  model.value.flow.groups.length
    ? `条长＝绝对额度，0–${scaleLabel(model.value.flow)} 共用刻度；越深到期越近，灰段为已用`
    : "按到期时间分组，条长＝绝对额度"
));
const voiceCaption = computed(() => (
  model.value.voice.groups.length ? `共用 0–${scaleLabel(model.value.voice)} 刻度` : "按到期时间分组"
));

const voiceEmptyText = computed(() => (
  model.value.voice.present
    ? "运营商在语音分组下返回 0 条记录：既不是查询失败，也没有可用余量。"
    : "运营商没有返回语音分组，可稍后刷新重试。"
));
const smsEmptyTitle = computed(() => (
  model.value.sms.present ? "本套餐不含短信资源" : "未取到短信分组"
));
const smsEmptyText = computed(() => (
  model.value.sms.present
    ? "运营商在短信分组下返回 0 条记录：既不是查询失败，也没有可用余量。"
    : "运营商没有返回短信分组，可稍后刷新重试；这与「套餐不含短信」不是一回事。"
));

const tokenButtonTitle = computed(() => (
  packageName.value
    ? `套餐：${packageName.value}（点击复制 onlin_token，长按复制 ecs_token）`
    : "点击复制 onlin_token，长按复制 ecs_token"
));

let tokenPressStartedAt = 0;
let tokenPressPointerId = null;
let suppressTokenClickUntil = 0;

function startTokenLongPress(event) {
  if (!event.isPrimary || event.button !== 0) return;
  tokenPressStartedAt = performance.now();
  tokenPressPointerId = event.pointerId;
  suppressTokenClickUntil = 0;
}

function finishTokenLongPress(event) {
  if (event.pointerId !== tokenPressPointerId) return;
  const pressDuration = performance.now() - tokenPressStartedAt;
  tokenPressStartedAt = 0;
  tokenPressPointerId = null;

  if (pressDuration >= TOKEN_LONG_PRESS_MS) {
    suppressTokenClickUntil = performance.now() + 1000;
    void copyText(ecsToken.value, "ecs_token");
  }
}

function cancelTokenLongPress() {
  tokenPressStartedAt = 0;
  tokenPressPointerId = null;
  suppressTokenClickUntil = 0;
}

function copyClickToken(event) {
  if (performance.now() <= suppressTokenClickUntil) {
    suppressTokenClickUntil = 0;
    event.preventDefault();
    return;
  }

  if (!onlinToken.value) {
    showToast("当前账号没有 onlin_token，请使用短信验证码登录", "error");
    return;
  }
  void copyText(onlinToken.value, "onlin_token");
}
</script>
