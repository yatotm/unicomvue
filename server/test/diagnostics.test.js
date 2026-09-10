import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeUpstreamResponse } from "../src/upstream/diagnostics.js";

test("诊断日志只保留业务码与结构，不保留响应中的凭证和自由文本", () => {
  const json = {
    rsp_code: "1001", rsp_desc: "13800000000 654321 安全验证 secret-token-value",
    phone: "13800000000", ticket: "secret-ticket-value", token: "secret-token-value",
    data: { items: [{ account: "private-name", password: "654321" }] },
  };
  const summary = summarizeUpstreamResponse({ status: 200, text: JSON.stringify(json), json });
  assert.equal(summary.upstreamCode, "1001");
  assert.equal(summary.captchaMentioned, true);
  assert.deepEqual(summary.responseShape.data.items, { type: "array", count: 1 });
  const serialized = JSON.stringify(summary);
  for (const secret of ["13800000000", "654321", "secret-token-value", "secret-ticket-value", "private-name"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("非 JSON 报文和异常 code 字段不会被复制到日志", () => {
  assert.equal(summarizeUpstreamResponse({ status: 200, text: "999999", json: null }).upstreamCode, "999999");
  const html = "<html>private-token-and-phone-13800000000</html>";
  const summary = summarizeUpstreamResponse({ status: 200, text: html, json: null });
  assert.equal(summary.upstreamCode, null);
  assert.equal(summary.responseShape, "non-json");
  assert.equal(summarizeUpstreamResponse({ status: 200, json: { code: "private-token" } }).upstreamCode, null);
});

test("识别已确认的六位密码错误码，不将任意方括号内数字写入日志", () => {
  const summary = summarizeUpstreamResponse({ status: 200, json: { code: "4", dsc: "请输入6位数字密码[7237]" } });
  assert.equal(summary.reportedCode, "7237");
  assert.equal(summarizeUpstreamResponse({ status: 200, json: { code: "4", dsc: "验证码[654321]错误" } }).reportedCode, null);
});

test("保留强验证业务码和入口结构，去除 URL 里的手机号和验证令牌", () => {
  const json = {
    code: "ECS99999", dsc: "当前账号登录需要密码校验[ECS1502]", type: "2",
    url: "https://loginxhm.10010.com/verify/13800000000?mobile=13800000000&resultToken=private-token&code=654321",
  };
  const summary = summarizeUpstreamResponse({ status: 200, text: JSON.stringify(json), json });
  assert.equal(summary.upstreamCode, "ECS99999");
  assert.equal(summary.reportedCode, "ECS1502");
  assert.equal(summary.passwordVerification, true);
  assert.equal(summary.verificationType, "2");
  assert.deepEqual(summary.verificationLocation, {
    origin: "https://loginxhm.10010.com", path: "/verify/[已隐藏]", parameterNames: ["mobile", "resultToken", "code"],
  });
  for (const secret of ["13800000000", "private-token", "654321"]) {
    assert.equal(JSON.stringify(summary).includes(secret), false);
  }
});
