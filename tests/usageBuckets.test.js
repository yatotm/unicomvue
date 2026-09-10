import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUsageModel,
  CARRY_OVER_LABEL,
  ordinalMark,
  resolveExpiry,
} from "../src/utils/usageBuckets.js";
import { niceScale } from "../src/utils/chartScale.js";
import { splitResourceName } from "../src/utils/usageNames.js";
import { CASES, RICH, SPARSE } from "./fixtures/usage.js";

const NOW = new Date("2026-09-10T18:37:14");

function model(payload) {
  return buildUsageModel(payload, NOW);
}

function ocs(details, extra = {}) {
  return {
    code: "0000",
    resources: [{ details }, { details: [] }, { details: [] }],
    unshared: [null, null, null],
    ...extra,
  };
}

function flow(feePolicyId, feePolicyName, total, remain, use, endDate, extra = {}) {
  return {
    feePolicyId,
    feePolicyName,
    elemType: "3",
    limited: "0",
    flowType: "1",
    total: String(total),
    remain: String(remain),
    use: String(use),
    endDate,
    ...extra,
  };
}

// —— 名称拆分 ——

test("资源名拆成主名与 chip，纯额度的括号补上「总量」前缀", () => {
  assert.deepEqual(splitResourceName("结转套内国内流量(30.00G)(上月结转限本月使用)"), {
    name: "结转套内国内流量",
    chips: ["总量 30.00G", "上月结转限本月使用"],
    sizeChip: "30.00G",
    raw: "结转套内国内流量(30.00G)(上月结转限本月使用)",
  });
});

test("没有括号的名字原样保留，不产生空 chip", () => {
  const split = splitResourceName("省内闲时流量");
  assert.equal(split.name, "省内闲时流量");
  assert.deepEqual(split.chips, []);
  assert.equal(split.sizeChip, "");
});

test("全角括号与整名都在括号里的两种畸形输入都不会把名字清空", () => {
  assert.deepEqual(splitResourceName("套内国内流量（25.00G）").chips, ["总量 25.00G"]);
  assert.equal(splitResourceName("（专属流量）").name, "（专属流量）");
  assert.deepEqual(splitResourceName(null), { name: "", chips: [], raw: "" });
});

// —— 到期时间与「本月底作废」推断 ——

test("「上月结转限本月使用」推断出本月底作废，并且明确标为推断", () => {
  const expiry = resolveExpiry(
    { feePolicyName: "结转套内国内流量(30.00G)(上月结转限本月使用)", endDate: "长期有效" },
    NOW,
  );

  assert.equal(expiry.kind, "carry-over");
  assert.equal(expiry.label, CARRY_OVER_LABEL);
  assert.match(expiry.label, /（推断）$/, "推断出来的结论必须自己承认是推断");
  assert.equal(expiry.inferred, true);
  assert.equal(expiry.date, "2026-09-30");
  assert.match(expiry.hint, /上月结转限本月使用/);
});

test("运营商换了措辞就不再声称本月底作废，退回接口给的到期时间", () => {
  const expiry = resolveExpiry(
    { feePolicyName: "结转套内国内流量(30.00G)(上月余量结转)", endDate: "长期有效" },
    NOW,
  );

  assert.equal(expiry.kind, "forever");
  assert.equal(expiry.inferred, false);
  assert.doesNotMatch(expiry.label, /推断|作废/);
});

test("三种日期写法都归一到 YYYY-MM-DD，本月内到期与远期分属不同色阶", () => {
  for (const raw of ["2027年02月28日", "2027-02-28", "20270228", "2027/2/28 00:00:00"]) {
    const expiry = resolveExpiry({ feePolicyName: "流量", endDate: raw }, NOW);
    assert.equal(expiry.date, "2027-02-28", raw);
    assert.equal(expiry.label, "2027-02-28 到期");
    assert.equal(expiry.tier, 2);
  }
  assert.equal(resolveExpiry({ feePolicyName: "流量", endDate: "2026-09-30" }, NOW).tier, 1);
});

