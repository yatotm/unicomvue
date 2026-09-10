import assert from "node:assert/strict";
import { createServer } from "node:http";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { postForm, UpstreamError } from "../src/upstream/client.js";
import { createUnicomUpstream } from "../src/upstream/unicom.js";
import { buildApp } from "../src/app.js";

async function upstreamServer(t, handler, env = {}) {
  const server = createServer(handler);
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return loadConfig({ ...env, UNICOM_BASE_URL: origin, UNICOM_LOGIN_BASE_URL: origin }).upstream;
}

test("超时覆盖已收到响应头但迟迟未完成的响应正文", async (t) => {
  let headersSent = false;
  const config = await upstreamServer(t, (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"code":');
    headersSent = true;
  }, { UNICOM_TIMEOUT_MS: "150" });
  await assert.rejects(postForm(config, "/slow", {}), (error) => {
    assert.ok(error instanceof UpstreamError);
    assert.match(error.message, /超时/);
    return true;
  });
  assert.equal(headersSent, true);
});

test("HTTP 错误和重定向不能成为成功查询，也不能转发凭证", async (t) => {
  const requests = [];
  const config = await upstreamServer(t, (request, response) => {
    requests.push(request.url);
    if (request.url === "/redirect") {
      response.writeHead(307, { Location: "/stolen" });
    } else response.writeHead(503);
    response.end('{"code":"0000","resources":[]}');
  });
  await assert.rejects(postForm(config, "/redirect", { ecs_token: "fake" }), /拒绝/);
  await assert.rejects(postForm(config, "/error", {}), /503/);
  assert.deepEqual(requests, ["/redirect", "/error"]);
  await assert.rejects(postForm(config, "https://other.test/", {}), /其他服务/);
});

test("限制上游报文大小并处理传输中断", async (t) => {
  const config = await upstreamServer(t, (request, response) => {
    if (request.url === "/large") return response.end("x".repeat(2 * 1024 * 1024 + 1));
    response.writeHead(200, { "Content-Length": "1000" });
    response.end("incomplete");
  }, { UNICOM_TIMEOUT_MS: "200" });
  await assert.rejects(postForm(config, "/large", {}), /响应过大/);
  await assert.rejects(postForm(config, "/broken", {}), UpstreamError);
});

test("登录从独立的 Set-Cookie 中读取 Token，不会被坏的百分号编码击穿", async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const decrypt = (value) => {
    const block = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(value, "base64"));
    assert.equal(block[0], 0);
    assert.equal(block[1], 2);
    const separator = block.indexOf(0, 2);
    assert.ok(separator >= 10);
    return block.subarray(separator + 1).toString("utf8");
  };
  const token = "t".repeat(40) + "%bad%";
  const config = await upstreamServer(t, async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const fields = new URLSearchParams(body);
    const mobile = decrypt(fields.get("mobile"));
    const password = decrypt(fields.get("password"));
    assert.match(mobile, /^13800000000\d{6}$/);
    assert.match(password, /^123456\d{6}$/);
    assert.equal(mobile.slice(-6), password.slice(-6));
    assert.equal(fields.get("loginStyle"), "0");
    assert.equal(fields.has("smsCode"), false);
    assert.equal(fields.get("keyVersion"), "");
    assert.equal(fields.get("appId"), "ChinaunicomMobileBusiness");
    assert.equal(request.headers["user-agent"].includes("13800000000"), false);
    response.setHeader("Set-Cookie", [`ecs_token=${token}; Path=/; HttpOnly`, "onlin_token=online%2Btoken; Path=/"]);
    response.end('{"code":"0000","token_online":"online-from-body"}');
  });
  const result = await createUnicomUpstream({ ...config, loginPublicKey: publicKey }).smsLogin({ phone: "13800000000", code: "123456", deviceId: "device" });
  assert.equal(result.ecsToken, token);
  assert.equal(result.onlinToken, "online-from-body");
});

