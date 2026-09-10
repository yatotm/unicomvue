import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { effectScope, ref } from "vue";
import {
  ensureLoginIdentity,
  useLoginFlow,
} from "../src/composables/useLoginFlow.js";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalFetch = globalThis.fetch;
const originalTencentCaptcha = globalThis.TencentCaptcha;

function restoreGlobal(name, value) {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
}

function needCaptchaResponse() {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({ status: "need_captcha", mobile: "mobile-token", captchaAppId: "123456" });
    },
  };
}

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Condition was not reached in time");
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
}

function createLoginFlow(captchaScriptTimeoutMs, operatorVerificationOptions) {
  const scope = effectScope();
  const open = ref(true);
  const flow = scope.run(() => useLoginFlow(open, { captchaScriptTimeoutMs, operatorVerificationOptions }));
  flow.phone.value = "13800138000";
  return { flow, scope };
}

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorageDescriptor);
  } else {
    delete globalThis.localStorage;
  }
  restoreGlobal("fetch", originalFetch);
  restoreGlobal("TencentCaptcha", originalTencentCaptcha);
});

test("login identity remains stable when localStorage cannot be read or written", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("storage is blocked");
    },
  });

  const first = ensureLoginIdentity();
  const second = ensureLoginIdentity();

  assert.deepEqual(second, first);
  assert.match(first.appId, /^[a-zA-Z0-9]{64,256}$/);
  assert.match(first.deviceId, /^[a-f0-9]{32}$/);
});

test("captcha script loading times out and removes the script request", async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
  };
  globalThis.fetch = async () => needCaptchaResponse();
  delete globalThis.TencentCaptcha;

  const { flow, scope } = createLoginFlow(10);
  const pending = flow.sendCode();

  await waitFor(() => flow.captchaScriptRequested.value);
  assert.equal(await pending, false);
  assert.equal(flow.captchaScriptRequested.value, false);
  assert.match(flow.message.value, /验证码组件加载超时/);
  scope.stop();
});

test("disposing the login scope settles captcha loading and clears its request", async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
  };
  globalThis.fetch = async () => needCaptchaResponse();
  delete globalThis.TencentCaptcha;

  const { flow, scope } = createLoginFlow(1_000);
  const pending = flow.sendCode();

  await waitFor(() => flow.captchaScriptRequested.value);
  scope.stop();

  assert.equal(await pending, false);
  assert.equal(flow.captchaScriptRequested.value, false);

  flow.onCaptchaScriptLoad();
  flow.onCaptchaScriptError();
  assert.equal(flow.captchaScriptRequested.value, false);
});

test("未配置验证码 AppID 时不加载第三方组件", async () => {
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ status: "need_captcha" }),
  });
  const { flow, scope } = createLoginFlow(1000);
  try {
    assert.equal(await flow.sendCode(), false);
    assert.equal(flow.captchaScriptRequested.value, false);
    assert.match(flow.message.value, /未配置安全验证/);
  } finally {
    scope.stop();
  }
});

function operatorTestContext() {
  const handlers = new Set();
  const target = {
    addEventListener: (_name, handler) => handlers.add(handler),
    removeEventListener: (_name, handler) => handlers.delete(handler),
    send: (event) => { for (const handler of handlers) handler(event); },
  };
  const verification = {
    id: "test-session", type: "10", requiresApp: false, browserSupported: true,
    url: "https://img.client.10010.com/loginRisk/index.html",
    context: { type: "10", mobile: "opaque-mobile" },
  };
  const response = (value) => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });
  return { target, verification, response, handlers };
}

test("App 登录密码登录完成官方图形验证后继续，密码不写入存储或账号结果", async () => {
  const { target, verification, response } = operatorTestContext();
  const writes = [];
  globalThis.localStorage = { getItem: () => null, setItem: (key, value) => writes.push([key, value]) };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith("?action=password"));
    calls.push(JSON.parse(options.body));
    return response(calls.length === 1 ? { status: "need_verification", verification } : { status: "success", ecs_token: "t".repeat(40), cookie: "session=verified" });
  };
  const { flow, scope } = createLoginFlow(1000, { messageTarget: target });
  try {
    flow.setMode("password");
    flow.password.value = "Abc.9172Z";
    const pending = flow.submitPasswordLogin();
    await waitFor(() => flow.operatorChallenge.value !== null);
    const frame = { postMessage: (value) => assert.deepEqual(globalThis.structuredClone(value), verification.context) };
    flow.onOperatorFrameLoad(frame);
    target.send({ origin: "https://img.client.10010.com", source: frame, data: { code: "0000", resultToken: "official-proof" } });
    const account = await pending;
    assert.equal(calls.length, 2);
    assert.equal(calls[1].operatorResultToken, "official-proof");
    assert.equal(calls[1].operatorVerificationId, verification.id);
    assert.equal(calls[1].password, "Abc.9172Z");
    assert.equal(account.loginType, "password");
    assert.equal(account.cookie, "session=verified");
    assert.equal(account.password, undefined);
    assert.equal(flow.password.value, "");
    assert.equal(JSON.stringify(writes).includes("Abc.9172Z"), false);
  } finally {
    scope.stop();
  }
});

test("修改号码会取消官方验证，迟到的验证结果不会触发另一个账号的请求", async () => {
  const { target, verification, response, handlers } = operatorTestContext();
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return response({ status: "need_verification", verification }); };
  const { flow, scope } = createLoginFlow(1000, { messageTarget: target });
  try {
    const pending = flow.sendCode();
    await waitFor(() => flow.operatorChallenge.value !== null);
    const frame = { postMessage() {} };
    flow.onOperatorFrameLoad(frame);
    flow.phone.value = "13900139000";
    assert.equal(await pending, false);
    assert.equal(handlers.size, 0);
    target.send({ origin: "https://img.client.10010.com", source: frame, data: { code: "0000", resultToken: "late-proof" } });
    assert.equal(requests, 1);
  } finally {
    scope.stop();
  }
});

test("人脸要求显示官方 App 提示，不反复发送短信", async () => {
  const { response } = operatorTestContext();
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return response({ status: "need_verification", verification: { type: "4", requiresApp: true, browserSupported: false } }); };
  const { flow, scope } = createLoginFlow(1000);
  try {
    assert.equal(await flow.sendCode(), false);
    assert.match(flow.message.value, /中国联通 App.*人脸验证/);
    assert.equal(flow.operatorChallenge.value, null);
    assert.equal(requests, 1);
  } finally {
    scope.stop();
  }
});
