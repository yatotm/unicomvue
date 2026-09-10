import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyUpstreamFailure,
  normalizeBasicData,
  normalizeOcs,
  normalizeQci,
  parseDownlinkMbps,
} from "../src/upstream/normalize.js";

// 实测 queryOrderRelationship 的条目形状：字段名与取值格式照抄，业务名/编号/日期用通用示例。
function serviceEntry(overrides = {}) {
  return {
    productmode: "00",
    completedate: "20230301000000",
    servicestate: "1",
    ordermethod: "",
    productid: "10000001",
    discntvalue: "",
    packageid: "20000002",
    packagename: "示例叠加包",
    productname: "示例套餐",
    servicename: "示例业务",
    serviceid: "50000",
    completedateFmt: "2023-03-01 00:00:00",
    ...overrides,
  };
}

function orderedResponse(services) {
  return { code: "0000", desc: "success", data: { serviceinfo: services.map(serviceEntry) } };
}

// 实测 queryOcs 明细的形状：字段名照抄，套餐名/编号/号码/日期一律用通用示例。
const VICE_CARD_BLOB = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5";

function flowDetail(overrides = {}) {
  return {
    feePolicyId: "9000001",
    feePolicyName: "国内通用流量包",
    addupItemCode: "A0001",
    addUpItemName: "国内通用流量",
    elemType: "3",
    flowType: "1",
    resourceType: "1",
    realresourcetype: "1",
    typemark: "0",
    limited: "0",
    hide: false,
    total: "3072.00",
    use: "1024.00",
    remain: "2048.00",
    usedPercent: "33.33",
    endDate: "2026-12-31",
    endDate1: "2026-12-31 23:59:59",
    endXsbDate: "2026-12-31",
    resourceSource: "1",
    viceCardlist: [{
      currentLoginFlag: "1",
      use: "0.00",
      userMobile: VICE_CARD_BLOB,
      userMobileKey: "mobile1",
      usernumber: "130****0000",
      viceCardflag: "1",
    }],
    ...overrides,
  };
}

function ocsResponse(overrides = {}) {
  return {
    code: "0000",
    desc: "success",
    packageName: "示例套餐",
    usernumber: "13000000000",
    username: "示例用户",
    resources: [{
      type: "1",
      userResource: "1024.00",
      remainResource: "2048.00",
      url: "https://example.test/flow?userNumber=13000000000",
      wTurl: "https://example.test/wt",
      wangTurl: "https://example.test/wangt",
      resourceSource: "1",
      details: [flowDetail()],
    }],
    unshared: [{
      type: "2",
      userResource: "30",
      remainResource: "70",
      details: [flowDetail({ elemType: "1", feePolicyName: "国内语音", flowType: "" })],
    }],
    ...overrides,
  };
}

test("classifyUpstreamFailure flags a blacklisted account", () => {
  assert.deepEqual(classifyUpstreamFailure("{}", { code: "999997" }), {
    ok: false,
    code: "BLACKLIST",
    raw: "999997",
    msg: "账号被限制",
  });
});

test("classifyUpstreamFailure flags an expired token from parsed JSON", () => {
  for (const code of ["999998", "999999"]) {
    const result = classifyUpstreamFailure("{}", { code });
    assert.equal(result.code, "TOKEN_EXPIRED");
    assert.equal(result.raw, code);
  }
});

test("classifyUpstreamFailure reports non-JSON token failures the way the panel expects", () => {
  const result = classifyUpstreamFailure("<html>999998</html>", null);
  assert.equal(result.code, "UPSTREAM_NON_JSON");
  // useUsageDashboard matches /99999[89]/ against `raw` for this branch.
  assert.match(result.raw, /99999[89]/);
});

test("不向浏览器回传非 JSON 原始报文", () => {
  const result = classifyUpstreamFailure("x".repeat(500), null);
  assert.equal(result.code, "UPSTREAM_NON_JSON");
  assert.equal(result.raw, "");
});

test("HTML 中不相关的数字不会触发账号删除", () => {
  assert.equal(classifyUpstreamFailure("request-id=1999998123", null).raw, "");
  assert.equal(classifyUpstreamFailure("<html>999997</html>", null).code, "BLACKLIST");
});

