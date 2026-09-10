import assert from "node:assert/strict";
import { test } from "node:test";
import { groupServices } from "../src/domain/services.js";

const service = (id, name, since = "2023-03-01") => ({ id, name, since });

function titles(groups) {
  return groups.map((group) => group.title);
}

function itemsOf(groups, title) {
  return groups.find((group) => group.title === title)?.items ?? [];
}

test("按 serviceid 归类，并保持固定的分组顺序", () => {
  const groups = groupServices([
    service("50003", "短信收发"),
    service("50004", "来电显示"),
    service("50000", "语音主服务"),
    service("53546", "5G上网服务(下行峰值500Mbps)"),
    service("50015", "国际漫游、港澳台漫游"),
    service("50202", "视频彩铃服务"),
  ]);

  assert.deepEqual(titles(groups), ["网络与速率", "语音", "短信", "通话功能", "增值与提醒", "国际与漫游"]);
  assert.deepEqual(itemsOf(groups, "语音").map((item) => item.name), ["语音主服务"]);
});

test("空分组不出现，条目按名称排序并带生效日期", () => {
  const groups = groupServices([
    service("50007", "呼叫保持", "2021-02-03"),
    service("50004", "来电显示", "2019-08-09"),
  ]);

  assert.deepEqual(titles(groups), ["通话功能"]);
  // 中文按拼音排序：呼(h) 在 来(l) 之前。
  assert.deepEqual(itemsOf(groups, "通话功能"), [
    { key: "50007:0", group: "call", name: "呼叫保持", since: "2021-02-03" },
    { key: "50004:1", group: "call", name: "来电显示", since: "2019-08-09" },
  ]);
});

test("认不出的编号按业务名关键词归类", () => {
  const groups = groupServices([
    service("99900001", "5G-A上网服务(下行峰值2Gbps上行峰值200Mbps）"),
    service("99900002", "国际长途、港澳台长途"),
    service("99900003", "漏话提醒基础版"),
  ]);

  assert.deepEqual(titles(groups), ["网络与速率", "增值与提醒", "国际与漫游"]);
});

test("既认不出编号也认不出名称的业务落到“其他业务”，不会被丢掉", () => {
  const groups = groupServices([
    service("50000", "语音主服务"),
    service("99999999", "某项未知业务"),
    { id: "", name: "", since: "" },
  ]);

  assert.deepEqual(titles(groups), ["语音", "其他业务"]);
  assert.deepEqual(itemsOf(groups, "其他业务").map((item) => item.name), ["某项未知业务", "未命名业务"]);
  assert.equal(itemsOf(groups, "其他业务")[1].since, "—");
});

test("缺名称的业务退回编号，缺日期的业务显示占位符", () => {
  const groups = groupServices([{ id: "50106", since: "" }]);
  assert.deepEqual(itemsOf(groups, "语音"), [
    { key: "50106:0", group: "voice", name: "业务 50106", since: "—" },
  ]);
});

test("没有业务或数据不是数组时返回空分组", () => {
  assert.deepEqual(groupServices([]), []);
  assert.deepEqual(groupServices(null), []);
  assert.deepEqual(groupServices("invalid"), []);
  assert.deepEqual(groupServices([null, "invalid"]), []);
});
