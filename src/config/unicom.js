const buildEnv = import.meta.env ?? {};

// 默认同源，避免未配置时把凭证发往第三方网关。
export const UNICOM_API_BASE_URL = String(buildEnv.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

// 此值会写入前端产物，不能代替站点访问控制。
export const UNICOM_API_ACCESS_TOKEN = String(buildEnv.VITE_API_ACCESS_TOKEN ?? "").trim();

export const UNICOM_API_ENDPOINTS = Object.freeze({
  login: `${UNICOM_API_BASE_URL}/gettoken/`,
  packageUsage: `${UNICOM_API_BASE_URL}/ocs_proxy/`,
  basicData: `${UNICOM_API_BASE_URL}/basicdata_proxy/`,
  qci: `${UNICOM_API_BASE_URL}/qci_proxy/`,
});

export const UNICOM_STORAGE_KEYS = Object.freeze({
  legacyToken: "ecs_token",
  accounts: "unicom_accounts_v1",
  activeAccountId: "unicom_active_account_id",
  phoneHistory: "last_used_phone",
  appId: "unicom_app_id",
  deviceId: "unicom_device_id",
});

export const UNICOM_REFRESH_INTERVAL_MS = 30_000;
export const TOKEN_LONG_PRESS_MS = 600;
export const SMS_COUNTDOWN_SECONDS = 60;

export const CAPTCHA_APP_ID = String(buildEnv.VITE_CAPTCHA_APP_ID ?? "").trim();
export const CAPTCHA_SCRIPT_SRC = "https://turing.captcha.qcloud.com/TJCaptcha.js";

export const UNICOM_ECS_ACCOUNT = "sGPt3BqyB6Z8STGQtqwLkkapYkz97jot5FVcLTq2IuxlXuBzS1vqZlKEe9Ac4QHJBkBAZYrKQKZyUhWatBMozAVYOL1Wd7sO/hXwCTggEcCFgpgaBytbG99HN3xavOGbeDtTZGV7eiBYSsQNhJ3wRvnvN2PKXFzBLhPa8i0j8Gs=";