test("短信发送使用加密号码并识别 rsp_code，而非仅识别 code", async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  let payload = { rsp_code: "0000", rsp_desc: "验证码已发送" };
  const config = await upstreamServer(t, async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const fields = new URLSearchParams(body);
    assert.equal(Buffer.from(fields.get("mobile"), "base64").length, 128);
    const block = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(fields.get("mobile"), "base64"));
    assert.match(block.subarray(block.indexOf(0, 2) + 1).toString("utf8"), /^13800000000\d{6}$/);
    assert.equal(body.includes("13800000000"), false);
    assert.equal(fields.get("appId"), "ChinaunicomMobileBusiness");
    assert.equal(fields.get("send_flag"), "");
    assert.equal(fields.get("keyVersion"), "");
    assert.equal(fields.get("deviceModel"), config.deviceModel);
    assert.equal(fields.get("deviceOS"), `android${config.androidVersion}`);
    response.end(JSON.stringify(payload));
  });
  const upstream = createUnicomUpstream({ ...config, loginPublicKey: publicKey });
  assert.deepEqual(await upstream.sendSmsCode({ phone: "13800000000", deviceId: "device" }), {
    ok: true, message: "验证码已发送",
  });
  payload = { rsp_code: "1001", rsp_desc: "请稍后重试" };
  assert.deepEqual(await upstream.sendSmsCode({ phone: "13800000000", deviceId: "device" }), {
    ok: false, message: "请稍后重试",
  });
});

test("查询通过 Cookie 鉴权，并识别 retCode 错误及不匹配的响应", async (t) => {
  const token = "t".repeat(40);
  let payload = { code: "0000", resources: [] };
  const config = await upstreamServer(t, (request, response) => {
    assert.equal(request.headers.cookie, `ecs_token=${token}`);
    assert.equal(request.headers["content-length"], "0");
    response.end(JSON.stringify(payload));
  });
  const upstream = createUnicomUpstream(config);
  assert.equal((await upstream.queryOcs(token)).ok, true);
  payload = { retCode: "999998" };
  assert.equal((await upstream.queryOcs(token)).code, "TOKEN_EXPIRED");
  payload = { retCode: "1001", msg: "业务失败" };
  await assert.rejects(upstream.queryOcs(token), /业务失败/);
  payload = { code: "0000", unrelated: [] };
  assert.equal((await upstream.queryOcs(token)).code, "UPSTREAM_SCHEMA_ERROR");
  payload = ["unexpected"];
  assert.equal((await upstream.queryOcs(token)).code, "UPSTREAM_NON_JSON");
});

test("UI 请求与联通诊断日志通过请求 ID 关联且不记录登录凭证", async (t) => {
  const token = "private-test-token-value-1234567890";
  const config = await upstreamServer(t, (_request, response) => {
    response.end(JSON.stringify({ code: "0000", ecs_token: token, dsc: "13800000000 654321" }));
  });
  const lines = [];
  const app = buildApp({ ...loadConfig({}), upstream: config }, {
    logger: { level: "info", stream: { write: (line) => lines.push(line) } },
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: "POST", url: "/gettoken/?action=login&private=do-not-log-this",
    payload: { phone: "13800000000", code: "654321", deviceId: "a".repeat(32) },
  });
  assert.equal(response.json().status, "success");
  const records = lines.map((line) => JSON.parse(line));
  const upstreamLog = records.find((record) => record.event === "unicom.response");
  const apiLog = records.find((record) => record.event === "api.response");
  assert.ok(upstreamLog);
  assert.ok(apiLog);
  assert.equal(upstreamLog.reqId, response.headers["x-request-id"]);
  assert.equal(apiLog.reqId, upstreamLog.reqId);
  assert.equal(apiLog.action, "login");
  assert.equal(upstreamLog.upstreamCode, "0000");
  assert.equal(upstreamLog.peerAddress, "127.0.0.1");
  for (const secret of [token, "13800000000", "654321", "do-not-log-this"]) {
    assert.equal(lines.join("").includes(secret), false);
  }
});

