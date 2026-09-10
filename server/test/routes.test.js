import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { UpstreamError } from "../src/upstream/client.js";

const OK_UPSTREAM = {
  sendSmsCode: async () => ({ ok: true, message: "验证码已发送" }),
  smsLogin: async () => ({ ecsToken: "t".repeat(40), onlinToken: "o".repeat(30) }),
  queryOcs: async () => ({ ok: true, code: "0000", packageName: "套餐", resources: [], unshared: [] }),
  queryBasicData: async () => ({ ok: true, code: "0000", mobile: "138****0000" }),
  queryQci: async () => ({ ok: true, code: "0000", qci_num: 8 }),
};

const OPEN_CAPTCHA = { enabled: false, consume: () => true, validate: async () => ({ ok: false }) };

function makeApp({ env = {}, upstream = OK_UPSTREAM, captcha = OPEN_CAPTCHA, limiter } = {}) {
  return buildApp(loadConfig(env), { upstream, captcha, limiter, logger: false });
}

/** The panel always posts JSON bodies under text/plain to dodge CORS preflight. */
function post(app, url, payload) {
  return app.inject({
    method: "POST",
    url,
    headers: { "content-type": "text/plain;charset=UTF-8" },
    payload: JSON.stringify(payload),
  });
}

test("send returns success for a valid phone", async () => {
  const response = await post(makeApp(), "/gettoken/?action=send", { phone: "13800000000" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "success", msg: "验证码已发送" });
});

test("send rejects a malformed phone before touching the upstream", async () => {
  let called = false;
  const upstream = { ...OK_UPSTREAM, sendSmsCode: async () => { called = true; } };
  const response = await post(makeApp({ upstream }), "/gettoken/?action=send", { phone: "12345" });

  assert.equal(response.json().status, "error");
  assert.equal(called, false);
});

test("send demands a captcha when enabled and no result token is presented", async () => {
  const captcha = { enabled: true, consume: () => false, validate: async () => ({ ok: false }) };
  const response = await post(makeApp({ captcha }), "/gettoken/?action=send", {
    phone: "13800000000",
  });

  const body = response.json();
  assert.equal(body.status, "need_captcha");
  assert.equal(body.mobile, "138****0000");
});

test("send enforces the per-phone SMS ceiling", async () => {
  const app = makeApp({ env: { SMS_LIMIT_PER_PHONE_HOUR: "1" } });
  await post(app, "/gettoken/?action=send", { phone: "13800000000" });
  const response = await post(app, "/gettoken/?action=send", { phone: "13800000000" });

  assert.equal(response.json().status, "error");
  assert.match(response.json().msg, /频繁/);
});

test("validate exchanges a verified ticket for a result token", async () => {
  const captcha = {
    enabled: true,
    consume: () => true,
    validate: async () => ({ ok: true, resultToken: "issued" }),
  };
  const response = await post(makeApp({ captcha }), "/gettoken/?action=validate", {
    phone: "13800000000",
    ticket: "t",
    randstr: "r",
  });

  assert.deepEqual(response.json(), { status: "success", resultToken: "issued", msg: "验证通过" });
});

test("login returns the token fields the panel reads", async () => {
  const response = await post(makeApp(), "/gettoken/?action=login", {
    phone: "13800000000",
    code: "123456",
  });
  const body = response.json();

  assert.equal(body.status, "success");
  assert.ok(body.ecs_token.length > 20, "panel requires a token longer than 20 chars");
  assert.equal(body.onlin_token, "o".repeat(30));
});

test("login rejects a malformed sms code", async () => {
  const response = await post(makeApp(), "/gettoken/?action=login", {
    phone: "13800000000",
    code: "abc",
  });
  assert.equal(response.json().status, "error");
});

test("login surfaces the upstream message instead of throwing", async () => {
  const upstream = {
    ...OK_UPSTREAM,
    smsLogin: async () => { throw new UpstreamError("验证码错误"); },
  };
  const response = await post(makeApp({ upstream }), "/gettoken/?action=login", {
    phone: "13800000000",
    code: "123456",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "error", msg: "验证码错误" });
});

test("an unknown action is rejected", async () => {
  const response = await post(makeApp(), "/gettoken/?action=destroy", {});
  assert.equal(response.json().status, "error");
});

