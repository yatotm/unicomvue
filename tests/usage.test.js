import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCardsFromOcs,
  resolveQciLevel,
  resolveSignedRate,
  SIGNED_RATE_HINT,
} from "../src/domain/usage.js";

const withServiceList = (services) => ({
  code: "0000",
  network_quality_services: services,
  has_service_list: true,
});

test("buildCardsFromOcs converts, deduplicates, filters, and sorts OCS resources", () => {
  const unlimitedFlow = {
    feePolicyId: "unlimited",
    feePolicyName: "畅享无限流量",
    elemType: "3",
    limited: "1",
    flowType: "1",
    typemark: "0",
    use: "1024",
    total: "0",
    remain: "0",
  };
  const cards = buildCardsFromOcs({
    resources: [
      {
        details: [
          unlimitedFlow,
          {
            feePolicyId: "limited",
            feePolicyName: "2GB 月包",
            elemType: "3",
            limited: "0",
            flowType: "1",
            use: "512",
            total: "2048",
            remain: "1536",
          },
          {
            feePolicyId: "hidden",
            elemType: "3",
            hide: true,
          },
          {
            feePolicyId: "not-flow",
            elemType: "2",
          },
        ],
      },
      {
        userResource: "30",
        remainResource: "70",
        details: [{ feePolicyId: "voice-detail" }],
      },
      {
        userResource: "2",
        remainResource: "8",
        details: [{ feePolicyId: "sms-detail" }],
      },
    ],
    unshared: [
      { details: [{ ...unlimitedFlow }] },
      null,
      null,
    ],
  });

  assert.deepEqual(cards.map((card) => card.kind), ["voice", "sms", "flow", "flow"]);
  assert.deepEqual(cards.map((card) => card.title), ["语音", "短信", "畅享无限流量", "2GB 月包"]);
  assert.equal(new Set(cards.map((card) => card.id)).size, 4, "每张卡片的 id 必须唯一");

  assert.deepEqual(cards[0], {
    id: "voice",
    kind: "voice",
    title: "语音",
    subtitle: "（已用）",
    mainValue: "30分钟",
    smallTotal: "总：100分钟",
    unlimited: false,
    percent: 30,
    canUseText: "剩：70分钟",
  });
  assert.equal(cards[1].mainValue, "2条");
  assert.equal(cards[1].percent, 20);

  const unlimitedCard = cards[2];
  assert.equal(unlimitedCard.title, "畅享无限流量");
  assert.equal(unlimitedCard.mainValue, "1.00GB");
  assert.equal(unlimitedCard.smallTotal, "总量：∞");
  assert.equal(unlimitedCard.percent, 100);
  assert.deepEqual(unlimitedCard.badges, [
    { key: "flow-type", text: "通用" },
    { key: "sharing", text: "共享" },
    { key: "limit", text: "无限量" },
  ]);

  const limitedCard = cards[3];
  assert.equal(limitedCard.mainValue, "512.00MB");
  assert.equal(limitedCard.smallTotal, "总：2.00GB");
  assert.equal(limitedCard.canUseText, "剩：1.50GB");
  assert.equal(limitedCard.percent, 25);
  assert.deepEqual(limitedCard.badges, [
    { key: "flow-type", text: "通用" },
    { key: "limit", text: "有上限" },
  ]);
});

test("buildCardsFromOcs returns no cards for missing resources", () => {
  assert.deepEqual(buildCardsFromOcs(null), []);
  assert.deepEqual(buildCardsFromOcs({ resources: "invalid" }), []);
});

// —— 资源块的身份 ——
// 一份套餐会派生出好几块资源，它们共用同一个 feePolicyId（资费政策编号）：套内额度、
// 上月结转的额度、附赠包。资源块自己的名字在 addUpItemName，feePolicyName 是整份套餐的名字。
// 只按 feePolicyId 去重会把第一块之后的全部丢掉，结转的额度就是这么从页面上消失的。

const PLAN_NAME = "5G示例融合套餐-129元/月";

function derived(addUpItemName, total, remain, use, extra = {}) {
  return {
    feePolicyId: "60000001",
    feePolicyName: PLAN_NAME,
    addUpItemName,
    elemType: "3",
    limited: "0",
    flowType: "1",
    total: String(total),
    remain: String(remain),
    use: String(use),
    endDate: "长期有效",
    ...extra,
  };
}

