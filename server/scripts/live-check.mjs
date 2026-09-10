import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { loadConfig, readServerEnv } from "../src/config.js";
import { parseCookieHeader } from "../src/upstream/cookies.js";
import { createUnicomUpstream } from "../src/upstream/unicom.js";

const file = new URL("../.env.probe", import.meta.url);
const env = readServerEnv(readServerEnv(), file);
const phone = String(env.PHONE || "").trim();
const code = String(env.SMS_CODE || "").trim();
const action = process.argv[2] || "status";

if (action === "status") {
  console.log(JSON.stringify({ phoneConfigured: /^1\d{10}$/.test(phone), codeConfigured: /^\d{4,8}$/.test(code) }));
  process.exit(0);
}
if (!["send", "login"].includes(action) || !/^1\d{10}$/.test(phone)) {
  console.error("请在 server/.env.probe 填写 PHONE，然后使用 live-check.mjs send 或 login");
  process.exit(1);
}
if (action === "login" && !/^\d{4,8}$/.test(code)) {
  console.error("请先把刚收到的短信验证码填入 server/.env.probe 的 SMS_CODE");
  process.exit(1);
}

const { upstream: config } = loadConfig();
if (config.baseUrl !== "https://m.client.10010.com"
  || !["https://loginxhm.10010.com", "https://loginxx.10010.com", "https://m.client.10010.com"].includes(config.loginBaseUrl)) {
  console.error("实网测试只允许直连已知联通登录与查询服务");
  process.exit(1);
}
const deviceId = env.DEVICE_ID || randomBytes(16).toString("hex");
if (!env.DEVICE_ID) {
  writeFileSync(file, readFileSync(file, "utf8") + `\nDEVICE_ID=${deviceId}\n`, { mode: 0o600 });
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key, /token|cookie|ticket|secret|password|pwd|mobile|phone|appid|device|user(name|id)|idcard|address/i.test(key)
        ? "[已隐藏]" : redact(entry),
    ]));
  }
  if (typeof value === "string") {
    let text = value.replaceAll(phone, "[手机号]");
    if (code) text = text.replaceAll(code, "[验证码]");
    return text
      .replace(/\b1\d{10}\b/g, "[手机号]")
      .replace(/[A-Za-z0-9+/_=-]{32,}/g, "[已隐藏]");
  }
  return value;
}

const upstream = createUnicomUpstream(config, {
  onLoginResponse: (stage, json) => console.log(JSON.stringify({ stage, response: redact(json) })),
});

try {
  if (action === "send") {
    const lastAttempt = Number(env.SMS_ATTEMPT_AT || 0);
    if (Date.now() - lastAttempt < 60_000) throw new Error("距离上次短信测试不足 60 秒，请勿重复发送");
    writeFileSync(file, readFileSync(file, "utf8") + `\nSMS_ATTEMPT_AT=${Date.now()}\n`, { mode: 0o600 });
    const result = await upstream.sendSmsCode({ phone, deviceId });
    console.log(JSON.stringify(redact(result)));
    if (!result.ok) process.exitCode = 1;
  } else {
    const session = await upstream.smsLogin({ phone, code, deviceId });
    if (session.verification) throw new Error(session.verification.requiresApp
      ? "联通要求在官方 App 内完成人脸验证"
      : "联通要求额外身份验证，请通过网页继续");
    console.log(JSON.stringify({ login: "success", hasEcsToken: Boolean(session.ecsToken), hasOnlineToken: Boolean(session.onlinToken) }));
    // 查询接口走 Cookie 鉴权，只带 ecs_token 会被判为「用户信息为空」。
    const cookies = parseCookieHeader(session.cookie) || {};
    writeFileSync(file, `${readFileSync(file, "utf8")}\nECS_TOKEN=${session.ecsToken}\nCOOKIE=${session.cookie}\n`, { mode: 0o600 });
    for (const method of ["queryOcs", "queryBasicData", "queryQci"]) {
      try {
        console.log(JSON.stringify({ query: method, result: redact(await upstream[method](session.ecsToken, undefined, cookies)) }));
      } catch (error) {
        console.log(JSON.stringify({ query: method, error: redact(error.message), status: error.status }));
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  console.error(JSON.stringify({ error: redact(error.message), status: error.status }));
  process.exitCode = 1;
}
