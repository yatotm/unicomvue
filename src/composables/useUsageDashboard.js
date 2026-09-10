import { computed, onScopeDispose, readonly, ref } from "vue";
import { UNICOM_REFRESH_INTERVAL_MS } from "../config/unicom.js";
import { accountDisplayName } from "../domain/accounts.js";
import {
  buildCardsFromOcs,
  extractPackageName,
  orderedServices,
  resolveQciLevel,
  resolveSignedRate,
  SIGNED_RATE_HINT,
} from "../domain/usage.js";
import {
  fetchBasicData,
  fetchQciData,
  fetchUsage,
} from "../services/unicomApi.js";

function getAccountFailure(data, status = 0) {
  if (data?.code === "ACCESS_DENIED") return null;
  if (data?.code === "BLACKLIST" || data?.raw === "999997") {
    return {
      status: "账号被限制(黑名单)，请稍后重试",
      loginMessage: "您的账号被联通限制 (999997)",
    };
  }

  const upstreamTokenFailure = data?.code === "UPSTREAM_NON_JSON"
    && /99999[89]/.test(String(data?.raw || ""));
  if (data?.code === "TOKEN_EXPIRED" || status === 401 || upstreamTokenFailure) {
    return { status: "Token 已失效，请重新登录", loginMessage: "" };
  }

  return null;
}

function assertSuccessfulUsage(data) {
  if (data?.ok === false || (data?.code && String(data.code) !== "0000")) {
    throw new Error(data?.msg || "查询失败");
  }
}

