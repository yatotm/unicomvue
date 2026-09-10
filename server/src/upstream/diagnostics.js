function responseShape(value, depth = 0) {
  if (Array.isArray(value)) {
    return { type: "array", count: value.length, ...(value.length && depth < 2 ? { item: responseShape(value[0], depth + 1) } : {}) };
  }
  if (value && typeof value === "object" && depth < 3) {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(key))
      .slice(0, 30)
      .map(([key, entry]) => [key, responseShape(entry, depth + 1)]));
  }
  return value === null ? "null" : typeof value;
}

export function summarizeUpstreamResponse({ status, text, json, peerAddress, tlsAuthorized, origin }) {
  const rawCode = json?.rsp_code ?? json?.code ?? json?.retCode ?? text?.trim();
  const code = typeof rawCode === "string" || typeof rawCode === "number" ? String(rawCode) : "";
  const message = json?.rsp_desc ?? json?.dsc ?? json?.desc ?? json?.msg ?? "";
  const reportedCode = typeof message === "string"
    ? message.match(/\bECS\d{3,6}\b/)?.[0] ?? (code === "4" && message.includes("[7237]") ? "7237" : null)
    : null;
  return {
    httpStatus: status,
    upstreamCode: /^(?:\d{1,6}|ECS\d{3,6}|[A-Z_]{1,20}|success)$/.test(code) ? code : null,
    reportedCode,
    upstreamOrigin: origin,
    peerAddress,
    tlsAuthorized,
    responseBytes: Buffer.byteLength(text || ""),
    captchaMentioned: typeof message === "string" && /滑块|图形|安全验证|captcha/i.test(message),
    passwordVerification: reportedCode === "ECS1502" || (typeof message === "string" && /密码校验|密码验证/.test(message)),
    servicePasswordMentioned: typeof message === "string" && /服务密码/.test(message),
    faceVerification: reportedCode === "ECS1500" || json?.type === "4",
    verificationType: typeof json?.type === "string" && /^\d{1,4}$/.test(json.type) ? json.type : null,
    verificationLocation: verificationLocation(json?.url),
    responseShape: json ? responseShape(json) : "non-json",
  };
}

function verificationLocation(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["m.client.10010.com", "loginxhm.10010.com", "img.client.10010.com"].includes(url.hostname)) {
      return { supported: false };
    }
    return {
      origin: url.origin,
      path: decodeURIComponent(url.pathname).replace(/\d{4,}|[A-Za-z0-9_-]{24,}/g, "[已隐藏]"),
      parameterNames: [...url.searchParams.keys()].filter((key) => /^[A-Za-z_]{1,32}$/.test(key)).slice(0, 20),
    };
  } catch {
    return null;
  }
}
