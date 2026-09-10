import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const DEFAULT_ECS_ACC = "sGPt3BqyB6Z8STGQtqwLkkapYkz97jot5FVcLTq2IuxlXuBzS1vqZlKEe9Ac4QHJBkBAZYrKQKZyUhWatBMozAVYOL1Wd7sO/hXwCTggEcCFgpgaBytbG99HN3xavOGbeDtTZGV7eiBYSsQNhJ3wRvnvN2PKXFzBLhPa8i0j8Gs=";

export function readServerEnv(env = process.env, file = new URL("../.env", import.meta.url)) {
  let fileEnv = {};
  try {
    fileEnv = parseEnv(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...fileEnv, ...env };
}

function createReaders(env) {
  const text = (name, fallback) => {
    const value = env[name];
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  };

  const number = (name, fallback, max = 2_147_483_647) => {
    const raw = text(name, "");
    if (!raw) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new Error(`${name} 必须是 1 到 ${max} 之间的整数`);
    }
    return value;
  };

  const boolean = (name, fallback) => {
    const value = text(name, "").toLowerCase();
    if (!value) return fallback;
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    throw new Error(`${name} 必须是 true 或 false`);
  };

  const list = (name) => text(name, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return { text, number, boolean, list };
}

export function loadConfig(env = readServerEnv()) {
  const { text, number, boolean, list } = createReaders(env);
  const proxy = text("TRUST_PROXY", "");
  const trustProxy = !proxy || proxy === "false"
    ? false
    : /^\d+$/.test(proxy) ? number("TRUST_PROXY", 1, 10) : list("TRUST_PROXY");
  if (proxy === "true") throw new Error("TRUST_PROXY 请填写可信代理的 IP/CIDR 或跳数，不能信任所有来源");

  const allowedOrigins = list("ALLOWED_ORIGINS").map((origin) => {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("ALLOWED_ORIGINS 必须是完整的 http/https 来源，不能包含路径或凭证");
    }
    return url.origin;
  });
  const serviceUrl = (name, fallback) => {
    const url = new URL(text(name, fallback));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(`${name} 必须是 http/https 服务地址，不能包含路径或凭证`);
    }
    return url;
  };
  const baseUrl = serviceUrl("UNICOM_BASE_URL", "https://m.client.10010.com");
  const loginBaseUrl = serviceUrl("UNICOM_LOGIN_BASE_URL", "https://loginxhm.10010.com");
  const upstreamPath = (name, fallback) => {
    const path = text(name, fallback);
    if (!path.startsWith("/") || new URL(path, baseUrl).origin !== baseUrl.origin) {
      throw new Error(`${name} 必须是 UNICOM_BASE_URL 下的路径`);
    }
    return path;
  };
  const captchaEnabled = boolean("CAPTCHA_ENABLED", false);
  if (captchaEnabled && (!text("CAPTCHA_APP_ID", "") || !text("CAPTCHA_APP_SECRET", ""))) {
    throw new Error("启用验证码必须配置 CAPTCHA_APP_ID 和 CAPTCHA_APP_SECRET");
  }

  return Object.freeze({
    host: text("HOST", "127.0.0.1"),
    port: number("PORT", 8788, 65535),
    trustProxy,
    allowedOrigins,
    accessToken: text("ACCESS_TOKEN", ""),
    logLevel: text("LOG_LEVEL", "info"),

    upstream: Object.freeze({
      baseUrl: baseUrl.origin,
      loginBaseUrl: loginBaseUrl.origin,
      ecsAcc: text("UNICOM_ECS_ACC", DEFAULT_ECS_ACC),
      appVersion: text("UNICOM_APP_VERSION", "android@13.0000"),
      appId: text("UNICOM_APP_ID", "ChinaunicomMobileBusiness"),
      deviceBrand: text("UNICOM_DEVICE_BRAND", "samsung"),
      deviceModel: text("UNICOM_DEVICE_MODEL", "SM-G9910"),
      androidVersion: text("UNICOM_ANDROID_VERSION", "12"),
      timeoutMs: number("UNICOM_TIMEOUT_MS", 15_000),
      debugRaw: boolean("DEBUG_RAW", false),
      sendSmsPath: upstreamPath("UNICOM_SEND_SMS_PATH", "/mobileService/sendRadomNum.htm"),
      loginPath: upstreamPath("UNICOM_LOGIN_PATH", "/mobileService/radomLogin.htm"),
      passwordLoginPath: upstreamPath("UNICOM_PASSWORD_LOGIN_PATH", "/mobileService/login.htm"),
      ocsPath: upstreamPath(
        "UNICOM_OCS_PATH",
        "/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune",
      ),
      basicDataPath: upstreamPath("UNICOM_BASIC_DATA_PATH", "/servicebusiness/query/fiveg/getbasicdata"),
      qciPath: upstreamPath("UNICOM_QCI_PATH", "/servicebusiness/newOrdered/queryOrderRelationship"),
    }),

    captcha: Object.freeze({
      enabled: captchaEnabled,
      appId: text("CAPTCHA_APP_ID", ""),
      appSecret: text("CAPTCHA_APP_SECRET", ""),
      ttlMs: number("CAPTCHA_TTL_MS", 5 * 60_000),
      timeoutMs: number("CAPTCHA_TIMEOUT_MS", 10_000),
    }),

    rateLimit: Object.freeze({
      smsPerPhonePerHour: number("SMS_LIMIT_PER_PHONE_HOUR", 5),
      smsPerIpPerHour: number("SMS_LIMIT_PER_IP_HOUR", 10),
      loginPerPhonePerHour: number("LOGIN_LIMIT_PER_PHONE_HOUR", 20),
      loginPerIpPerHour: number("LOGIN_LIMIT_PER_IP_HOUR", 60),
      captchaPerIpPerHour: number("CAPTCHA_LIMIT_PER_IP_HOUR", 60),
    }),
  });
}