function nowLabel() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function useUsageDashboard(
  { accountStore, notify, onRequireLogin },
  {
    fetchUsage: fetchUsageRequest = fetchUsage,
    fetchBasicData: fetchBasicDataRequest = fetchBasicData,
    fetchQciData: fetchQciDataRequest = fetchQciData,
  } = {},
) {
  const statusText = ref("准备中…");
  const statusKind = ref("info");
  const isLoading = ref(false);
  const lastUpdatedAt = ref("—");
  const signedRate = ref("—");
  const signedRateTitle = ref(SIGNED_RATE_HINT);
  const qciLevel = ref("—");
  const networkQuality = ref("");
  const usageCards = ref([]);
  const packageName = ref("");
  const hasLimitService = ref(false);
  const services = ref([]);
  const hasServiceList = ref(false);
  const paused = ref(false);
  const hasLoaded = ref(false);

  let disposed = false;
  let autoRefreshEnabled = false;
  let refreshTimer = null;
  let activeController = null;
  let requestGeneration = 0;
  let failedToken = "";

  const isEmpty = computed(() => hasLoaded.value && usageCards.value.length === 0);

  function setStatus(message, kind = "info") {
    statusText.value = String(message || "");
    statusKind.value = kind;
  }

  function clearRefreshTimer() {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function scheduleRefresh() {
    clearRefreshTimer();
    if (!autoRefreshEnabled || paused.value || disposed) return;
    if (failedToken && failedToken === accountStore.ecsToken.value) return;

    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, UNICOM_REFRESH_INTERVAL_MS);
  }

  function resetNetworkInfo() {
    signedRate.value = "—";
    signedRateTitle.value = SIGNED_RATE_HINT;
    qciLevel.value = "—";
    networkQuality.value = "";
    hasLimitService.value = false;
    services.value = [];
    hasServiceList.value = false;
  }

  function resetDashboard() {
    packageName.value = "";
    usageCards.value = [];
    hasLoaded.value = false;
    lastUpdatedAt.value = "—";
    resetNetworkInfo();
  }

  function abortRefresh() {
    requestGeneration += 1;
    activeController?.abort();
    activeController = null;
    isLoading.value = false;
  }

  function handleAccountFailure(failure, token) {
    const alreadyReported = failedToken === token;
    failedToken = token;
    resetDashboard();
    setStatus(failure.status, "error");
    if (!alreadyReported) onRequireLogin(failure.loginMessage);
  }

  function assertCurrentRequest(generation, token, signal) {
    return !disposed
      && !signal.aborted
      && generation === requestGeneration
      && token === accountStore.ecsToken.value;
  }

  // 只有 0000 的响应才是事实；失败的那一路当作没有数据，不能沿用上一轮的值。
  function successfulValue(result) {
    return result.status === "fulfilled" && String(result.value?.code || "") === "0000"
      ? result.value
      : null;
  }

  function applyNetworkInfo(basic, qci) {
    resetNetworkInfo();
    if (basic) accountStore.updateActiveAccountMobile(basic.mobile);
    if (qci) {
      qciLevel.value = resolveQciLevel(qci);
      networkQuality.value = Array.isArray(qci.network_quality_services)
        ? qci.network_quality_services.filter((level) => ["VIP", "VVIP"].includes(level)).join(" / ")
        : "";
      hasLimitService.value = qci.has_limit_service === true;
      hasServiceList.value = qci.has_service_list === true;
      services.value = orderedServices(qci);
    }

    const rate = resolveSignedRate(basic, qci);
    signedRate.value = rate.text;
    signedRateTitle.value = rate.title;
  }

  async function refresh() {
    clearRefreshTimer();
    const token = accountStore.ecsToken.value;
    const cookie = accountStore.currentAccount?.value?.cookie || "";

    if (!token) {
      setStatus("未登录", "info");
      onRequireLogin("");
      scheduleRefresh();
      return;
    }

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const generation = ++requestGeneration;

    isLoading.value = true;
    setStatus("请求中…", "info");

    try {
      const usage = await fetchUsageRequest(token, controller.signal, cookie);
      if (!assertCurrentRequest(generation, token, controller.signal)) return;

      const usageFailure = getAccountFailure(usage);
      if (usageFailure) {
        handleAccountFailure(usageFailure, token);
        return;
      }

      assertSuccessfulUsage(usage);
      failedToken = "";
      const nextPackageName = extractPackageName(usage);
      packageName.value = nextPackageName;
      accountStore.updateAccountPackageName(token, nextPackageName);
      usageCards.value = buildCardsFromOcs(usage);
      hasLoaded.value = true;

      const [basicResult, qciResult] = await Promise.allSettled([
        fetchBasicDataRequest(token, controller.signal, cookie),
        fetchQciDataRequest(token, controller.signal, cookie),
      ]);
      if (!assertCurrentRequest(generation, token, controller.signal)) return;

      applyNetworkInfo(successfulValue(basicResult), successfulValue(qciResult));

      lastUpdatedAt.value = nowLabel();
      const partial = [basicResult, qciResult].some((result) => (
        result.status === "rejected" || String(result.value?.code) !== "0000"
      ));
      setStatus(partial ? "余量已刷新，部分网络信息暂不可用" : "已刷新", partial ? "info" : "ok");
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (!assertCurrentRequest(generation, token, controller.signal)) return;
      const failure = getAccountFailure(error?.data, error?.status);
      if (failure) handleAccountFailure(failure, token);
      else if (!disposed) setStatus(error?.message || "查询失败", "error");
    } finally {
      if (generation === requestGeneration) {
        activeController = null;
        isLoading.value = false;
        scheduleRefresh();
      }
    }
  }

  function selectAccount(accountId) {
    if (accountId === accountStore.activeAccountId.value) return false;
    if (!accountStore.selectAccount(accountId)) return false;
    abortRefresh();
    resetDashboard();
    setStatus("正在切换账号…", "info");
    void refresh();
    return true;
  }

  function removeCurrentAccount() {
    const removed = accountStore.removeActiveAccount();
    if (!removed) return null;

    abortRefresh();
    resetDashboard();
    if (accountStore.hasAccounts.value) {
      setStatus("已切换账号", "info");
      notify(`${accountDisplayName(removed)} 已从本机移除`);
      void refresh();
    } else {
      setStatus("未登录", "info");
      notify("账号已从本机移除");
      onRequireLogin("");
    }
    return removed;
  }

  function togglePaused() {
    paused.value = !paused.value;
    setStatus(paused.value ? "自动刷新已暂停" : "自动刷新已恢复", "info");
    if (paused.value) clearRefreshTimer();
    else scheduleRefresh();
  }

  function startAutoRefresh() {
    autoRefreshEnabled = true;
    void refresh();
  }

  function stopAutoRefresh() {
    autoRefreshEnabled = false;
    clearRefreshTimer();
    abortRefresh();
  }

  onScopeDispose(() => {
    disposed = true;
    stopAutoRefresh();
  });

  return {
    statusText: readonly(statusText),
    statusKind: readonly(statusKind),
    isLoading: readonly(isLoading),
    lastUpdatedAt: readonly(lastUpdatedAt),
    signedRate: readonly(signedRate),
    signedRateTitle: readonly(signedRateTitle),
    qciLevel: readonly(qciLevel),
    networkQuality: readonly(networkQuality),
    usageCards: readonly(usageCards),
    packageName: readonly(packageName),
    hasLimitService: readonly(hasLimitService),
    services: readonly(services),
    hasServiceList: readonly(hasServiceList),
    paused: readonly(paused),
    hasLoaded: readonly(hasLoaded),
    isEmpty,
    setStatus,
    resetDashboard,
    refresh,
    selectAccount,
    removeCurrentAccount,
    togglePaused,
    startAutoRefresh,
    stopAutoRefresh,
  };
}