test("手机密码登录不传 userType，9 位混合密码完整加密并继续官方验证", async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const forms = [];
  const config = await upstreamServer(t, async (request, response) => {
    if (request.url.includes("queryOcsPackageFlow")) {
      assert.equal(request.headers.cookie, "session=challenge-cookie; ecs_token=wire%2Btoken; jwt=query-cookie");
      response.end('{"code":"0000","resources":[]}');
      return;
    }
    assert.equal(request.url, "/mobileService/login.htm");
    let body = "";
    for await (const chunk of request) body += chunk;
    forms.push(Object.fromEntries(new URLSearchParams(body)));
    if (forms.at(-1).userType === "01") {
      response.end('{"code":"4","dsc":"请输入6位数字密码[7237]"}');
      return;
    }
    if (forms.length === 1) {
      response.setHeader("Set-Cookie", "session=challenge-cookie; Path=/; HttpOnly");
      response.end(JSON.stringify({ code: "ECS99999", type: "10", userType: "01", mobile: "carrier-context", url: "https://img.client.10010.com/loginRisk/index.html", dsc: "请完成图形验证" }));
    } else {
      assert.equal(request.headers.cookie, "session=challenge-cookie");
      assert.equal(forms[1].resultToken, "official-proof");
      const retried = { ...forms[1] };
      delete retried.resultToken;
      assert.deepEqual(retried, forms[0]);
      response.setHeader("Set-Cookie", ["ecs_token=wire%2Btoken; HttpOnly", "jwt=query-cookie; Path=/"]);
      response.end(JSON.stringify({ code: "0000", ecs_token: "t".repeat(40) }));
    }
  });
  const app = buildApp({ ...loadConfig({}), upstream: { ...config, loginPublicKey: publicKey } }, { logger: false });
  t.after(() => app.close());
  const payload = { phone: "13800000000", password: "Abc.9172Z", deviceId: "a".repeat(32) };
  const first = (await app.inject({ method: "POST", url: "/gettoken/?action=password", payload })).json();
  assert.equal(first.status, "need_verification");
  assert.equal(first.verification.context.type, "10");
  assert.equal(forms[0].userType, undefined);
  assert.equal(first.verification.context.userType, "01");
  assert.equal(forms[0].smsCode, undefined);
  const encrypted = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(forms[0].password, "base64"));
  assert.match(encrypted.subarray(encrypted.indexOf(0, 2) + 1).toString("utf8"), /^Abc\.9172Z\d{6}$/);
  const resumed = (await app.inject({ method: "POST", url: "/gettoken/?action=password", payload: {
    ...payload, operatorVerificationId: first.verification.id, operatorResultToken: "official-proof",
  } })).json();
  assert.equal(resumed.status, "success");
  assert.equal(resumed.ecs_token, "t".repeat(40));
  assert.equal(forms.length, 2);
  const quota = (await app.inject({ method: "POST", url: "/ocs_proxy/", payload: { ecs_token: resumed.ecs_token, cookie: resumed.cookie } })).json();
  assert.equal(quota.ok, true);
});

test("短信和密码请求使用登录服务，查询请求使用查询服务", async (t) => {
  const loginPaths = [];
  const loginConfig = await upstreamServer(t, (request, response) => {
    loginPaths.push(request.url);
    response.end(JSON.stringify({ code: "0000", ecs_token: "t".repeat(40) }));
  });
  const queryPaths = [];
  const config = await upstreamServer(t, (request, response) => {
    queryPaths.push(request.url);
    response.end('{"code":"0000","resources":[]}');
  });
  const upstream = createUnicomUpstream({ ...config, loginBaseUrl: loginConfig.baseUrl });
  const client = { phone: "13800000000", deviceId: "a".repeat(32) };
  await upstream.sendSmsCode(client);
  await upstream.smsLogin({ ...client, code: "123456" });
  await upstream.passwordLogin({ ...client, password: "Abc.9172Z" });
  await upstream.queryOcs("t".repeat(40));
  assert.deepEqual(loginPaths, [config.sendSmsPath, config.loginPath, config.passwordLoginPath]);
  assert.deepEqual(queryPaths, [config.ocsPath]);
});