test("拿不到到期时间时既不说长期有效也不说快到期，落到「到期时间未知」", () => {
  for (const raw of ["", undefined, "—", "未知"]) {
    const expiry = resolveExpiry({ feePolicyName: "流量", endDate: raw }, NOW);
    assert.equal(expiry.kind, "unknown");
    assert.equal(expiry.label, "到期时间未知");
    assert.equal(expiry.tier, 4);
  }
});

test("到期未知的一组不给填充色，只画描边，免得占上有序色阶的一档", () => {
  const lanes = model(CASES["no-expiry"]).flow.groups;
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].expiry.kind, "unknown");
  const remainSegments = lanes[0].segments.filter((segment) => segment.tone === "remain");
  assert.ok(remainSegments.length > 0);
  assert.ok(remainSegments.every((segment) => segment.outlined && !segment.fill));
  assert.ok(lanes[0].segments.filter((segment) => segment.tone === "used").every((segment) => segment.fill === "bg-spent"));
});

// —— 分组、排序、刻度 ——

test("到期近的分组排在前面：结转 → 有到期日 → 长期有效", () => {
  const lanes = model(SPARSE.ocs).flow.groups;
  assert.deepEqual(lanes.map((lane) => lane.expiry.label), [
    CARRY_OVER_LABEL,
    "2027-02-28 到期",
    "长期有效 · 不会到期",
  ]);
  assert.deepEqual(lanes.map((lane) => lane.segments[0].fill), [
    "bg-expiry-1",
    "bg-expiry-2",
    "bg-expiry-3",
  ]);
});

test("按到期分组把重名问题结构性消掉：三个不同名的包落进三条，两个长期有效的合成一条", () => {
  const { flow: section } = model(SPARSE.ocs);
  assert.deepEqual(section.groups.map((lane) => lane.count), [1, 1, 2]);
  assert.deepEqual(section.groups.map((lane) => Math.round(lane.total)), [30720, 25600, 61440]);
});

test("所有条共用一把从 0 开始的绝对刻度，上界落在整数刻度上", () => {
  const { flow: section } = model(SPARSE.ocs);
  assert.equal(section.scaleMax, 61440, "60GB = 最大一条的额度");
  assert.deepEqual(section.axis.map((tick) => tick.text), ["0", "15", "30", "45", "60 GB"]);
  assert.deepEqual(section.axis.map((tick) => tick.ratio), [0, 0.25, 0.5, 0.75, 1]);
});

test("刻度间隔只取人读得出的尾数", () => {
  assert.deepEqual(niceScale(60, 4).ticks, [0, 15, 30, 45, 60]);
  assert.deepEqual(niceScale(1000, 2).ticks, [0, 500, 1000]);
  assert.deepEqual(niceScale(0, 4), { max: 0, step: 0, intervals: 4, ticks: [] });
  assert.equal(niceScale(37, 4).max, 40);
});

test("条长是绝对额度：同一把刻度下 25GB 的条正好是 60GB 条的 5/12", () => {
  const [, dated, forever] = model(SPARSE.ocs).flow.groups;
  assert.equal(Number(dated.segments[0].size.toFixed(2)), 41.67);
  assert.equal(forever.segments.reduce((sum, segment) => sum + segment.size, 0), 100);
});

// —— 同名条目的身份 ——

test("身份是（名称, 总量, 到期），不是数组下标", () => {
  const first = model(SPARSE.ocs).voice.entries;
  const shuffled = {
    ...SPARSE.ocs,
    resources: SPARSE.ocs.resources.map((block, index) => (
      index === 1 ? { ...block, details: [...block.details].reverse() } : block
    )),
  };
  const second = model(shuffled).voice.entries;

  assert.deepEqual(
    first.map((entry) => entry.key).sort(),
    second.map((entry) => entry.key).sort(),
    "顺序变了，身份不能跟着变",
  );
  assert.equal(new Set(first.map((entry) => entry.key)).size, 3);
});

