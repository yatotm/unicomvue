// 资源名拆分。运营商把额度和限制条件塞进名字的括号里：
//   结转套内国内流量(30.00G)(上月结转限本月使用)
// 整串印出来会把一行撑爆，所以正文只留主名，括号里的内容变成一排 chip。

const PARENTHETICAL = /[(（]([^()（）]*)[)）]/g;
// 纯额度的括号（"30.00G" / "500分钟"）本身没说明这是什么，补一个「总量」前缀才成句。
const QUANTITY = /^\d+(?:\.\d+)?\s*(?:[KMGT]B?|分钟|条)$/i;

// 名字里出现这句话，就说明这是上月结转、只能用到本月底的包。接口没有对应字段。
export const CARRY_OVER_MARK = "上月结转限本月使用";

export function splitResourceName(rawName) {
  const raw = String(rawName ?? "").trim();
  if (!raw) return { name: "", chips: [], raw: "" };

  const parts = [...raw.matchAll(PARENTHETICAL)].map((match) => match[1].trim()).filter(Boolean);
  const chips = parts.map((text) => (QUANTITY.test(text) ? `总量 ${text}` : text));
  const name = raw.replace(PARENTHETICAL, "").replace(/\s+/g, " ").trim();

  // 名字整个都在括号里时不能留空，退回原串。
  // sizeChip 是不带「总量」前缀的额度，留给窄到放不下一整排 chip 的地方用。
  return { name: name || raw, chips, sizeChip: parts.find((text) => QUANTITY.test(text)) || "", raw };
}

export function isCarriedOver(rawName) {
  return String(rawName ?? "").includes(CARRY_OVER_MARK);
}
