import { randomBytes } from "node:crypto";

const VERIFY_URL = "https://ssl.captcha.qq.com/ticket/verify";

export function createCaptchaGuard(config, {
  now = () => Date.now(), verify, fetchImpl = globalThis.fetch, maxTokens = 1000,
} = {}) {
  const issued = new Map();

  function purge(currentTime) {
    for (const [token, entry] of issued) {
      if (entry.expiresAt <= currentTime) issued.delete(token);
    }
  }

  async function verifyTicket({ ticket, randstr, userIp }) {
    const params = new URLSearchParams({
      aid: config.appId,
      AppSecretKey: config.appSecret,
      Ticket: ticket,
      Randstr: randstr,
      UserIP: userIp || "",
    });

    const response = await fetchImpl(`${VERIFY_URL}?${params}`, {
      signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
      redirect: "error",
    });
    if (!response.ok) return { ok: false, message: "安全验证服务暂不可用" };
    const data = await response.json().catch(() => null);
    return { ok: String(data?.response) === "1", message: "安全验证未通过" };
  }

  const runVerify = verify ?? verifyTicket;

  return {
    get enabled() {
      return config.enabled;
    },

    consume(resultToken, { phone, userIp } = {}) {
      if (!config.enabled) return true;

      const currentTime = now();
      purge(currentTime);
      const entry = issued.get(resultToken);
      if (!entry || entry.phone !== phone || entry.userIp !== userIp) return false;

      issued.delete(resultToken);
      return true;
    },

    async validate({ ticket, randstr, userIp, phone }) {
      if (!config.enabled) {
        return { ok: false, message: "服务端未启用安全验证" };
      }
      if (!config.appId || !config.appSecret) {
        return { ok: false, message: "服务端未配置 CAPTCHA_APP_ID / CAPTCHA_APP_SECRET" };
      }
      if (!ticket || !randstr) {
        return { ok: false, message: "缺少验证票据" };
      }
      if (!/^1\d{10}$/.test(phone || "") || !userIp) {
        return { ok: false, message: "缺少验证上下文" };
      }
      purge(now());
      if (issued.size >= maxTokens) return { ok: false, message: "安全验证繁忙，请稍后再试" };

      let result;
      try {
        result = await runVerify({ ticket, randstr, userIp });
      } catch {
        return { ok: false, message: "安全验证服务暂不可用，请稍后再试" };
      }
      if (!result.ok) return result;

      purge(now());
      if (issued.size >= maxTokens) return { ok: false, message: "安全验证繁忙，请稍后再试" };
      const resultToken = randomBytes(24).toString("hex");
      issued.set(resultToken, { expiresAt: now() + config.ttlMs, phone, userIp });
      return { ok: true, resultToken };
    },
  };
}
