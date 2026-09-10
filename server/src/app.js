import cors from "@fastify/cors";
import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { createCaptchaGuard } from "./captcha.js";
import { createRateLimiter } from "./ratelimit.js";
import { registerGetToken } from "./routes/gettoken.js";
import { registerProxy } from "./routes/proxy.js";
import { createUnicomUpstream } from "./upstream/unicom.js";

function registerBodyParser(app) {
  app.addContentTypeParser(
    ["text/plain", "application/json"],
    { parseAs: "string" },
    (_request, body, done) => {
      try {
        const value = JSON.parse(body);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        done(null, value);
      } catch {
        done(Object.assign(new Error("请求正文必须是 JSON 对象"), { statusCode: 400 }));
      }
    },
  );
}

function registerAccessGuard(app, accessToken) {
  const expected = Buffer.from(accessToken);
  app.addHook("preHandler", async (request, reply) => {
    if (request.method !== "POST") return;
    const value = request.body?.access_token;
    const actual = Buffer.from(typeof value === "string" ? value : "");
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return;
    return reply.code(401).send({ ok: false, status: "error", code: "ACCESS_DENIED", msg: "后端访问密钥无效，请检查配置" });
  });
}

function registerOriginGuard(app, allowedOrigins) {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-ID", request.id);
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    const origin = request.headers.origin;
    if (!origin) return;
    if (origin === `${request.protocol}://${request.host}` || allowedOrigins.includes(origin)) return;
    return reply.code(403).send({ ok: false, status: "error", code: "ORIGIN_DENIED", msg: "不允许此来源访问后端" });
  });
}

export function buildApp(config, overrides = {}) {
  const app = Fastify({
    routerOptions: { ignoreTrailingSlash: true },
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
    requestTimeout: 30_000,
    disableRequestLogging: true,
    logger: overrides.logger ?? { level: config.logLevel },
  });

  const upstream = overrides.upstream ?? createUnicomUpstream(config.upstream);
  const captcha = overrides.captcha ?? createCaptchaGuard(config.captcha);
  const limiter = overrides.limiter ?? createRateLimiter();

  app.addHook("onResponse", async (request, reply) => {
    if (request.method !== "POST") return;
    const action = request.query?.action;
    request.log.info({
      event: "api.response",
      route: request.routeOptions.url,
      action: ["send", "login", "password", "validate"].includes(action) ? action : undefined,
      httpStatus: reply.statusCode,
      elapsedMs: Math.round(reply.elapsedTime),
    }, "API 请求完成");
  });

  registerBodyParser(app);
  registerOriginGuard(app, config.allowedOrigins);
  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) request.log.error({ code: error.code }, "请求处理失败");
    const msg = status === 413 ? "请求正文过大" : status < 500 ? "请求格式错误" : "服务内部错误";
    return reply.code(status).send({ ok: false, status: "error", code: status < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR", msg });
  });

  if (config.accessToken) registerAccessGuard(app, config.accessToken);

  app.get("/healthz", async () => ({ ok: true }));
  registerGetToken(app, { upstream, captcha, limiter, config });
  registerProxy(app, { upstream });

  return app;
}
