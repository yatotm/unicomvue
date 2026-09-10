import { randomInt } from "node:crypto";
import { postForm, UpstreamError } from "./client.js";
import { classifyUpstreamFailure, normalizeBasicData, normalizeOcs, normalizeQci } from "./normalize.js";
import { encryptCredential } from "./credentials.js";
import { summarizeUpstreamResponse } from "./diagnostics.js";
import { createOperatorVerification } from "./verification.js";
import { cookieHeader, mergeResponseCookies } from "./cookies.js";

// 路径和字段尚未完成真实账号全流程验证，已知限制见 server/README.md。

function readTokenFromCookies(headers, name) {
  const raw = headers?.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const pair = cookie.split(";", 1)[0].trim();
    if (!pair.startsWith(`${name}=`)) continue;
    const value = pair.slice(name.length + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

function upstreamMessage(json, fallback) {
  const message = json?.rsp_desc || json?.dsc || json?.desc || json?.msg || json?.message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

function isSuccessCode(code) {
  return ["0", "0000", "00", "success"].includes(String(code ?? "").trim());
}

export function createUnicomUpstream(config, { onLoginResponse, verification = createOperatorVerification() } = {}) {
  const loginConfig = { ...config, baseUrl: config.loginBaseUrl };
  const deviceFields = (deviceId) => ({
    appId: config.appId,
    version: config.appVersion,
    deviceId,
    deviceCode: deviceId,
    androidId: deviceId?.slice(8, 24),
    deviceBrand: config.deviceBrand,
    deviceModel: config.deviceModel,
    deviceOS: `android${config.androidVersion}`,
    keyVersion: "",
    isFirstInstall: "1",
  });

  async function query(path, token, normalize, logger, cookies = {}) {
    const response = await postForm(config, path, {}, {
      cookies: Object.keys(cookies).length ? cookies : { ecs_token: token },
    });
    logger?.info({ event: "unicom.response", ...summarizeUpstreamResponse(response) }, "联通查询响应");
    const { status, text, json } = response;

    const failure = classifyUpstreamFailure(text, json);
    if (failure) return withRaw(failure, json, text);

    const code = json.code ?? json.retCode;
    if (code !== undefined && !isSuccessCode(code)) {
      throw new UpstreamError(upstreamMessage(json, "查询失败"), { status, raw: text.slice(0, 200) });
    }

    const result = normalize(json);
    if (normalize !== normalizeOcs) logger?.info({
      event: "unicom.network",
      rateParsed: result.rate_mbps === undefined ? undefined : result.rate_mbps > 0 || result.rate_is_lte,
      qciParsed: normalize === normalizeQci ? Boolean(result.qci_num) : undefined,
    }, "网络信息解析完成");
    return withRaw(result, json, text);
  }

  function withRaw(result, json, text) {
    return config.debugRaw ? { ...result, _raw: json ?? text.slice(0, 4000) } : result;
  }

  async function login(action, client, logger) {
    const { phone, deviceId } = client;
    const isPassword = action === "password";
    const request = verification.request(action, client, () => {
      const suffix = String(randomInt(1_000_000)).padStart(6, "0");
      return {
        ...deviceFields(deviceId),
        mobile: encryptCredential(phone + suffix, config.loginPublicKey),
        password: encryptCredential((isPassword ? client.password : client.code) + suffix, config.loginPublicKey),
        // 手机密码登录不传 userType；01 会让上游按旧六位数字密码校验。
        ...(isPassword ? { simCount: "1" } : { loginStyle: "0" }),
        provinceChanel: "general",
        timestamp: new Date(Date.now() + 8 * 60 * 60_000).toISOString().replace(/\D/g, "").slice(0, 14),
      };
    });
    const response = await postForm(loginConfig, isPassword ? config.passwordLoginPath : config.loginPath, request.fields, { cookies: request.cookies });
    request.cookies = mergeResponseCookies(request.cookies, response.headers);
    logger?.info({ event: "unicom.response", ...summarizeUpstreamResponse(response) }, "联通登录响应");
    const { status, text, json, headers } = response;
    onLoginResponse?.(action, json);
    if (!json) throw new UpstreamError("上游返回了非 JSON 响应", { status });
    const challenge = verification.challenge(json, action, client, request);
    if (challenge) return { message: upstreamMessage(json, "请完成联通身份验证"), verification: challenge };
    if (!isSuccessCode(json.code)) throw new UpstreamError(upstreamMessage(json, "登录失败"), { status, raw: String(json.code) });
    const ecsToken = json.ecs_token || readTokenFromCookies(headers, "ecs_token");
    const onlinToken = json.token_online || json.onlin_token || readTokenFromCookies(headers, "onlin_token");
    if (!ecsToken) throw new UpstreamError("上游未返回 ecs_token", { status, raw: text.slice(0, 200) });
    logger?.info({
      event: "unicom.session",
      cookieNames: Object.keys(request.cookies).filter((name) => /^[A-Za-z_]{1,32}$/.test(name)),
      hasCookieToken: Boolean(request.cookies.ecs_token),
    }, "联通登录会话已获取");
    if (!request.cookies.ecs_token) request.cookies.ecs_token = ecsToken;
    return { ecsToken, onlinToken: onlinToken || "", desmobile: json.desmobile || "", cookie: cookieHeader(request.cookies) };
  }

  return {
    async sendSmsCode(client, logger) {
      const { phone, deviceId } = client;
      const request = verification.request("send", client, () => {
        const suffix = String(randomInt(1_000_000)).padStart(6, "0");
        return {
          ...deviceFields(deviceId),
          mobile: encryptCredential(phone + suffix, config.loginPublicKey),
          send_flag: "",
          loginCodeLen: "6",
        };
      });
      const response = await postForm(loginConfig, config.sendSmsPath, request.fields, { cookies: request.cookies });
      request.cookies = mergeResponseCookies(request.cookies, response.headers);
      logger?.info({ event: "unicom.response", ...summarizeUpstreamResponse(response) }, "联通短信响应");
      const { text, json } = response;

      onLoginResponse?.("send", json);

      if (!json) {
        throw new UpstreamError("上游返回了非 JSON 响应", { raw: text.slice(0, 200) });
      }

      const challenge = verification.challenge(json, "send", client, request);
      if (challenge) return { ok: false, message: upstreamMessage(json, "请完成联通身份验证"), verification: challenge };

      const ok = isSuccessCode(json.rsp_code ?? json.code);
      return { ok, message: upstreamMessage(json, ok ? "验证码已发送" : "发送失败") };
    },

    smsLogin: (client, logger) => login("login", client, logger),
    passwordLogin: (client, logger) => login("password", client, logger),

    queryOcs: (token, logger, cookies) => query(config.ocsPath, token, normalizeOcs, logger, cookies),
    queryBasicData: (token, logger, cookies) => query(config.basicDataPath, token, normalizeBasicData, logger, cookies),
    queryQci: (token, logger, cookies) => query(config.qciPath, token, normalizeQci, logger, cookies),
  };
}
