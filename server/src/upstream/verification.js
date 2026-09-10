import { randomBytes } from "node:crypto";
import { UpstreamError } from "./client.js";

const BROWSER_TYPES = new Set(["1", "2", "3", "5", "6", "7", "8", "10", "12", "13", "15", "16", "24", "34", "124", "134", "102", "103", "1024", "1034"]);

function isVerificationUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://img.client.10010.com"
      && url.pathname === "/loginRisk/index.html" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function createOperatorVerification({ now = Date.now, ttlMs = 5 * 60_000, maxPending = 1000 } = {}) {
  const pending = new Map();

  function purge() {
    for (const [id, entry] of pending) {
      if (entry.expiresAt <= now()) pending.delete(id);
    }
  }

  return {
    request(action, client, createFields) {
      const { operatorVerificationId: id, operatorResultToken: token } = client;
      if (!id && !token) return { fields: createFields(), cookies: {} };
      purge();
      const entry = pending.get(id);
      if (!entry || entry.action !== action || entry.phone !== client.phone || entry.deviceId !== client.deviceId
        || typeof token !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(token)) {
        throw new UpstreamError("联通验证已失效或与当前登录不匹配，请重新开始");
      }
      pending.delete(id);
      return { fields: { ...entry.fields, resultToken: token }, cookies: entry.cookies };
    },

    challenge(json, action, client, { fields, cookies }) {
      if (!["ECS99998", "ECS99999"].includes(json?.code)) return null;
      const type = String(json.type || "");
      const requiresApp = type === "4";
      const browserSupported = BROWSER_TYPES.has(type) && isVerificationUrl(json.url) && typeof json.mobile === "string" && Boolean(json.mobile);
      const verification = { type, requiresApp, browserSupported };
      if (!browserSupported || requiresApp) return verification;
      purge();
      if (pending.size >= maxPending) throw new UpstreamError("联通验证会话已满，请稍后再试");
      const id = randomBytes(16).toString("hex");
      pending.set(id, { action, phone: client.phone, deviceId: client.deviceId, fields, cookies, expiresAt: now() + ttlMs });
      // 校验完成后必须重用原请求的密文，不能重新生成手机号和验证码密文。
      return { ...verification, id, url: json.url, context: json };
    },
  };
}