const IN_PLAN = derived("套内国内流量(30.00G)", 30720, 30720, 0);
const CARRIED_OVER = derived("结转套内国内流量(30.00G)(上月结转限本月使用)", 30720, 22131.61, 8588.39);
const BUNDLED = derived("套餐内流量(30.00G)", 30720, 30720, 0);

function flowCards(details, unsharedDetails) {
  return buildCardsFromOcs({
    resources: [{ details }, null, null],
    unshared: [unsharedDetails ? { details: unsharedDetails } : null, null, null],
  }).filter((card) => card.kind === "flow");
}

function titlesOf(details, unsharedDetails) {
  return flowCards(details, unsharedDetails).map((card) => card.title).sort();
}

test("共用一个 feePolicyId 的几块资源各自成卡，上月结转的额度不再被吞掉", () => {
  assert.deepEqual(titlesOf([IN_PLAN, CARRIED_OVER, BUNDLED]), [
    "套内国内流量(30.00G)",
    "套餐内流量(30.00G)",
    "结转套内国内流量(30.00G)(上月结转限本月使用)",
  ].sort());
});

test("同一块资源在 resources 与 unshared 各报一次时仍然只出一张卡", () => {
  assert.equal(flowCards([IN_PLAN, CARRIED_OVER], [IN_PLAN, CARRIED_OVER]).length, 2);
  assert.equal(flowCards([], [CARRIED_OVER]).length, 1, "只在 unshared 里的资源也要出卡");
});

test("每个字段都相同的两条才是真重复，合并成一条", () => {
  assert.equal(flowCards([IN_PLAN, { ...IN_PLAN }]).length, 1);
});

test("只差额度、只差到期时间、只差名称的两块资源都各自保留", () => {
  assert.equal(flowCards([IN_PLAN, { ...IN_PLAN, total: "20480" }]).length, 2, "额度");
  assert.equal(flowCards([IN_PLAN, { ...IN_PLAN, endDate: "2027年02月28日" }]).length, 2, "到期");
  assert.equal(flowCards([IN_PLAN, { ...IN_PLAN, addUpItemName: "定向视频流量(30.00G)" }]).length, 2, "名称");
  assert.equal(flowCards([IN_PLAN, { ...IN_PLAN, flowType: "2" }]).length, 2, "流量类型");
  assert.equal(flowCards([IN_PLAN, { ...IN_PLAN, addupItemCode: "A0002" }]).length, 2, "计费单元");
});

test("上游没给 feePolicyId 时靠资源块自己的字段认身份", () => {
  const anonymous = { ...IN_PLAN, feePolicyId: undefined };
  assert.equal(flowCards([anonymous, { ...anonymous }]).length, 1, "字段全一样就是同一块");
  assert.equal(flowCards([anonymous, { ...anonymous, addUpItemName: "结转流量(10.00G)" }]).length, 2);
  assert.equal(flowCards([anonymous, IN_PLAN]).length, 2, "有编号和没编号不是同一块");
});

test("缺字段与空串都算「没给」，不会让两块不同的资源撞成一块", () => {
  const missing = { ...IN_PLAN, addupItemCode: undefined, endDate: undefined };
  const blank = { ...IN_PLAN, addupItemCode: "", endDate: "  " };
  assert.equal(flowCards([missing, blank]).length, 1);
  assert.equal(flowCards([missing, { ...missing, addupItemCode: "A0002" }]).length, 2);
});

test("卡片名取资源块自己的名字，上游只给资费政策名时才退回它", () => {
  assert.equal(flowCards([IN_PLAN])[0].title, "套内国内流量(30.00G)");
  assert.equal(flowCards([{ ...IN_PLAN, addUpItemName: undefined }])[0].title, PLAN_NAME);
  assert.equal(flowCards([{ ...IN_PLAN, addUpItemName: "", feePolicyName: "" }])[0].title, "通用流量");
});

test("生效的网络质量业务决定 QCI：VVIP=6、VIP=8、都没订=9", () => {
  assert.equal(resolveQciLevel(withServiceList(["VVIP"])), "6（推断）");
  assert.equal(resolveQciLevel(withServiceList(["VIP"])), "8（推断）");
  assert.equal(resolveQciLevel(withServiceList([])), "9（推断）");
});

test("VVIP 优先于 VIP", () => {
  assert.equal(resolveQciLevel(withServiceList(["VIP", "VVIP"])), "6（推断）");
});