test("字段不匹配不能伪装成成功的空套餐", () => {
  assert.equal(normalizeOcs({ code: "0000", unexpected: [] }).ok, false);
  assert.equal(normalizeOcs({ resources: [] }).ok, true);
});

test("号码必须脱敏，布尔值不能成为签约速率", () => {
  const data = normalizeBasicData({ mobile: "13800000000", rate_mbps: true, signRate: "500" });
  assert.equal(data.mobile, "138****0000");
  assert.equal(data.rate_mbps, 500);
});

test("数字和布尔限速标记均能被识别", () => {
  for (const flag of [1, true, "1", "Y"]) {
    assert.equal(normalizeQci({ qci: 8, limitFlag: flag }).has_limit_service, true);
  }
  assert.equal(normalizeQci({ qci: 8, limitFlag: 0 }).has_limit_service, false);
});

test("classifyUpstreamFailure ignores failure codes appearing inside a healthy body", () => {
  assert.equal(classifyUpstreamFailure("", { code: "0000", total: "999998" }), null);
});

test("normalizeOcs passes resources through and finds a nested package name", () => {
  const result = normalizeOcs({
    result: { packageName: "5G 畅爽套餐" },
    resources: [{ details: [] }],
    unshared: "not-an-array",
  });

  assert.equal(result.code, "0000");
  assert.equal(result.packageName, "5G 畅爽套餐");
  assert.deepEqual(result.resources, [{ details: [] }]);
  assert.deepEqual(result.unshared, []);
});

test("余量明细只放行白名单字段，副卡号码与加密串不出网关", () => {
  const result = normalizeOcs(ocsResponse());

  assert.deepEqual(result.resources[0].details[0], {
    feePolicyId: "9000001",
    feePolicyName: "国内通用流量包",
    addupItemCode: "A0001",
    addUpItemName: "国内通用流量",
    elemType: "3",
    flowType: "1",
    resourceType: "1",
    realresourcetype: "1",
    typemark: "0",
    limited: "0",
    hide: false,
    total: "3072.00",
    use: "1024.00",
    remain: "2048.00",
    usedPercent: "33.33",
    endDate: "2026-12-31",
    endDate1: "2026-12-31 23:59:59",
    endXsbDate: "2026-12-31",
  });
  // 空串按“上游没给”处理，不占用返回体。
  assert.equal("flowType" in result.unshared[0].details[0], false);

  const serialized = JSON.stringify(result);
  for (const secret of [
    "viceCardlist", "userMobile", "userMobileKey", "usernumber", "viceCardflag",
    "currentLoginFlag", VICE_CARD_BLOB, "130****0000", "13000000000", "示例用户",
    "resourceSource", '"url"', "wTurl", "wangTurl", "example.test",
  ]) {
    assert.ok(!serialized.includes(secret), `${secret} 不应出现在返回给浏览器的结果里`);
  }
});

test("余量分组只放行白名单字段，共享与非共享两份清单一视同仁", () => {
  const result = normalizeOcs(ocsResponse());

  for (const group of [result.resources[0], result.unshared[0]]) {
    assert.deepEqual(Object.keys(group), ["type", "userResource", "remainResource", "details"]);
  }
  assert.deepEqual(
    { ...result.resources[0], details: result.resources[0].details.length },
    { type: "1", userResource: "1024.00", remainResource: "2048.00", details: 1 },
  );
  // 分组按下标对应流量/语音/短信：内容不可用时留空占位，不能整组消失。
  const emptied = normalizeOcs({ resources: [null, { details: [{ feePolicyId: "x" }] }] });
  assert.deepEqual(emptied.resources, [{ details: [] }, { details: [] }]);
});

test("余量白名单必须覆盖前端读取的全部字段", () => {
  const [detail] = normalizeOcs(ocsResponse()).resources[0].details;
  // src/domain/usage.js：detailKey / buildFlowCard / buildCardsFromOcs 逐个读这些字段。
  for (const field of [
    "feePolicyId", "feePolicyName", "addupItemCode", "endDate",
    "elemType", "flowType", "limited", "typemark", "total", "use", "remain",
  ]) {
    assert.ok(field in detail, `${field} 是页面要用的字段，不能被白名单挡掉`);
  }
  assert.equal(detail.hide, false);
});

