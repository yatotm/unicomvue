import { loadConfig } from "../src/config.js";
import { postForm } from "../src/upstream/client.js";

const { upstream } = loadConfig();
for (const origin of [upstream.baseUrl, upstream.loginBaseUrl]) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || !base.hostname.endsWith(".10010.com")) {
    console.error("实网检查只允许直连联通 HTTPS 服务");
    process.exit(1);
  }
}

for (const [name, path, baseUrl] of [
  ["发送短信入口（不提供手机号）", upstream.sendSmsPath, upstream.loginBaseUrl],
  ["短信登录入口（不提供账号）", upstream.loginPath, upstream.loginBaseUrl],
  ["App 密码登录入口（不提供账号）", upstream.passwordLoginPath, upstream.loginBaseUrl],
  ["套餐余量入口", upstream.ocsPath, upstream.baseUrl],
  ["基础信息入口", upstream.basicDataPath, upstream.baseUrl],
  ["已订业务入口", upstream.qciPath, upstream.baseUrl],
]) {
  try {
    const { status, json, text, peerAddress, tlsAuthorized } = await postForm({ ...upstream, baseUrl }, path, {});
    console.log(JSON.stringify({
      name, baseUrl, path, direct: true, peerAddress, tlsAuthorized, status,
      code: json?.code ?? json?.retCode ?? (/^\d{4,6}$/.test(text.trim()) ? text.trim() : null),
      message: json?.dsc ?? json?.desc ?? null,
      fields: json ? Object.keys(json) : [],
    }));
  } catch (error) {
    console.log(JSON.stringify({ name, baseUrl, path, direct: true, status: error.status, error: error.message }));
    process.exitCode = 1;
  }
}
