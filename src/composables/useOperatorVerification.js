import { onScopeDispose, readonly, shallowRef } from "vue";

const VERIFY_ORIGIN = "https://img.client.10010.com";

function isVerificationUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === VERIFY_ORIGIN
      && url.pathname === "/loginRisk/index.html" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function useOperatorVerification({ messageTarget = globalThis, timeoutMs = 5 * 60_000 } = {}) {
  const challenge = shallowRef(null);
  let frameWindow = null;
  let settle = null;

  function cancel() {
    settle?.(null, "");
  }

  function postContext() {
    if (frameWindow && challenge.value) frameWindow.postMessage(challenge.value.context, VERIFY_ORIGIN);
  }

  function frameLoaded(window) {
    if (!challenge.value) return;
    frameWindow = window;
    postContext();
  }

  function verify(input, signal) {
    cancel();
    if (signal?.aborted) return Promise.reject(new DOMException("验证已取消", "AbortError"));
    if (input?.requiresApp || input?.type === "4") {
      return Promise.reject(new Error("联通要求在中国联通 App 内完成人脸验证（ECS1500）。当前网页无法调用官方刷脸能力，请先在官方 App 处理身份验证。"));
    }
    if (!input?.browserSupported || !isVerificationUrl(input.url) || !input.id
      || typeof input.context?.mobile !== "string" || !input.context.mobile) {
      return Promise.reject(new Error("联通返回的验证信息不完整或当前页面暂不支持该验证方式。"));
    }

    return new Promise((resolve, reject) => {
      let timer;
      const abort = () => settle?.(new DOMException("验证已取消", "AbortError"));
      const receive = (event) => {
        if (!frameWindow || event.origin !== VERIFY_ORIGIN || event.source !== frameWindow) return;
        const data = event.data;
        if (!data || typeof data !== "object") return;
        if (data.code === "myLoad") postContext();
        else if (data.code === "0001") cancel();
        else if (data.code === "0000" && typeof data.resultToken === "string" && /^[\x21-\x7e]{1,4096}$/.test(data.resultToken)) {
          settle?.(null, data.resultToken);
        }
      };
      settle = (error, token = "") => {
        settle = null;
        clearTimeout(timer);
        messageTarget.removeEventListener("message", receive);
        signal?.removeEventListener("abort", abort);
        frameWindow = null;
        challenge.value = null;
        if (error) reject(error);
        else resolve(token);
      };
      messageTarget.addEventListener("message", receive);
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => settle?.(new Error("联通身份验证已超时，请重新开始。")), timeoutMs);
      challenge.value = input;
    });
  }

  onScopeDispose(cancel);
  return { challenge: readonly(challenge), verify, cancel, frameLoaded };
}
