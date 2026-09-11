<template>
  <!-- 从 lg: 起外壳锁死在一屏高，滚动条归主区所有（.main-scroll 带 overscroll-behavior:
       contain）。侧栏是滚动容器的兄弟节点而不是子节点，所以主区滚到头时的回弹再也带不动它。
       lg: 以下没有侧栏，页面照旧由文档滚动，底部标签栏和安全区一行没动。 -->
  <div
    class="flex min-h-dvh w-full min-w-0 text-on-surface lg:h-dvh lg:min-h-0 lg:overflow-hidden"
    :class="{ 'app-locked': loginOpen }"
    :inert="loginOpen || undefined"
    :aria-hidden="loginOpen ? 'true' : undefined"
  >
    <AppSidebar class="hidden shrink-0 lg:flex" />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <AppTopBar
        ref="topBarRef"
        :is-loading="isLoading"
        :is-sharing="isSharing"
        :can-share="canShare"
        :share-hint="shareHint"
        :accounts="accounts"
        :active-account-id="activeAccountId"
        :current-account-label="currentAccountLabel"
        @refresh="refreshUsage"
        @share="shareDashboard"
        @select-account="selectAccount"
      />

      <!-- pt-4 / lg:pt-6 是顶栏和卡片之间那道被点名要加大的缝；lg:min-h-full 把卡片撑到主区的
           完整高度，四条路由的卡片因此是同一个矩形（同上边、同宽、同高），内容短的那一页
           补白落在卡片自己里，而不是让卡片缩成一小块。
           这里是**下限**不是上限：试过钉成 lg:h-full，1280×900 上确实不用滚整页了，代价是
           右列那两块图被裁在半行上——一个靠刻度读数的图表，宁可让主区滚，也不能把刻度和
           最后一条 lane 一起裁掉。区块内部仍然能滚（AppSection 的 .pane-scroll），那是给
           单块内容特别长的情况留的。 -->
      <main class="main-scroll w-full min-w-0 flex-1 px-4 pb-24 pt-4 lg:min-h-0 lg:overflow-y-auto lg:pb-4 lg:pt-6">
        <!-- 顶栏不再印页面标题，但这一页仍然需要一个可访问的名字和一级标题：`document.title`
             负责标签页和读屏器的页面名，这个只给读屏器的 <h1> 负责标题大纲。 -->
        <h1 class="sr-only">{{ pageTitle }}</h1>

        <div
          ref="captureTargetRef"
          class="@container mx-auto flex w-full max-w-[76rem] flex-col lg:min-h-full"
          :class="{ 'is-capturing': isSharing }"
        >
          <RouterView v-slot="{ Component }">
            <Transition
              enter-active-class="transition-opacity duration-150 ease-standard"
              enter-from-class="opacity-0"
              leave-active-class="transition-opacity duration-150 ease-accelerate"
              leave-to-class="opacity-0"
              mode="out-in"
            >
              <component :is="Component" />
            </Transition>
          </RouterView>
        </div>

        <a
          ref="downloadLinkRef"
          class="hidden"
          :href="downloadUrl"
          :download="downloadFilename"
          tabindex="-1"
          aria-hidden="true"
        ></a>
      </main>
    </div>

    <AppTabBar />
    <LoginDialog
      v-model:open="loginOpen"
      :can-close="hasAccounts"
      :notice="loginNotice"
      :return-focus-target="loginReturnFocusTarget"
      @authenticated="handleAuthenticated"
      @open-privacy="openPrivacy"
    />
    <AppToast :message="toastMessage" :kind="toastKind" />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppSidebar from "@/components/AppSidebar.vue";
import AppTabBar from "@/components/AppTabBar.vue";
import AppToast from "@/components/AppToast.vue";
import AppTopBar from "@/components/AppTopBar.vue";
import LoginDialog from "@/components/LoginDialog.vue";
import { useAccounts } from "@/composables/useAccounts";
import { usePrivacy } from "@/composables/usePrivacy";
import { useScreenshotShare } from "@/composables/useScreenshotShare";
import { useTheme } from "@/composables/useTheme";
import { useToast } from "@/composables/useToast";
import { useUsageDashboard } from "@/composables/useUsageDashboard";
import { fetchUsage } from "@/services/unicomApi";
import { provideDashboard } from "@/utils/dashboardContext";
import { buildUsageModel } from "@/utils/usageBuckets";

