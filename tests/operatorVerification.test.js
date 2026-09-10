import assert from "node:assert/strict";
import { test } from "node:test";
import { effectScope } from "vue";
import { useOperatorVerification } from "../src/composables/useOperatorVerification.js";

const CHALLENGE = {
  id: "opaque-id", type: "15", browserSupported: true,
  url: "https://img.client.10010.com/loginRisk/index.html",
  context: { type: "15", mobile: "opaque-mobile-context" },
};

function messageBus() {
  const handlers = new Set();
  return {
    addEventListener: (_event, handler) => handlers.add(handler),
    removeEventListener: (_event, handler) => handlers.delete(handler),
    send: (event) => { for (const handler of handlers) handler(event); },
    get count() { return handlers.size; },
  };
}

test("只接受官方 iframe 的握手和结果，并向固定来源传送原始上下文", async () => {
  const bus = messageBus();
  const scope = effectScope();
  const flow = scope.run(() => useOperatorVerification({ messageTarget: bus }));
  const sent = [];
  const frame = { postMessage: (context, origin) => sent.push({ context, origin }) };
  try {
    const challenge = { ...CHALLENGE, type: "10", url: CHALLENGE.url + "#/?channel=h5Check" };
    const pending = flow.verify(challenge);
    assert.equal(flow.challenge.value.url, challenge.url);
    flow.frameLoaded(frame);
    assert.deepEqual(sent[0], { context: CHALLENGE.context, origin: "https://img.client.10010.com" });
    const result = { code: "0000", resultToken: "official-proof" };
    bus.send({ origin: "https://untrusted.test", source: frame, data: result });
    bus.send({ origin: "https://img.client.10010.com", source: {}, data: result });
    assert.ok(flow.challenge.value);
    bus.send({ origin: "https://img.client.10010.com", source: frame, data: { code: "myLoad" } });
    assert.equal(sent.length, 2);
    bus.send({ origin: "https://img.client.10010.com", source: frame, data: result });
    assert.equal(await pending, "official-proof");
    assert.equal(bus.count, 0);
    assert.equal(flow.challenge.value, null);
  } finally {
    scope.stop();
  }
});

test("人脸验证不伪造摄像头能力，也不打开不可信的验证页面", async () => {
  const bus = messageBus();
  const scope = effectScope();
  const flow = scope.run(() => useOperatorVerification({ messageTarget: bus }));
  try {
    await assert.rejects(flow.verify({ ...CHALLENGE, type: "4", requiresApp: true }), /官方刷脸能力/);
    for (const url of [
      "https://untrusted.test",
      "https://img.client.10010.com.evil.test/loginRisk/index.html",
      "https://img.client.10010.com/other.html",
      "http://img.client.10010.com/loginRisk/index.html",
      "https://user:pass@img.client.10010.com/loginRisk/index.html",
    ]) {
      await assert.rejects(flow.verify({ ...CHALLENGE, url }), /暂不支持/);
    }
    assert.equal(flow.challenge.value, null);
    assert.equal(bus.count, 0);
  } finally {
    scope.stop();
  }
});

test("取消、超时和退出页面会清除验证窗口与消息监听", async () => {
  const bus = messageBus();
  const scope = effectScope();
  const flow = scope.run(() => useOperatorVerification({ messageTarget: bus, timeoutMs: 10 }));
  try {
    const controller = new globalThis.AbortController();
    const aborted = flow.verify(CHALLENGE, controller.signal);
    controller.abort();
    await assert.rejects(aborted, (error) => error.name === "AbortError");
    assert.equal(bus.count, 0);
    await assert.rejects(flow.verify(CHALLENGE), /超时/);
    const canceled = flow.verify(CHALLENGE);
    scope.stop();
    assert.equal(await canceled, "");
    assert.equal(flow.challenge.value, null);
    assert.equal(bus.count, 0);
  } finally {
    scope.stop();
  }
});
