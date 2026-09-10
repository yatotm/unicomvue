import assert from "node:assert/strict";
import { test } from "node:test";
import { effectScope, ref } from "vue";
import { useUsageDashboard } from "../src/composables/useUsageDashboard.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("a stale account failure cannot overwrite or remove the current account", async () => {
  const staleUsage = createDeferred();
  const activeToken = ref("token-current-account-value");
  let removedAccountCount = 0;
  let loginRequestCount = 0;

  const accountStore = {
    ecsToken: activeToken,
    hasAccounts: ref(true),
    updateAccountPackageName() {},
    updateActiveAccountMobile() {},
    removeActiveAccount() {
      removedAccountCount += 1;
      return { token: activeToken.value };
    },
  };
  const scope = effectScope();
  const dashboard = scope.run(() => useUsageDashboard(
    {
      accountStore,
      notify: () => {},
      onRequireLogin: () => {
        loginRequestCount += 1;
      },
    },
    {
      fetchUsage: (token) => (
        token === "token-stale-account-value"
          ? staleUsage.promise
          : Promise.resolve({ code: "0000", resources: [], unshared: [] })
      ),
      fetchBasicData: () => Promise.resolve({ code: "0000", rate_mbps: 2000 }),
      fetchQciData: () => Promise.resolve({ code: "0000", qci_num: 6 }),
    },
  ));

  activeToken.value = "token-stale-account-value";
  const staleRefresh = dashboard.refresh();
  activeToken.value = "token-current-account-value";
  await dashboard.refresh();

  const staleError = new Error("stale token failure");
  staleError.status = 401;
  staleError.data = { code: "TOKEN_EXPIRED" };
  staleUsage.reject(staleError);
  await staleRefresh;

  assert.equal(removedAccountCount, 0);
  assert.equal(loginRequestCount, 0);
  assert.equal(dashboard.statusText.value, "已刷新");
  assert.equal(dashboard.signedRate.value, "2000Mbps");
  assert.equal(dashboard.qciLevel.value, "6");

  scope.stop();
});

test("后端访问密钥错误不能移除联通账号", async (t) => {
  let removed = 0;
  const scope = effectScope();
  t.after(() => scope.stop());
  const error = Object.assign(new Error("后端访问密钥无效，请检查配置"), {
    status: 401, data: { code: "ACCESS_DENIED" },
  });
  const dashboard = scope.run(() => useUsageDashboard({
    accountStore: {
      ecsToken: ref("t".repeat(40)), hasAccounts: ref(true),
      removeActiveAccount: () => { removed += 1; },
    },
    notify() {}, onRequireLogin() {},
  }, { fetchUsage: async () => { throw error; } }));
  await dashboard.refresh();
  assert.equal(removed, 0);
  assert.match(dashboard.statusText.value, /访问密钥/);
});

test("查询携带当前账号 Cookie，会话失败保留账号并避免反复弹窗", async (t) => {
  const scope = effectScope();
  t.after(() => scope.stop());
  let removed = 0;
  let loginRequests = 0;
  const dashboard = scope.run(() => useUsageDashboard({
    accountStore: {
      ecsToken: ref("t".repeat(40)), currentAccount: ref({ cookie: "session=verified" }), hasAccounts: ref(true),
      removeActiveAccount: () => { removed += 1; },
    },
    notify() {}, onRequireLogin() { loginRequests += 1; },
  }, { fetchUsage: async (_token, _signal, cookie) => {
    assert.equal(cookie, "session=verified");
    return { code: "TOKEN_EXPIRED" };
  } }));
  await dashboard.refresh();
  await dashboard.refresh();
  assert.equal(removed, 0);
  assert.equal(loginRequests, 1);
  assert.match(dashboard.statusText.value, /重新登录/);
});

test("基础信息查询失败后清除上次速率与 QCI，显示部分刷新状态", async (t) => {
  const scope = effectScope();
  t.after(() => scope.stop());
  let unavailable = false;
  let loginRequests = 0;
  const dashboard = scope.run(() => useUsageDashboard({
    accountStore: {
      ecsToken: ref("t".repeat(40)), hasAccounts: ref(true),
      updateAccountPackageName() {}, updateActiveAccountMobile() {},
    },
    notify() {}, onRequireLogin() { loginRequests += 1; },
  }, {
    fetchUsage: async () => ({ code: "0000", resources: [] }),
    fetchBasicData: async () => {
      if (unavailable) throw new Error("上游超时");
      return { code: "0000", rate_mbps: 500 };
    },
    fetchQciData: async () => unavailable ? { ok: false, code: "TOKEN_EXPIRED" } : { code: "0000", qci_num: 8, has_limit_service: true },
  }));
  await dashboard.refresh();
  assert.equal(dashboard.signedRate.value, "500Mbps");
  assert.equal(dashboard.hasLimitService.value, true);
  unavailable = true;
  await dashboard.refresh();
  assert.equal(dashboard.signedRate.value, "—");
  assert.equal(dashboard.qciLevel.value, "—");
  assert.equal(dashboard.hasLimitService.value, false);
  assert.match(dashboard.statusText.value, /部分网络信息暂不可用/);
  assert.equal(loginRequests, 0);
});