test("each query endpoint proxies its upstream result", async () => {
  const app = makeApp();
  const token = "t".repeat(40);

  for (const [path, field] of [
    ["/ocs_proxy/", "packageName"],
    ["/basicdata_proxy/", "mobile"],
    ["/qci_proxy/", "qci_num"],
  ]) {
    const response = await post(app, path, { ecs_token: token });
    assert.equal(response.statusCode, 200, path);
    assert.ok(response.json()[field] !== undefined, `${path} should carry ${field}`);
  }
});

test("a short or missing token is reported as an expired token", async () => {
  const response = await post(makeApp(), "/ocs_proxy/", { ecs_token: "" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: false, code: "TOKEN_EXPIRED", raw: "missing" });
});

test("an upstream query failure answers 502 with a readable message", async () => {
  const upstream = {
    ...OK_UPSTREAM,
    queryOcs: async () => { throw new UpstreamError("上游请求超时"); },
  };
  const response = await post(makeApp({ upstream }), "/ocs_proxy/", { ecs_token: "t".repeat(40) });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().msg, "上游请求超时");
});

test("failures the panel must act on are relayed verbatim as HTTP 200", async () => {
  const failure = { ok: false, code: "BLACKLIST", raw: "999997", msg: "账号被限制" };
  const upstream = { ...OK_UPSTREAM, queryOcs: async () => failure };
  const response = await post(makeApp({ upstream }), "/ocs_proxy/", { ecs_token: "t".repeat(40) });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), failure);
});

test("ACCESS_TOKEN blocks unauthenticated posts but leaves the health check open", async () => {
  const app = makeApp({ env: { ACCESS_TOKEN: "secret" } });

  const denied = await post(app, "/ocs_proxy/", { ecs_token: "t".repeat(40) });
  assert.equal(denied.statusCode, 401);

  const allowed = await post(app, "/ocs_proxy/", {
    ecs_token: "t".repeat(40),
    access_token: "secret",
  });
  assert.equal(allowed.statusCode, 200);

  const health = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(health.statusCode, 200);
});

