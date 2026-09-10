import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { createServer } from "vite";
import { buildApp } from "../server/src/app.js";
import { loadConfig } from "../server/src/config.js";

test("Vite 将带 action 查询参数、无尾斜杠及健康检查请求转发到指定端口", async (t) => {
  const api = buildApp(loadConfig({}), { logger: false });
  await api.listen({ host: "127.0.0.1", port: 0 });
  t.after(() => api.close());
  const previous = process.env.VITE_DEV_API_TARGET;
  process.env.VITE_DEV_API_TARGET = `http://127.0.0.1:${api.server.address().port}`;
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_DEV_API_TARGET;
    else process.env.VITE_DEV_API_TARGET = previous;
  });
  const vite = await createServer({
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, watch: null },
  });
  t.after(() => vite.close());
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  for (const path of ["/gettoken/?action=send", "/gettoken?action=login"]) {
    const response = await globalThis.fetch(`${origin}${path}`, {
      method: "POST", headers: { "Content-Type": "text/plain", Origin: origin },
      body: JSON.stringify({ phone: "invalid" }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal((await response.json()).status, "error");
  }
  const health = await globalThis.fetch(`${origin}/healthz`);
  assert.deepEqual(await health.json(), { ok: true });
});