test("余量数据对上游做条数与长度兜底", () => {
  const flood = normalizeOcs({
    resources: Array.from({ length: 30 }, () => ({
      details: Array.from({ length: 200 }, (_, index) => flowDetail({ feePolicyId: String(index) })),
    })),
  });
  assert.equal(flood.resources.length, 20);
  assert.equal(flood.resources[0].details.length, 100);

  const long = normalizeOcs({
    packageName: "套".repeat(200),
    resources: [{ details: [flowDetail({ feePolicyName: "名".repeat(200) })] }],
  });
  assert.equal(long.packageName.length, 60);
  assert.equal(long.resources[0].details[0].feePolicyName.length, 60);
});

test("既没有名称也没有数量的明细在网关就被丢掉", () => {
  const details = (entries) => normalizeOcs({ resources: [{ details: entries }] }).resources[0].details;

  assert.deepEqual(details([{ feePolicyId: "9000001", resourceSource: "1" }]), []);
  assert.deepEqual(details([{ total: "not-a-number" }]), []);
  assert.deepEqual(details([null, "detail", 7]), []);
  // 用量为 0 是事实，不是缺数据。
  assert.deepEqual(details([{ use: "0.00" }]), [{ use: "0.00" }]);
  assert.deepEqual(details([{ addUpItemName: "国内语音" }]), [{ addUpItemName: "国内语音" }]);
  // 嵌套结构一律不透传，只剩不足以成条的空对象时同样丢弃。
  assert.deepEqual(details([{ feePolicyName: { text: "对象" }, viceCardlist: [{ usernumber: "130****0000" }] }]), []);
  assert.deepEqual(normalizeOcs({ resources: [{ details: "not-an-array" }] }).resources, [{ details: [] }]);
});

test("normalizeBasicData maps a numeric signed rate", () => {
  const result = normalizeBasicData({ mobile: "138****0000", signRate: "500" });
  assert.equal(result.rate_mbps, 500);
  assert.equal(result.rate_is_lte, false);
  assert.equal(result.mobile, "138****0000");
});

test("读取真实 getbasicdata 的 rateResource，换算速率单位并脱敏号码", () => {
  for (const [rate, expected] of [["500Mbps", 500], ["2Gbps", 2000], ["512Kbps", 0.512], ["300", 300]]) {
    const result = normalizeBasicData({ code: "0000", rateResource: { rate, mobile: "13800000000" } });
    assert.equal(result.rate_mbps, expected);
    assert.equal(result.mobile, "138****0000");
  }
  assert.equal(normalizeBasicData({ rateResource: { rate: "LTE" } }).rate_is_lte, true);
  assert.equal(normalizeBasicData({ rateResource: { rate: "5G" } }).rate_mbps, 0);
});

test("号码只以 1xx****xxxx 出网关，其它形态一律留空", () => {
  assert.equal(normalizeBasicData({ desmobile: "13000000000", signRate: "500" }).mobile, "130****0000");
  assert.equal(normalizeBasicData({ mobile: "130****0000" }).mobile, "130****0000");
  for (const mobile of [VICE_CARD_BLOB, "示例用户", "0755-10010", "1300000000", "130****00001"]) {
    assert.equal(normalizeBasicData({ mobile, signRate: "500" }).mobile, "", mobile);
  }
  // 号码不可用不影响速率，速率也不可用时才当作没取到基础信息。
  assert.equal(normalizeBasicData({ mobile: VICE_CARD_BLOB, signRate: "500" }).code, "0000");
  assert.equal(normalizeBasicData({ mobile: VICE_CARD_BLOB }).code, "");
});

test("normalizeBasicData falls back to the LTE badge when no numeric rate exists", () => {
  assert.equal(normalizeBasicData({ rateName: "LTE 4G" }).rate_is_lte, true);
  assert.equal(normalizeBasicData({}).rate_is_lte, false);
  assert.equal(normalizeBasicData({}).code, "");
});

