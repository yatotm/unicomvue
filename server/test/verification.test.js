import assert from "node:assert/strict";
import { test } from "node:test";
import { createOperatorVerification } from "../src/upstream/verification.js";

const CLIENT = { phone: "13800000000", deviceId: "device-one" };
const RESPONSE = { code: "ECS99998", type: "15", mobile: "opaque-carrier-context", url: "https://img.client.10010.com/loginRisk/index.html" };

test("保留联通原始校验类型，不能把人脸改成浏览器验证", () => {
  const guard = createOperatorVerification();
  const face = guard.challenge({ ...RESPONSE, type: "4" }, "send", CLIENT, {});
  assert.deepEqual(face, { type: "4", requiresApp: true, browserSupported: false });
  assert.equal(guard.challenge({ ...RESPONSE, code: "0000" }, "send", CLIENT, {}), null);
  const unsupported = guard.challenge({ ...RESPONSE, url: "https://untrusted.test" }, "send", CLIENT, {});
  assert.equal(unsupported.browserSupported, false);
  assert.equal(unsupported.context, undefined);
});

test("保留官方图形验证地址的路由参数，拒绝其他来源、页面和 URL 凭证", () => {
  const guard = createOperatorVerification();
  for (const suffix of ["#/?channel=h5Check", "?channel=smssms#/", ""]) {
    const response = { ...RESPONSE, code: "ECS99999", type: "10", url: RESPONSE.url + suffix };
    const challenge = guard.challenge(response, "password", CLIENT, {});
    assert.equal(challenge.browserSupported, true);
    assert.equal(challenge.url, response.url);
    assert.deepEqual(challenge.context, response);
  }
  for (const url of [
    "https://img.client.10010.com.evil.test/loginRisk/index.html",
    "https://img.client.10010.com/other.html",
    "http://img.client.10010.com/loginRisk/index.html",
    "https://user:pass@img.client.10010.com/loginRisk/index.html",
  ]) {
    assert.equal(guard.challenge({ ...RESPONSE, url }, "password", CLIENT, {}).browserSupported, false);
  }
});

test("验证会话绑定手机号、设备和操作，只能消费一次并复用原密文", () => {
  const guard = createOperatorVerification();
  const fields = { mobile: "original-ciphertext", version: "app-version" };
  const cookies = { session: "challenge-cookie" };
  const challenge = guard.challenge(RESPONSE, "send", CLIENT, { fields, cookies });
  assert.equal(challenge.context.type, RESPONSE.type);
  const resume = { ...CLIENT, operatorVerificationId: challenge.id, operatorResultToken: "official-proof" };
  for (const [action, client] of [
    ["login", resume], ["send", { ...resume, phone: "13900000000" }],
    ["send", { ...resume, deviceId: "another-device" }],
  ]) {
    assert.throws(() => guard.request(action, client, () => {}), /不匹配/);
  }
  const reused = guard.request("send", resume, () => { throw new Error("不能重新加密"); });
  assert.deepEqual(reused, { fields: { ...fields, resultToken: "official-proof" }, cookies });
  assert.throws(() => guard.request("send", resume, () => {}), /失效/);
});

test("验证会话过期和容量上限不会允许无凭证重试", () => {
  let currentTime = 0;
  const guard = createOperatorVerification({ now: () => currentTime, ttlMs: 1000, maxPending: 1 });
  const first = guard.challenge(RESPONSE, "login", CLIENT, {});
  assert.throws(() => guard.challenge(RESPONSE, "login", CLIENT, {}), /已满/);
  currentTime = 1001;
  assert.throws(() => guard.request("login", { ...CLIENT, operatorVerificationId: first.id, operatorResultToken: "old-proof" }, () => {}), /失效/);
  assert.ok(guard.challenge(RESPONSE, "login", CLIENT, {}).id);
  assert.throws(() => guard.request("send", { ...CLIENT, operatorResultToken: "invented-proof" }, () => {}), /不匹配/);
});
