const NAME_PATTERN = /^[A-Za-z0-9_!#$%&'*+.^`|~-]+$/;
const VALUE_PATTERN = /^[\x21-\x7e]*$/;

function validPair(name, value) {
  return NAME_PATTERN.test(name) && VALUE_PATTERN.test(value) && !/[;",\\]/.test(value);
}

export function parseCookieHeader(header = "") {
  if (typeof header !== "string" || header.length > 8192 || /[\r\n]/.test(header)) return null;
  const cookies = Object.create(null);
  if (!header) return cookies;
  const parts = header.split(";");
  if (parts.length > 50) return null;
  for (const part of parts) {
    const pair = part.trim();
    const separator = pair.indexOf("=");
    if (separator <= 0) return null;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!validPair(name, value)) return null;
    cookies[name] = value;
  }
  return cookies;
}

export function mergeResponseCookies(cookies, headers) {
  const merged = Object.assign(Object.create(null), cookies);
  for (const header of headers?.getSetCookie?.() ?? []) {
    const [pair, ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!validPair(name, value)) continue;
    let maxAge;
    let expires;
    for (const attribute of attributes) {
      const [key, ...rest] = attribute.trim().split("=");
      const text = rest.join("=");
      if (key.toLowerCase() === "max-age" && /^-?\d+$/.test(text)) maxAge = Number(text);
      if (key.toLowerCase() === "expires") expires = Date.parse(text);
    }
    const expired = maxAge !== undefined ? maxAge <= 0 : expires <= Date.now();
    if (!value || expired) delete merged[name];
    else merged[name] = value;
  }
  return merged;
}

export function cookieHeader(cookies) {
  return Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ");
}