test("normalizeQci reports QCI, limit status and max rate", () => {
  const result = normalizeQci({ qci: "8", limitFlag: "1", maxNetSpeed: "300" });
  assert.equal(result.code, "0000");
  assert.equal(result.qci_num, 8);
  assert.equal(result.qci_inferred, undefined);
  assert.equal(result.has_limit_service, true);
  assert.equal(result.max_net_mbps, 300);
});

test("网关只转述事实：VIP/VVIP 与 5G-A 提速业务不在后端推断出 QCI 数字", () => {
  const ordered = (names) => ({ code: "0000", data: { serviceinfo: names.map((servicename) => ({ servicename })) } });
  const vip = normalizeQci(ordered(["5G网络服务质量VIP"]));
  assert.equal(vip.qci_num, undefined);
  assert.deepEqual(vip.network_quality_services, ["VIP"]);
  const vvip = normalizeQci(ordered(["5G 网络服务质量（VVIP）", "5G网络服务质量VIP"]));
  assert.equal(vvip.qci_num, undefined);
  assert.deepEqual(vvip.network_quality_services, ["VIP", "VVIP"]);
  assert.equal(normalizeQci(ordered(["5G上网服务（下行峰值2Gbps）", "VVIP网络服务包0元"])).qci_num, undefined);
  assert.equal(normalizeQci({ ...ordered(["5G网络服务质量VIP"]), qci: 7 }).qci_num, 7);
  const speedPackage = {
    ...ordered(["5G网络服务质量VIP", "5G-A升级包（下行2000Mbps，上行200Mbps）"]),
    rate_mbps: 2000, uplink_mbps: 200,
  };
  assert.equal(normalizeQci(speedPackage).qci_num, undefined);
  assert.equal(normalizeQci({ ...speedPackage, qci_num: 8, qci_inferred: true }).qci_num, undefined);
});

test("servicestate 是数字串：只有 \"1\" 算在用，其余状态码一律不生效", () => {
  const vip = { servicename: "5G网络服务质量VIP", serviceid: "50867" };
  const active = normalizeQci(orderedResponse([{ ...vip, servicestate: "1" }]));
  assert.deepEqual(active.network_quality_services, ["VIP"]);
  assert.equal(active.services.length, 1);

  for (const servicestate of ["0", "2", "9", "10"]) {
    const result = normalizeQci(orderedResponse([{ ...vip, servicestate }]));
    assert.deepEqual(result.network_quality_services, [], `servicestate=${servicestate} 不该算在用`);
    assert.deepEqual(result.services, [], `servicestate=${servicestate} 不该出现在业务清单里`);
  }
});

test("退订的限速业务不再算在用", () => {
  const limit = { servicename: "限速服务", serviceid: "50027" };
  assert.equal(normalizeQci(orderedResponse([{ ...limit, servicestate: "1" }])).has_limit_service, true);
  assert.equal(normalizeQci(orderedResponse([{ ...limit, servicestate: "0" }])).has_limit_service, false);
});

test("兜底分支：上游若给中文状态文案，仍按文案剔除；没给状态则不擅自剔除", () => {
  const vip = { servicename: "5G网络服务质量VIP", serviceid: "50867" };
  for (const servicestate of ["已退订", "已失效", "未生效", "停用"]) {
    assert.deepEqual(normalizeQci(orderedResponse([{ ...vip, servicestate }])).network_quality_services, []);
  }
  assert.deepEqual(normalizeQci(orderedResponse([{ ...vip, servicestate: "生效中" }])).network_quality_services, ["VIP"]);
  assert.deepEqual(normalizeQci({ data: { serviceinfo: [vip] } }).network_quality_services, ["VIP"]);
});

test("has_service_list 区分“业务清单为空”与“没有业务清单”", () => {
  assert.equal(normalizeQci({ data: { serviceinfo: [] } }).has_service_list, true);
  assert.equal(normalizeQci({ qci: 8 }).has_service_list, false);
  assert.equal(normalizeQci({ limitFlag: "1" }).has_service_list, false);
  assert.equal(normalizeQci({ data: { serviceinfo: [{ servicename: "5G网络服务质量VIP" }] } }).has_service_list, true);
});