const route = useRoute();
const loginOpen = ref(false);
const loginNotice = ref("");
const captureTargetRef = useTemplateRef("captureTargetRef");
const downloadLinkRef = useTemplateRef("downloadLinkRef");
const topBarRef = useTemplateRef("topBarRef");
const loginReturnFocusTarget = shallowRef(null);
// The shell chrome sits outside the captured subtree, so nothing has to be filtered out of it.
const excludedFromCapture = shallowRef(null);

const accountStore = useAccounts();
const {
  accounts,
  activeAccountId,
  currentAccountLabel,
  ecsToken,
  onlinToken,
  hasAccounts,
} = accountStore;
const { isDark } = useTheme();
const { openPrivacy } = usePrivacy();
const { message: toastMessage, kind: toastKind, showToast } = useToast();

function requireLogin(message = "") {
  loginReturnFocusTarget.value = null;
  topBarRef.value?.closeMenu();
  loginNotice.value = message;
  loginOpen.value = true;
}

// 到期时间、同名条目的返回顺序这些事实只存在于运营商的原始分组里，domain 的卡片不带。
// useUsageDashboard 本来就允许注入请求函数，所以视图层在这里留一份原始响应，
// 数据管线一行没动。只留下 code 0000 的那一份，卡片和这份原始数据才不会各说各话。
const rawUsage = shallowRef(null);

async function fetchUsageAndKeep(token, signal, cookie) {
  const payload = await fetchUsage(token, signal, cookie);
  if (payload?.ok !== false && String(payload?.code ?? "") === "0000") rawUsage.value = payload;
  return payload;
}

const dashboard = useUsageDashboard(
  { accountStore, notify: showToast, onRequireLogin: requireLogin },
  { fetchUsage: fetchUsageAndKeep },
);
const { isLoading, hasLoaded } = dashboard;

const usageModel = computed(() => buildUsageModel(hasLoaded.value ? rawUsage.value : null));

const {
  isSharing,
  downloadUrl,
  downloadFilename,
  shareScreenshot,
  copyText,
} = useScreenshotShare({
  captureTarget: captureTargetRef,
  excludedTarget: excludedFromCapture,
  downloadLink: downloadLinkRef,
  isDark,
  notify: showToast,
  updateStatus: dashboard.setStatus,
});

const pageTitle = computed(() => String(route.meta?.title || "看板"));
// Settings holds controls, not data — sharing a screenshot of it would leak nothing useful.
const canShare = computed(() => route.meta?.shareable === true && hasLoaded.value && Boolean(ecsToken.value));
const shareHint = computed(() => (
  route.meta?.shareable === true
    ? `把「${pageTitle.value}」的数据区截图并复制或下载`
    : "设置页没有可分享的数据，请切换到看板、用量明细或已订业务"
));

function refreshUsage() {
  topBarRef.value?.closeMenu();
  void dashboard.refresh();
}

function selectAccount(accountId) {
  dashboard.selectAccount(accountId);
}

async function shareDashboard() {
  topBarRef.value?.closeMenu();
  await nextTick();
  await shareScreenshot();
}

function handleAuthenticated(payload) {
  const account = accountStore.upsertAccount(payload);
  if (!account) {
    showToast("账号保存失败，请重试", "error");
    return;
  }

  loginNotice.value = "";
  dashboard.resetDashboard();
  dashboard.setStatus("登录成功，正在查询...", "ok");
  void dashboard.refresh();
}

function showAddAccount(returnFocusTarget = null) {
  loginReturnFocusTarget.value = returnFocusTarget;
  loginNotice.value = "";
  loginOpen.value = true;
}

provideDashboard({
  ...dashboard,
  usageModel,
  accounts,
  activeAccountId,
  currentAccountLabel,
  ecsToken,
  onlinToken,
  hasAccounts,
  copyText,
  showToast,
  showAddAccount,
  selectAccount,
  removeAccount: () => dashboard.removeCurrentAccount(),
  openPrivacy,
});

onMounted(() => {
  accountStore.initializeAccounts();
  dashboard.startAutoRefresh();
});
</script>