test("接口明确返回的 QCI 优先于推断，并标记为上游数据", () => {
  const data = { ...withServiceList(["VIP"]), qci_num: 7 };
  assert.equal(resolveQciLevel(data), "7");
  assert.equal(resolveQciLevel({ code: "0000", qci: 5 }), "5");
});

test("上游自称推断的数字不算明确 QCI，仍按业务清单推断", () => {
  const data = { ...withServiceList(["VIP"]), qci_num: 6, qci_inferred: true };
  assert.equal(resolveQciLevel(data), "8（推断）");
});

test("已退订的 VIP 不产生 QCI 8，只落到默认承载 9", () => {
  // 网关已过滤失效业务，网络质量业务清单因此为空。
  assert.equal(resolveQciLevel(withServiceList([])), "9（推断）");
});

test("没有业务清单时不推断 QCI，显示未确认", () => {
  assert.equal(resolveQciLevel({ code: "0000", has_limit_service: true }), "未确认");
  assert.equal(resolveQciLevel({ code: "0000", has_service_list: false, network_quality_services: [] }), "未确认");
  assert.equal(resolveQciLevel(null), "未确认");
});

test("速率不影响 QCI：2Gbps 提速包配 VIP 仍是 8", () => {
  const speedUpgrade = { ...withServiceList(["VIP"]), max_net_mbps: 2000, rate_mbps: 2000 };
  assert.equal(resolveQciLevel(speedUpgrade), "8（推断）");
  assert.equal(resolveQciLevel({ ...withServiceList([]), max_net_mbps: 2000 }), "9（推断）");
  assert.equal(resolveQciLevel({ code: "0000", max_net_mbps: 2000 }), "未确认");
});

// 网关下发的业务清单形状：只有 id / name / since，速率业务另带 downlink_mbps。
const FAST_SERVICE = {
  id: "11006078",
  name: "5G-A上网服务(下行峰值2Gbps上行峰值200Mbps）",
  since: "2024-01-15",
  downlink_mbps: 2000,
};
const VOICE_SERVICE = { id: "50000", name: "语音主服务", since: "2020-05-06" };

test("签约速率展示所有来源中的最高值", () => {
  const rate = resolveSignedRate(
    { code: "0000", rate_mbps: 500 },
    { code: "0000", max_net_mbps: 300, services: [FAST_SERVICE, VOICE_SERVICE] },
  );

  assert.equal(rate.text, "2000Mbps");
  assert.match(rate.title, /5G-A上网服务\(下行峰值2Gbps上行峰值200Mbps）\s2000Mbps/);
  assert.match(rate.title, /套餐签约 500Mbps/);
  assert.match(rate.title, /接口最高速率 300Mbps/);
  // 没有可解析速率的业务不是速率来源。
  assert.ok(!rate.title.includes("语音主服务"));
});

test("单一来源与缺失来源时的签约速率", () => {
  assert.equal(resolveSignedRate({ code: "0000", rate_mbps: 500 }, null).text, "500Mbps");
  assert.equal(resolveSignedRate(null, { code: "0000", services: [FAST_SERVICE] }).text, "2000Mbps");
  assert.equal(resolveSignedRate({ code: "0000", rate_is_lte: true }, null).text, "LTE");
  // LTE 基础信息配上接口给出的上限，仍然显示数字。
  assert.equal(resolveSignedRate({ rate_is_lte: true }, { max_net_mbps: 2000 }).text, "2000Mbps");
  assert.deepEqual(resolveSignedRate(null, null), { text: "—", title: SIGNED_RATE_HINT });
  assert.equal(resolveSignedRate({ rate_mbps: 0 }, { max_net_mbps: -1, services: "invalid" }).text, "—");
});

test("业务名里的速率不参与 QCI 推断", () => {
  assert.equal(resolveQciLevel({ ...withServiceList([]), services: [FAST_SERVICE] }), "9（推断）");
  assert.equal(resolveQciLevel({ ...withServiceList(["VIP"]), services: [FAST_SERVICE] }), "8（推断）");
});

test("超出范围的 QCI 数字不被采信", () => {
  assert.equal(resolveQciLevel({ code: "0000", qci_num: 0 }), "未确认");
  assert.equal(resolveQciLevel({ code: "0000", qci_num: 256 }), "未确认");
  assert.equal(resolveQciLevel({ ...withServiceList(["VVIP"]), qci_num: "abc" }), "6（推断）");
});