test("限速服务独立于 QCI 识别，未知业务不生成默认 QCI", () => {
  const result = normalizeQci({ data: { serviceinfo: [{ serviceid: "50027", servicename: "限速服务" }] } });
  assert.equal(result.has_limit_service, true);
  assert.equal(result.qci_num, undefined);
  assert.equal(normalizeQci({ data: { serviceinfo: [] } }).qci_num, undefined);
});

test("normalizeQci withholds code 0000 when QCI is unknown", () => {
  assert.deepEqual(normalizeQci({}), { ok: true, code: "" });
});

test("业务清单只放行白名单字段，身份信息不出网关", () => {
  const parsed = orderedResponse([{ servicename: "语音主服务", serviceid: "50000" }]);
  parsed.data.usernumber = "13800000000";
  parsed.data.username = "示例用户";

  const result = normalizeQci(parsed);
  assert.deepEqual(Object.keys(result.services[0]), ["id", "name", "since"]);
  assert.deepEqual(result.services[0], { id: "50000", name: "语音主服务", since: "2023-03-01" });
  const serialized = JSON.stringify(result);
  for (const secret of ["13800000000", "示例用户", "示例套餐", "示例叠加包", "10000001", "20000002", "productmode"]) {
    assert.ok(!serialized.includes(secret), `${secret} 不应出现在返回给浏览器的结果里`);
  }
});

test("业务清单对上游数据做长度与格式兜底", () => {
  const flood = normalizeQci(orderedResponse(
    Array.from({ length: 300 }, (_, index) => ({ servicename: `业务${index}`, serviceid: String(50000 + index) })),
  ));
  assert.equal(flood.services.length, 100);

  const [service] = normalizeQci(orderedResponse([{
    servicename: "名".repeat(200),
    serviceid: "50000; DROP",
    completedateFmt: "",
    completedate: "20240115",
  }])).services;
  assert.equal(service.name.length, 60);
  assert.equal(service.id, "");
  assert.equal(service.since, "2024-01-15");

  const [undated] = normalizeQci(orderedResponse([{
    servicename: "无日期业务", completedateFmt: "", completedate: "",
  }])).services;
  assert.equal(undated.since, "");
  assert.deepEqual(normalizeQci(orderedResponse([{ servicename: "", serviceid: "" }])).services, []);
  // 上游没给清单时数组仍然存在，浏览器靠 has_service_list 区分“空清单”与“没清单”。
  assert.deepEqual(normalizeQci({ qci: 8 }).services, []);
  assert.equal(normalizeQci({ qci: 8 }).has_service_list, false);
});

test("业务名里的速率只取下行，且不影响 QCI", () => {
  for (const [name, expected] of [
    ["5G-A上网服务(下行峰值2Gbps上行峰值200Mbps）", 2000],
    ["5G-A上网服务（下行峰值2Gbps上行峰值200Mbps)", 2000],
    ["5G上网服务(下行峰值500Mbps)", 500],
    ["5G上网服务（下行峰值1Gbps）", 1000],
    ["上行峰值200Mbps下行峰值2Gbps", 2000],
    ["提速包（上行200Mbps）", 0],
    ["5G上网服务", 0],
    ["4G+产品服务", 0],
    ["5G/4G/3G流量提醒", 0],
    ["VoLTE", 0],
    ["5G服务（SA）", 0],
  ]) {
    assert.equal(parseDownlinkMbps(name), expected, name);
  }

  const result = normalizeQci(orderedResponse([
    { servicename: "5G-A上网服务(下行峰值2Gbps上行峰值200Mbps）", serviceid: "11006078" },
    { servicename: "5G上网服务(下行峰值500Mbps)", serviceid: "53546" },
    { servicename: "语音主服务", serviceid: "50000" },
  ]));
  assert.deepEqual(result.services.map((service) => service.downlink_mbps), [2000, 500, undefined]);
  // 速率只是业务名里的事实，网关不拿它推 QCI。
  assert.equal(result.qci_num, undefined);
  assert.deepEqual(result.network_quality_services, []);
});
