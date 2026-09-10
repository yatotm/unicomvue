import assert from "node:assert/strict";
import { test } from "node:test";
import { cookieHeader, mergeResponseCookies, parseCookieHeader } from "../src/upstream/cookies.js";

test("Cookie 保留线上的百分号编码，正确合并更新、过期和 Max-Age 优先级", () => {
  const headers = new Headers();
  headers.append("Set-Cookie", "ecs_token=wire%2Btoken%2F; Path=/; HttpOnly");
  headers.append("Set-Cookie", "old=; Max-Age=0; Path=/");
  headers.append("Set-Cookie", "kept=value; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  const merged = mergeResponseCookies({ old: "gone", session: "first" }, headers);
  assert.equal(cookieHeader(merged), "session=first; ecs_token=wire%2Btoken%2F; kept=value");
  assert.equal(parseCookieHeader(cookieHeader(merged)).ecs_token, "wire%2Btoken%2F");
});

test("拒绝 Cookie 控制字符、非法分隔符和超大输入，不能修改对象原型", () => {
  for (const header of [null, {}, "missing-equals", "a=value\r\nHost: bad", 'a="quoted"', "a=comma,value", "a=" + "x".repeat(8192)]) {
    assert.equal(parseCookieHeader(header), null);
  }
  const cookies = parseCookieHeader("__proto__=value; valid=ok");
  assert.equal(Object.getPrototypeOf(cookies), null);
  assert.equal(cookies.__proto__, "value");
});