test("名称、总量、到期全撞车时才退回下标，且编号仍然稳定", () => {
  const entries = model(CASES.duplicates).flow.entries;
  assert.equal(new Set(entries.map((entry) => entry.key)).size, 3);
  assert.deepEqual(entries.map((entry) => entry.ordinal), ["①", "②", "③"]);
  assert.match(entries[1].key, /#1$/, "只有这一步才允许用到下标");
  assert.doesNotMatch(entries[0].key, /#/);
});

test("全组同名时卡片上必须写明编号规则", () => {
  assert.equal(
    model(SPARSE.ocs).voice.note,
    "运营商返回 3 条同名「语音」，按返回顺序编号 ①②③",
  );
  assert.equal(model(SPARSE.ocs).flow.note, "", "名字本来就不同就不必解释编号");
});

test("超过 20 条时编号退回可读的数字形式，不会变成空白", () => {
  assert.equal(ordinalMark(0), "①");
  assert.equal(ordinalMark(19), "⑳");
  assert.equal(ordinalMark(20), "(21)");
  assert.equal(model(CASES["buckets-20"]).flow.entries.at(-1).ordinal, "⑳");
});

// —— 一份套餐派生出的多块资源 ——
// feePolicyId 认的是资费政策，套内额度 / 上月结转额度 / 附赠包共用同一个；
// 资源块自己的名字在 addUpItemName，feePolicyName 给的是整份套餐的名字。

function derived(addUpItemName, total, remain, use, endDate = "长期有效") {
  return {
    feePolicyId: "60000001",
    feePolicyName: "5G示例融合套餐-129元/月",
    addUpItemName,
    elemType: "3",
    limited: "0",
    flowType: "1",
    total: String(total),
    remain: String(remain),
    use: String(use),
    endDate,
  };
}

const DERIVED = [
  derived("套内国内流量(30.00G)", 30720, 30720, 0),
  derived("结转套内国内流量(30.00G)(上月结转限本月使用)", 30720, 22131.61, 8588.39),
  derived("套餐内流量(30.00G)", 30720, 30720, 0),
];

test("共用一个 feePolicyId 的三块资源都进得了条形图，结转的那块单独成组", () => {
  const { flow: section } = model(ocs(DERIVED));
  assert.equal(section.entries.length, 3);
  assert.equal(section.total, 92160);

  const carryOver = section.groups.find((lane) => lane.expiry.label === CARRY_OVER_LABEL);
  assert.equal(carryOver.count, 1);
  assert.equal(Math.round(carryOver.used), 8588);
});

test("条目名取 addUpItemName，不是整份套餐的资费政策名", () => {
  const [inPlan, carried] = model(ocs(DERIVED)).flow.entries;
  assert.equal(inPlan.name, "套内国内流量");
  assert.deepEqual(inPlan.chips, ["总量 30.00G"]);
  assert.equal(carried.expiry.label, CARRY_OVER_LABEL, "结转的标记在资源块自己的名字里");
});

test("行身份不会把共用资费政策的三块资源重新并回一行", () => {
  const keys = model(ocs(DERIVED)).flow.entries.map((entry) => entry.key);
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys.every((key) => !key.includes("#")), "名字不同就不该退回下标");
});

test("同一块资源在 resources 与 unshared 各报一次，合计不能翻倍", () => {
  const { flow: section } = model(ocs(DERIVED, { unshared: [{ details: DERIVED }, null, null] }));
  assert.equal(section.entries.length, 3);
  assert.equal(section.total, 92160);
});

// —— 绝不假设 剩余 + 已用 = 总量 ——

test("对不上的数字被钳位，并且被明确标出来", () => {
  const { flow: section } = model(CASES.unreconciled);
  assert.equal(section.unreconciled.length, 2);

  const [overspent, overfull] = section.entries;
  assert.equal(overspent.barRemain + overspent.barUsed, overspent.total, "条不能画出刻度");
  assert.equal(overfull.barRemain, overfull.total, "剩余比总量还多时按总量封顶");
  assert.equal(overfull.remain, 25600, "钳的是条形，不是运营商报的数字");
  assert.ok(section.groups.every((lane) => lane.unreconciled.length === 1));
});

test("四舍五入级别的误差不算对不上", () => {
  const section = model(ocs([flow("a", "流量(30.00G)", 30720, 30719.5, 0.4, "长期有效")])).flow;
  assert.deepEqual(section.unreconciled, []);
});

test("缺少剩余字段时用总量减已用兜底，不报成数据错误", () => {
  const [entry] = model(ocs([flow("a", "流量(10.00G)", 10240, "", 2048, "长期有效")])).flow.entries;
  assert.equal(entry.remain, 8192);
  assert.equal(entry.reconciled, true);
});

// —— 不限量 ——

test("不限量的包没有分母：不进条形图、不进合计、不给占比", () => {
  const { flow: section } = model(CASES.unlimited);
  assert.equal(section.unlimited.length, 1);
  assert.equal(section.groups.length, 1, "只有有额度的包能进到期条");
  assert.equal(section.total, 20480, "合计只算有额度的部分");
  assert.equal(section.unlimited[0].remainPercent, null);
  assert.equal(section.unlimited[0].totalText, "不限量");
});

// —— 空态与缺失 ——

test("「运营商返回 0 条」与「压根没返回这个分组」是两回事", () => {
  const returnedNothing = model(SPARSE.ocs).sms;
  assert.equal(returnedNothing.present, true);
  assert.equal(returnedNothing.entries.length, 0);

  const missingBlock = model({ code: "0000", resources: [{ details: [] }], unshared: [] }).sms;
  assert.equal(missingBlock.present, false);
});

test("完全没有数据时模型不炸，只是每一组都空", () => {
  for (const payload of [null, undefined, {}, CASES["all-empty"], CASES["buckets-0"]]) {
    const built = model(payload);
    assert.equal(built.flow.entries.length, 0);
    assert.deepEqual(built.flow.groups, []);
    assert.equal(built.flow.remainPercent, null);
    assert.deepEqual(built.flow.axis, []);
  }
});

// —— 条数变化下的稳定性 ——

test("0 / 1 / 2 / 10 / 20 个流量包都能出条，标签放不下时自动退回可换行的清单", () => {
  const expected = { "buckets-0": 0, "buckets-1": 1, "buckets-2": 2, "buckets-10": 3, "buckets-20": 3 };
  for (const [name, lanes] of Object.entries(expected)) {
    const section = model(CASES[name]).flow;
    assert.equal(section.groups.length, lanes, name);
    for (const lane of section.groups) {
      assert.ok(lane.labels.length >= 1, `${name} 每条都要有文字说明，不能只有颜色`);
      if (lane.anchored) {
        const starts = lane.labels.map((label) => label.startPercent);
        assert.ok(
          starts.every((start, index) => index === 0 || start - starts[index - 1] >= 26),
          `${name} 贴条标签之间必须留得下字`,
        );
      }
    }
  }
});

test("每一段颜色都配一条印出来的数字，图表从不只靠颜色说话", () => {
  for (const payload of [SPARSE.ocs, RICH.ocs, ...Object.values(CASES)]) {
    for (const section of [model(payload).flow, model(payload).voice, model(payload).sms]) {
      for (const lane of section.groups) {
        assert.ok(lane.expiry.label, "每条都要有到期文案");
        assert.ok(lane.labels.length > 0, "每条都要有数值标签");
        assert.ok(lane.segments.every((segment) => segment.title), "每段都要有可读的 title");
      }
    }
  }
});

test("超长名字照样拆出 chip，主名不会被清空", () => {
  const entries = model(CASES["long-names"]).flow.entries;
  assert.ok(entries.every((entry) => entry.name.length > 0));
  assert.ok(entries[0].chips.includes("总量 50.00G"));
  assert.equal(entries[1].expiry.label, CARRY_OVER_LABEL);
});

test("富样本：七个计量包加一个不限量包，语音短信都有消耗", () => {
  const built = model(RICH.ocs);
  assert.equal(built.flow.metered.length, 7);
  assert.equal(built.flow.unlimited.length, 1);
  assert.ok(built.flow.groups.length >= 4);
  assert.equal(built.voice.entries.length, 2);
  assert.equal(built.sms.entries.length, 1);
});
