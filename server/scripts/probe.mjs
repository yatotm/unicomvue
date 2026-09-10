import { loadConfig, readServerEnv } from "../src/config.js";
import { parseCookieHeader } from "../src/upstream/cookies.js";
import { postForm } from "../src/upstream/client.js";

// 也读 .env.probe，凭证就不必出现在命令历史里。
const probeEnv = readServerEnv(process.env, new URL("../.env.probe", import.meta.url));
const token = String(probeEnv.ECS_TOKEN || "").trim();
const cookieHeader = String(probeEnv.COOKIE || "").trim();
if (!token) {
  console.error("用法: 在 server/.env.probe 写入 ECS_TOKEN=<你的 ecs_token>（可选 COOKIE=<完整 Cookie>）");
  process.exit(1);
}

const { upstream } = loadConfig();
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key, /token|cookie|ticket|secret|password|pwd|authorization/i.test(key) ? "[已隐藏]" : redact(entry),
    ]));
  }
  if (typeof value === "string") {
    let text = value.replaceAll(token, "[已隐藏]");
    if (cookieHeader) text = text.replaceAll(cookieHeader, "[已隐藏]");
    return text
      .replace(/\b(1\d{2})\d{4}(\d{4})\b/g, "$1****$2")
      .replace(/[A-Za-z0-9+/_=-]{40,}/g, "[已隐藏]");
  }
  return value;
}
const targets = [
  ["ocs", upstream.ocsPath],
  ["basicdata", upstream.basicDataPath],
  ["qci", upstream.qciPath],
];

for (const [name, path] of targets) {
  try {
    const { status, text, json } = await postForm(upstream, path, {
      ecs_token: token,
      ecs_acc: upstream.ecsAcc,
      version: upstream.appVersion,
    }, { cookies: { ...parseCookieHeader(cookieHeader), ecs_token: token } });

    console.log(`\n===== ${name} (${path}) HTTP ${status} =====`);
    console.log(json ? JSON.stringify(redact(json), null, 2).slice(0, 40_000) : redact(text).slice(0, 4000));
  } catch (error) {
    console.log(`\n===== ${name} (${path}) 失败 =====`);
    console.log(redact(error.message));
  }
}
