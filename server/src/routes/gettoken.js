import { UpstreamError } from "../upstream/client.js";

const PHONE_PATTERN = /^1\d{10}$/;
const CODE_PATTERN = /^\d{4,8}$/;

function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function failure(reply, message) {
  return reply.send({ status: "error", msg: message });
}

function field(request, name) {
  const value = request.body?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function operatorFields(request) {
  return {
    operatorVerificationId: field(request, "operatorVerificationId"),
    operatorResultToken: field(request, "operatorResultToken"),
  };
}

function verificationReply(reply, result) {
  return reply.send({ status: "need_verification", msg: result.message, verification: result.verification });
}

async function handleSend(request, reply, { upstream, captcha, limiter, config }) {
  const phone = field(request, "phone");
  const deviceId = field(request, "deviceId");
  const resultToken = field(request, "resultToken");

  if (!PHONE_PATTERN.test(phone)) return failure(reply, "请输入有效的手机号");

  if (captcha.enabled && !captcha.consume(resultToken, { phone, userIp: request.ip })) {
    return reply.send({
      status: "need_captcha",
      msg: "请先完成安全验证",
      mobile: maskPhone(phone),
      captchaAppId: config.captcha.appId,
    });
  }

  const { smsPerPhonePerHour, smsPerIpPerHour } = config.rateLimit;
  if (!limiter.take(`sms:ip:${request.ip}`, smsPerIpPerHour)) {
    return failure(reply, "请求过于频繁，请稍后再试");
  }
  if (!limiter.take(`sms:phone:${phone}`, smsPerPhonePerHour)) {
    return failure(reply, "该号码短信请求过于频繁，请稍后再试");
  }

  const result = await upstream.sendSmsCode({ phone, deviceId, ...operatorFields(request) }, request.log);
  if (result.verification) return verificationReply(reply, result);
  return reply.send({
    status: result.ok ? "success" : "error",
    msg: result.message,
  });
}

async function handleValidate(request, reply, { captcha, limiter, config }) {
  const phone = field(request, "phone");
  if (!PHONE_PATTERN.test(phone)) return failure(reply, "请输入有效的手机号");
  if (!limiter.take(`captcha:ip:${request.ip}`, config.rateLimit.captchaPerIpPerHour)) {
    return failure(reply, "安全验证请求过于频繁，请稍后再试");
  }
  const result = await captcha.validate({
    ticket: field(request, "ticket"),
    randstr: field(request, "randstr"),
    phone,
    userIp: request.ip,
  });

  if (!result.ok) return failure(reply, result.message);
  return reply.send({ status: "success", resultToken: result.resultToken, msg: "验证通过" });
}

async function handleLogin(request, reply, { upstream, limiter, config }, isPassword = false) {
  const phone = field(request, "phone");
  const secret = isPassword
    ? (typeof request.body?.password === "string" ? request.body.password : "")
    : field(request, "code");
  const deviceId = field(request, "deviceId");

  if (!PHONE_PATTERN.test(phone)) return failure(reply, "请输入有效的手机号");
  if (isPassword && (secret.length < 8 || secret.length > 20 || Buffer.byteLength(secret) > 100)) return failure(reply, "请输入 8–20 位联通 App 登录密码");
  if (!isPassword && !CODE_PATTERN.test(secret)) return failure(reply, "请输入有效的短信验证码");
  if (!limiter.take(`login:ip:${request.ip}`, config.rateLimit.loginPerIpPerHour)
    || !limiter.take(`login:phone:${phone}`, config.rateLimit.loginPerPhonePerHour)) {
    return failure(reply, "登录尝试过于频繁，请稍后再试");
  }

  const session = await upstream[isPassword ? "passwordLogin" : "smsLogin"]({
    phone, deviceId, ...operatorFields(request), ...(isPassword ? { password: secret } : { code: secret }),
  }, request.log);
  if (session.verification) return verificationReply(reply, session);
  return reply.send({
    status: "success",
    ecs_token: session.ecsToken,
    onlin_token: session.onlinToken,
    ...(session.cookie ? { cookie: session.cookie } : {}),
  });
}

const ACTIONS = {
  send: handleSend,
  validate: handleValidate,
  login: handleLogin,
  password: (request, reply, deps) => handleLogin(request, reply, deps, true),
};

export function registerGetToken(app, deps) {
  app.post("/gettoken/", async (request, reply) => {
    const action = typeof request.query?.action === "string" ? request.query.action.trim() : "";
    if (!Object.hasOwn(ACTIONS, action)) return failure(reply, "未知的 action");

    try {
      return await ACTIONS[action](request, reply, deps);
    } catch (error) {
      if (error instanceof UpstreamError) {
        request.log.warn({ status: error.status }, "上游登录请求失败");
        return failure(reply, error.message);
      }
      throw error;
    }
  });
}