test("请求格式错误不会被误判为账号失效", async () => {
  const response = await makeApp().inject({
    method: "POST",
    url: "/ocs_proxy/",
    headers: { "content-type": "text/plain" },
    payload: "not json at all",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "BAD_REQUEST");
});

test("拒绝非对象 JSON、数组字段和过大的请求", async () => {
  const app = makeApp();
  for (const payload of [null, [], "token"]) {
    const response = await post(app, "/ocs_proxy/", payload);
    assert.equal(response.statusCode, 400);
  }
  const phone = await post(app, "/gettoken/?action=send", { phone: ["13800000000"] });
  assert.equal(phone.json().status, "error");
  const large = await post(app, "/ocs_proxy/", { ecs_token: "a".repeat(17 * 1024) });
  assert.equal(large.statusCode, 413);
  const malformed = await post(app, "/ocs_proxy/", { ecs_token: "t".repeat(40) + "; other=value" });
  assert.equal(malformed.statusCode, 400);
});

test("同源和白名单请求正常，其他来源在触发上游前被拒绝", async () => {
  let calls = 0;
  const app = makeApp({
    env: { ALLOWED_ORIGINS: "https://panel.example.test" },
    upstream: { ...OK_UPSTREAM, sendSmsCode: async () => { calls += 1; return { ok: true }; } },
  });
  for (const [origin, status] of [
    ["http://localhost:5173", 200], ["https://panel.example.test", 200],
    ["https://untrusted.example.test", 403], ["null", 403],
  ]) {
    const response = await app.inject({
      method: "POST", url: "/gettoken/?action=send",
      headers: { host: "localhost:5173", origin, "content-type": "text/plain" },
      payload: JSON.stringify({ phone: "13800000000" }),
    });
    assert.equal(response.statusCode, status, origin);
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(calls, 2);
});

test("直连时伪造 X-Forwarded-For 不能绕过短信 IP 限流", async () => {
  const app = makeApp({ env: { SMS_LIMIT_PER_IP_HOUR: "1" } });
  for (const [index, ip] of ["203.0.113.1", "203.0.113.2"].entries()) {
    const response = await app.inject({
      method: "POST", url: "/gettoken/?action=send",
      headers: { "x-forwarded-for": ip, "content-type": "application/json" },
      payload: { phone: `1380000000${index}` },
    });
    assert.equal(response.json().status, index === 0 ? "success" : "error");
  }
});

test("只有配置的可信代理能提供客户端地址和外部来源", async () => {
  let userIp;
  const app = makeApp({
    env: { TRUST_PROXY: "127.0.0.1" },
    captcha: { ...OPEN_CAPTCHA, validate: async (value) => { userIp = value.userIp; return { ok: false }; } },
  });
  const response = await app.inject({
    method: "POST", url: "/gettoken/?action=validate", remoteAddress: "127.0.0.1",
    headers: { host: "api:8788", origin: "https://panel.test:8443", "x-forwarded-host": "panel.test:8443", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.3" },
    payload: { phone: "13800000000", ticket: "t", randstr: "r" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(userIp, "203.0.113.3");
});

test("登录和验证码校验都有独立的请求上限", async () => {
  let loginCalls = 0;
  let captchaCalls = 0;
  const app = makeApp({
    env: { LOGIN_LIMIT_PER_IP_HOUR: "1", CAPTCHA_LIMIT_PER_IP_HOUR: "1" },
    upstream: { ...OK_UPSTREAM, smsLogin: async () => { loginCalls += 1; return { ecsToken: "t".repeat(40) }; } },
    captcha: { ...OPEN_CAPTCHA, validate: async () => { captchaCalls += 1; return { ok: true }; } },
  });
  for (const action of ["login", "validate"]) {
    const body = { phone: "13800000000", code: "123456", ticket: "t", randstr: "r" };
    await post(app, `/gettoken/?action=${action}`, body);
    const response = await post(app, `/gettoken/?action=${action}`, body);
    assert.match(response.json().msg, /频繁/);
  }
  assert.equal(loginCalls, 1);
  assert.equal(captchaCalls, 1);
});

test("action 不会调用原型上的方法", async () => {
  const app = makeApp();
  for (const action of ["__proto__", "constructor", "toString"]) {
    const response = await post(app, `/gettoken/?action=${action}`, {});
    assert.equal(response.json().msg, "未知的 action");
  }
});

test("内部异常和上游原始凭证不会写入响应或日志", async () => {
  const logs = [];
  const secret = "sensitive-token-13800000000";
  const app = buildApp(loadConfig({}), {
    upstream: {
      ...OK_UPSTREAM,
      smsLogin: async () => { throw new UpstreamError("查询失败", { raw: secret }); },
      queryOcs: async () => { throw new Error(secret); },
    },
    logger: { level: "warn", stream: { write: (line) => logs.push(line) } },
  });
  await post(app, "/gettoken/?action=login", { phone: "13800000000", code: "123456" });
  const response = await post(app, "/ocs_proxy/", { ecs_token: "t".repeat(40) });
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.includes(secret), false);
  assert.equal(logs.join("").includes(secret), false);
  await app.close();
});

test("密码入口拒绝无效输入，并沿用手机号登录的限流规则", async () => {
  let calls = 0;
  const app = makeApp({
    env: { LOGIN_LIMIT_PER_PHONE_HOUR: "1" },
    upstream: { ...OK_UPSTREAM, passwordLogin: async (client) => {
      calls += 1;
      assert.equal(client.password, "Secret9172");
      assert.equal(client.code, undefined);
      return { ecsToken: "t".repeat(40) };
    } },
  });
  for (const password of ["", "123", "123456", "A".repeat(21), { password: "Secret9172" }]) {
    const result = await post(app, "/gettoken/?action=password", { phone: "13800000000", password });
    assert.equal(result.json().status, "error");
  }
  assert.equal(calls, 0);
  const good = await post(app, "/gettoken/?action=password", { phone: "13800000000", password: "Secret9172" });
  assert.equal(good.json().status, "success");
  const limited = await post(app, "/gettoken/?action=password", { phone: "13800000000", password: "Secret9172" });
  assert.match(limited.json().msg, /频繁/);
  assert.equal(calls, 1);
  await app.close();
});