function createQciDashboard(t, readQci) {
  const scope = effectScope();
  t.after(() => scope.stop());
  return scope.run(() => useUsageDashboard({
    accountStore: {
      ecsToken: ref("t".repeat(40)), hasAccounts: ref(true),
      updateAccountPackageName() {}, updateActiveAccountMobile() {},
    }, notify() {}, onRequireLogin() {},
  }, {
    fetchUsage: async () => ({ code: "0000", resources: [] }),
    fetchBasicData: async () => ({ code: "0000", rate_mbps: 2000 }),
    fetchQciData: async () => readQci(),
  }));
}

test("页面按生效的网络质量业务推断 QCI，并与业务标记分开展示", async (t) => {
  let qciResponse = { code: "0000", network_quality_services: ["VIP"], has_service_list: true, max_net_mbps: 2000 };
  const dashboard = createQciDashboard(t, () => qciResponse);

  await dashboard.refresh();
  assert.equal(dashboard.signedRate.value, "2000Mbps");
  assert.equal(dashboard.qciLevel.value, "8（推断）");
  assert.equal(dashboard.networkQuality.value, "VIP");

  qciResponse = { code: "0000", network_quality_services: ["VIP", "VVIP"], has_service_list: true };
  await dashboard.refresh();
  assert.equal(dashboard.qciLevel.value, "6（推断）");
  assert.equal(dashboard.networkQuality.value, "VIP / VVIP");

  qciResponse = { code: "0000", network_quality_services: [], has_service_list: true };
  await dashboard.refresh();
  assert.equal(dashboard.qciLevel.value, "9（推断）");
  assert.equal(dashboard.networkQuality.value, "");
});

test("缺少业务清单时保持未确认，接口明确返回的 QCI 优先且不标推断", async (t) => {
  let qciResponse = { code: "0000", has_limit_service: true };
  const dashboard = createQciDashboard(t, () => qciResponse);

  await dashboard.refresh();
  assert.equal(dashboard.qciLevel.value, "未确认");
  assert.equal(dashboard.hasLimitService.value, true);

  qciResponse = { code: "0000", qci_num: 7, network_quality_services: ["VIP"], has_service_list: true };
  await dashboard.refresh();
  assert.equal(dashboard.qciLevel.value, "7");
});

test("已订业务清单随 QCI 响应下发，查询失败时清空", async (t) => {
  const services = [
    { id: "11006078", name: "5G-A上网服务(下行峰值2Gbps上行峰值200Mbps）", since: "2024-01-15", downlink_mbps: 2000 },
    { id: "50000", name: "语音主服务", since: "2020-05-06" },
  ];
  let qciResponse = { code: "0000", has_service_list: true, network_quality_services: [], services };
  const dashboard = createQciDashboard(t, () => qciResponse);

  await dashboard.refresh();
  assert.equal(dashboard.hasServiceList.value, true);
  assert.deepEqual(dashboard.services.value.map((service) => service.id), ["11006078", "50000"]);
  // 基础接口给 2000Mbps，业务名也给 2000Mbps：取最高值，两个来源都写进提示。
  assert.equal(dashboard.signedRate.value, "2000Mbps");
  assert.match(dashboard.signedRateTitle.value, /套餐签约 2000Mbps/);
  assert.match(dashboard.signedRateTitle.value, /5G-A上网服务/);

  qciResponse = { code: "0000", has_service_list: false, services: [] };
  await dashboard.refresh();
  assert.equal(dashboard.hasServiceList.value, false);
  assert.deepEqual(dashboard.services.value, []);
  assert.equal(dashboard.signedRate.value, "2000Mbps");
  assert.ok(!dashboard.signedRateTitle.value.includes("5G-A上网服务"));
});

test("QCI 查询失败时不推断默认承载 9", async (t) => {
  const dashboard = createQciDashboard(t, () => { throw new Error("上游超时"); });
  await dashboard.refresh();
  assert.equal(dashboard.qciLevel.value, "—");
  assert.match(dashboard.statusText.value, /部分网络信息暂不可用/);
});
