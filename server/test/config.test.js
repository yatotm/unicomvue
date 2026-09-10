import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig, readServerEnv } from "../src/config.js";

test("读取 env 文件且系统环境优先，缺失文件使用默认配置", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "unicom-env-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, ".env");
  assert.equal(loadConfig(readServerEnv({}, file)).port, 8788);
  writeFileSync(file, 'PORT=9123\nHOST=127.0.0.2\nACCESS_TOKEN="test-only"\n');
  const config = loadConfig(readServerEnv({ PORT: "9124" }, file));
  assert.equal(config.port, 9124);
  assert.equal(config.host, "127.0.0.2");
  assert.equal(config.accessToken, "test-only");
});

test("错误端口、超时和安全配置必须在启动时被拒绝", () => {
  for (const port of ["0", "-1", "1.5", "65536", "abc", "1e3"]) {
    assert.throws(() => loadConfig({ PORT: port }), /PORT/);
  }
  assert.throws(() => loadConfig({ UNICOM_TIMEOUT_MS: "invalid" }), /UNICOM_TIMEOUT_MS/);
  assert.throws(() => loadConfig({ CAPTCHA_ENABLED: "invalid" }), /CAPTCHA_ENABLED/);
  assert.throws(() => loadConfig({ CAPTCHA_ENABLED: "true" }), /CAPTCHA_APP/);
  assert.throws(() => loadConfig({ TRUST_PROXY: "true" }), /TRUST_PROXY/);
  assert.equal(loadConfig({}).trustProxy, false);
});

test("上游端点不能指向另一个域名，来源白名单必须是 origin", () => {
  for (const path of ["//other.test/login", "https://other.test/login", "/\\other.test/login"]) {
    assert.throws(() => loadConfig({ UNICOM_LOGIN_PATH: path }), /UNICOM_LOGIN_PATH/);
  }
  assert.throws(() => loadConfig({ UNICOM_BASE_URL: "ftp://example.test" }), /UNICOM_BASE_URL/);
  for (const origin of ["ftp://example.test", "https://example.test/path", "https://user:pass@example.test"]) {
    assert.throws(() => loadConfig({ UNICOM_LOGIN_BASE_URL: origin }), /UNICOM_LOGIN_BASE_URL/);
  }
  assert.throws(() => loadConfig({ ALLOWED_ORIGINS: "https://example.test/path" }), /ALLOWED_ORIGINS/);
  assert.deepEqual(loadConfig({ ALLOWED_ORIGINS: "https://example.test/" }).allowedOrigins, ["https://example.test"]);
});
