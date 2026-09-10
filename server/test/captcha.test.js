import assert from "node:assert/strict";
import { test } from "node:test";
import { createCaptchaGuard } from "../src/captcha.js";

const ENABLED = { enabled: true, appId: "a", appSecret: "s", ttlMs: 1_000 };
const CONTEXT = { phone: "13800000000", userIp: "127.0.0.1" };

function clock(start = 1_000) {
  const state = { value: start };
  return { now: () => state.value, advance: (ms) => { state.value += ms; } };
}

test("captcha is bypassed entirely when disabled", async () => {
  const guard = createCaptchaGuard({ ...ENABLED, enabled: false });
  assert.equal(guard.enabled, false);
  assert.equal(guard.consume(""), true);

  const result = await guard.validate({ ticket: "t", randstr: "r" });
  assert.equal(result.ok, false);
});

test("validate rejects missing credentials and missing tickets", async () => {
  const noSecret = createCaptchaGuard({ ...ENABLED, appSecret: "" });
  assert.match((await noSecret.validate({ ticket: "t", randstr: "r" })).message, /CAPTCHA_APP/);

  const guard = createCaptchaGuard(ENABLED, { verify: async () => ({ ok: true }) });
  assert.equal((await guard.validate({ ticket: "", randstr: "r" })).ok, false);
});

test("a verified ticket issues a single-use result token", async () => {
  const guard = createCaptchaGuard(ENABLED, { verify: async () => ({ ok: true }) });
  const { ok, resultToken } = await guard.validate({ ticket: "t", randstr: "r", ...CONTEXT });

  assert.equal(ok, true);
  assert.equal(guard.consume(resultToken, CONTEXT), true);
  assert.equal(guard.consume(resultToken, CONTEXT), false);
});

test("consume rejects unknown and expired result tokens", async () => {
  const time = clock();
  const guard = createCaptchaGuard(ENABLED, { now: time.now, verify: async () => ({ ok: true }) });
  const { resultToken } = await guard.validate({ ticket: "t", randstr: "r", ...CONTEXT });

  assert.equal(guard.consume("never-issued", CONTEXT), false);
  time.advance(1_001);
  assert.equal(guard.consume(resultToken, CONTEXT), false);
});

test("a rejected ticket surfaces the upstream reason", async () => {
  const guard = createCaptchaGuard(ENABLED, {
    verify: async () => ({ ok: false, message: "票据已过期" }),
  });
  assert.deepEqual(await guard.validate({ ticket: "t", randstr: "r", ...CONTEXT }), {
    ok: false,
    message: "票据已过期",
  });
});

test("验证结果不能换手机号或 IP 使用", async () => {
  const guard = createCaptchaGuard(ENABLED, { verify: async () => ({ ok: true }) });
  const { resultToken } = await guard.validate({ ticket: "t", randstr: "r", ...CONTEXT });
  assert.equal(guard.consume(resultToken, { ...CONTEXT, phone: "13900000000" }), false);
  assert.equal(guard.consume(resultToken, { ...CONTEXT, userIp: "127.0.0.2" }), false);
  assert.equal(guard.consume(resultToken, CONTEXT), true);
});

test("验证结果有容量上限，过期后可重新签发", async () => {
  const time = clock();
  const guard = createCaptchaGuard(ENABLED, { now: time.now, maxTokens: 1, verify: async () => ({ ok: true }) });
  const input = { ticket: "t", randstr: "r", ...CONTEXT };
  assert.equal((await guard.validate(input)).ok, true);
  assert.equal((await guard.validate(input)).ok, false);
  time.advance(1001);
  assert.equal((await guard.validate(input)).ok, true);
});

test("腾讯校验异常只返回可读错误，不泄漏请求 URL 中的密钥", async () => {
  const guard = createCaptchaGuard(ENABLED, {
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, "error");
      assert.ok(options.signal);
      throw new Error("request URL includes secret");
    },
  });
  const result = await guard.validate({ ticket: "t", randstr: "r", ...CONTEXT });
  assert.equal(result.ok, false);
  assert.match(result.message, /暂不可用/);
  assert.equal(result.message.includes("secret"), false);
});
