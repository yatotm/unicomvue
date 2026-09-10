import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";

// 使用独立 Agent，避免继承运行环境的 HTTP 代理配置。
const DIRECT_AGENTS = {
  "http:": new HttpAgent({ keepAlive: true, proxyEnv: {} }),
  "https:": new HttpsAgent({ keepAlive: true, proxyEnv: {} }),
};

export class UpstreamError extends Error {
  constructor(message, { status = 0, raw = "" } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.raw = raw;
  }
}

export function buildUserAgent(config, desmobile = "") {
  const { androidVersion, deviceModel, deviceBrand, appVersion } = config;
  return `Mozilla/5.0 (Linux; Android ${androidVersion}; ${deviceModel} Build/SP1A.210812.016; wv) `
    + "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/103.0.5060.129 Mobile Safari/537.36; "
    + `unicom{version:${appVersion},desmobile:${desmobile}};`
    + `devicetype{deviceBrand:${deviceBrand},deviceModel:${deviceModel}};{yw_code:}`;
}

function encodeForm(fields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

async function readBody(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.byteLength;
    if (size > 2 * 1024 * 1024) {
      response.destroy();
      throw new UpstreamError("上游响应过大", { status: response.statusCode });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function postForm(config, path, fields, { desmobile = "", cookies = {} } = {}) {
  const url = new URL(path, config.baseUrl);
  if (!DIRECT_AGENTS[url.protocol]) throw new UpstreamError("上游协议必须是 HTTP 或 HTTPS");
  if (url.origin !== new URL(config.baseUrl).origin) throw new UpstreamError("上游路径不能指向其他服务");
  for (const value of Object.values(cookies)) {
    if (value && (typeof value !== "string" || /[^\x21-\x7e]|[;",\\]/.test(value))) {
      throw new UpstreamError("Token 格式错误");
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const cookieHeader = Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  try {
    const body = encodeForm(fields);
    const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;
    const response = await new Promise((resolve, reject) => {
      const request = requestImpl(url, {
        method: "POST",
        agent: DIRECT_AGENTS[url.protocol],
        signal: controller.signal,
        headers: {
          "User-Agent": buildUserAgent(config, desmobile),
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Content-Length": Buffer.byteLength(body),
          "Accept-Encoding": "identity",
          Accept: "application/json, text/plain, */*",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      }, resolve);
      request.once("error", reject);
      request.end(body);
    });
    const status = response.statusCode;
    const peerAddress = response.socket.remoteAddress;
    const tlsAuthorized = response.socket.authorized === true;
    if (status >= 300 && status < 400) {
      response.destroy();
      throw new UpstreamError("上游拒绝了请求（可能是地域或风控拦截）", { status });
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new UpstreamError(`上游服务异常（HTTP ${status}）`, { status });
    }

    const text = await readBody(response);
    let json = null;
    try {
      const value = JSON.parse(text);
      if (value && typeof value === "object" && !Array.isArray(value)) json = value;
    } catch {
      // 非 JSON 业务错误码由适配层识别。
    }
    const headers = new Headers();
    for (let index = 0; index < response.rawHeaders.length; index += 2) {
      headers.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
    }
    return { status, text, json, headers, peerAddress, tlsAuthorized, origin: url.origin };
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError(controller.signal.aborted ? "上游请求超时" : "上游请求失败");
  } finally {
    clearTimeout(timer);
  }
}
