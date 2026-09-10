const BLACKLIST_CODE = "999997";
const TOKEN_CODES = ["999998", "999999"];
// 实测 queryOrderRelationship：servicestate 是数字串，在用业务恒为 "1"。
const ACTIVE_SERVICE_STATE = "1";
// 数字状态之外的兜底：别的接口/未来形态若真给中文状态，仍按文案剔除。
const INACTIVE_SERVICE_TEXT = /失效|已退订|已取消|未生效|待生效|停用/;
const MAX_SERVICES = 100;
const MAX_SERVICE_NAME_LENGTH = 60;
const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_RESOURCE_GROUPS = 20;
const MAX_RESOURCE_DETAILS = 100;
const MAX_RESOURCE_FIELD_LENGTH = 60;
const MASKED_MOBILE_PATTERN = /^1\d{2}\*{4}\d{4}$/;

function toText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function firstNumber(source, keys) {
  for (const key of keys) {
    if (!["number", "string"].includes(typeof source?.[key])) continue;
    const value = Number(source?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function classifyUpstreamFailure(rawText, parsed) {
  if (parsed) {
    const code = toText(parsed.code ?? parsed.retCode).trim();
    if (code === BLACKLIST_CODE) {
      return { ok: false, code: "BLACKLIST", raw: BLACKLIST_CODE, msg: "账号被限制" };
    }

    const tokenCode = TOKEN_CODES.find((entry) => code === entry);
    return tokenCode
      ? { ok: false, code: "TOKEN_EXPIRED", raw: tokenCode, msg: "Token 已失效" }
      : null;
  }

  const text = toText(rawText);
  const errorCode = text.match(/(?:^|[\s>])(999997|999998|999999)(?=$|[\s<])/)?.[1];
  if (errorCode === BLACKLIST_CODE) {
    return { ok: false, code: "BLACKLIST", raw: BLACKLIST_CODE, msg: "账号被限制" };
  }

  const tokenCode = TOKEN_CODES.find((entry) => errorCode === entry);
  return {
    ok: false,
    code: "UPSTREAM_NON_JSON",
    raw: tokenCode || "",
    msg: "上游返回了非 JSON 响应",
  };
}

// 余量明细里夹带 viceCardlist（副卡号码与加密的 userMobile），所以逐字段重建，绝不整体透传。
const RESOURCE_GROUP_FIELDS = ["type", "userResource", "remainResource"];
const RESOURCE_DETAIL_FIELDS = [
  "feePolicyId", "feePolicyName", "addupItemCode", "addUpItemName",
  "elemType", "flowType", "resourceType", "realresourcetype", "typemark",
  "limited", "hide",
  "total", "use", "remain", "usedPercent",
  "endDate", "endDate1", "endXsbDate",
];
const DETAIL_NAME_FIELDS = ["feePolicyName", "addUpItemName"];
const DETAIL_AMOUNT_FIELDS = ["total", "use", "remain", "usedPercent"];

// 只放行标量：viceCardlist 这类数组和对象连结构都不出网关。空串按“上游没给”处理。
function publicScalar(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, MAX_RESOURCE_FIELD_LENGTH) || undefined;
}

function pickFields(source, fields) {
  const picked = {};
  for (const field of fields) {
    const value = publicScalar(source?.[field]);
    if (value !== undefined) picked[field] = value;
  }
  return picked;
}

// 既没有名称也没有任何可读数量的条目对页面毫无用处，在网关就丢掉。
function isUsableDetail(detail) {
  if (DETAIL_NAME_FIELDS.some((field) => detail[field])) return true;
  return DETAIL_AMOUNT_FIELDS.some((field) => ["number", "string"].includes(typeof detail[field])
    && Number.isFinite(Number(detail[field])));
}

function publicResourceGroup(group) {
  const details = Array.isArray(group?.details) ? group.details : [];
  return {
    ...pickFields(group, RESOURCE_GROUP_FIELDS),
    details: details
      .slice(0, MAX_RESOURCE_DETAILS)
      .map((detail) => pickFields(detail, RESOURCE_DETAIL_FIELDS))
      .filter(isUsableDetail),
  };
}

// 分组按下标对应流量/语音/短信，空分组也要留下占位，过滤会让浏览器错位。
function publicResourceList(list) {
  return Array.isArray(list) ? list.slice(0, MAX_RESOURCE_GROUPS).map(publicResourceGroup) : [];
}

export function normalizeOcs(parsed) {
  if (!Array.isArray(parsed?.resources) && !Array.isArray(parsed?.unshared)) {
    return { ok: false, code: "UPSTREAM_SCHEMA_ERROR", msg: "上游未返回套餐余量字段，请检查接口配置" };
  }
  return {
    ok: true,
    code: "0000",
    packageName: (firstString(parsed, ["packageName"])
      || firstString(parsed?.result, ["packageName"])).slice(0, MAX_RESOURCE_FIELD_LENGTH),
    resources: publicResourceList(parsed?.resources),
    unshared: publicResourceList(parsed?.unshared),
  };
}

// 浏览器只认 1xx****xxxx，加密串或其它文本一律不出网关。
function maskedMobile(parsed) {
  const value = firstString(parsed?.rateResource, ["mobile"])
    || firstString(parsed, ["mobile", "desmobile", "userNumber"]);
  const masked = value.replace(/^(1\d{2})\d{4}(\d{4})$/, "$1****$2");
  return MASKED_MOBILE_PATTERN.test(masked) ? masked : "";
}

export function normalizeBasicData(parsed) {
  const rateText = firstString(parsed?.rateResource, ["rate"])
    || firstString(parsed, ["signRateName", "rateName", "netSpeedName", "netType"]);
  const rateMbps = parseRateMbps(rateText) || firstNumber(parsed, [
    "rate_mbps",
    "signRate",
    "rateValue",
    "netSpeed",
    "bandWidth",
  ]);
  const mobile = maskedMobile(parsed);
  const rateIsLte = parsed?.rate_is_lte === true || (rateMbps === 0 && /lte|4g/i.test(rateText));

  return {
    ok: true,
    code: mobile || rateMbps || rateIsLte ? "0000" : "",
    mobile,
    rate_mbps: rateMbps,
    rate_is_lte: rateIsLte,
  };
}

// 换算到 Mbps。无单位按 Mbps（签约速率字段就是这么给的），裸 bps 才是比特每秒。
const RATE_FACTORS = { G: 1000, M: 1, K: 0.001, BPS: 1e-6, 千兆: 1000, 兆: 1, "": 1 };

function toMbps(amount, unit, chineseUnit) {
  const rate = Number(amount) * (RATE_FACTORS[chineseUnit || String(unit ?? "").toUpperCase()] ?? 1);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

// 签约速率字段是一整串速率（"500Mbps" / "2Gbps" / "300"），单位可以省略，省略即 Mbps。
function parseRateMbps(value) {
  if (/^(?:[345]G|LTE)$/i.test(value)) return 0;
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(?:(K|M|G)(?:bps|b\/s|bit\/s)?|(千兆|兆))?$/i);
  return match ? toMbps(match[1], match[2], match[3]) : 0;
}

// 业务名里的速率必须自带单位，否则 "5G上网服务" 会被读成 5Gbps。
const RATE_IN_TEXT = /(\d+(?:\.\d+)?)\s*(?:(K|M|G)?(?:bps|b\/s|bit\/s)|(千兆|兆))/i;

// 只取下行：“下行峰值2Gbps上行峰值200Mbps” 是 2000，不是 200。
export function parseDownlinkMbps(name) {
  const text = String(name ?? "");
  const downlink = text.indexOf("下行");
  const uplink = text.indexOf("上行");
  if (downlink < 0) return uplink < 0 ? rateInText(text) : 0;
  return rateInText(text.slice(downlink, uplink > downlink ? uplink : text.length));
}

function rateInText(text) {
  const match = text.match(RATE_IN_TEXT);
  return match ? toMbps(match[1], match[2] || "bps", match[3]) : 0;
}

// servicestate 是数字时以白名单为准（只有 "1" 在用），是文案时才回退到黑名单；
// 上游压根没给状态时不擅自剔除，否则会把整张清单判死。
function isActiveService(service) {
  const state = toText(service?.servicestate).trim();
  if (!state) return true;
  if (/^\d+$/.test(state)) return state === ACTIVE_SERVICE_STATE;
  return !INACTIVE_SERVICE_TEXT.test(state);
}

// completedateFmt 形如 "2023-03-01 00:00:00"，completedate 形如 "20230301000000"，页面只要日期。
function serviceStartedAt(service) {
  const formatted = firstString(service, ["completedateFmt", "completeDateFmt"]);
  if (/^\d{4}-\d{2}-\d{2}\b/.test(formatted)) return formatted.slice(0, 10);
  const digits = firstString(service, ["completedate", "completeDate"]).replace(/\D/g, "");
  return /^\d{8}/.test(digits) ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : "";
}

// 明确列出要放行的字段：上游对象里还有 usernumber / username 这类身份信息，绝不整体透传。
function publicService(service) {
  const id = firstString(service, ["serviceid", "serviceId"]);
  const name = firstString(service, ["servicename", "serviceName"]).slice(0, MAX_SERVICE_NAME_LENGTH);
  const downlink = parseDownlinkMbps(name);
  return {
    id: SERVICE_ID_PATTERN.test(id) ? id : "",
    name,
    since: serviceStartedAt(service),
    ...(downlink ? { downlink_mbps: downlink } : {}),
  };
}

export function normalizeQci(parsed) {
  const hasServiceList = Array.isArray(parsed?.data?.serviceinfo);
  const services = hasServiceList ? parsed.data.serviceinfo.slice(0, MAX_SERVICES) : [];
  const activeServices = services.filter(isActiveService);
  const serviceNames = activeServices.map((service) => firstString(service, ["servicename", "serviceName"])
    .replace(/[\s（）()]/g, "").toUpperCase());
  const qualityServices = ["VIP", "VVIP"].filter((level) => serviceNames.includes(`5G网络服务质量${level}`));
  const directQci = parsed?.qci_inferred ? 0 : firstNumber(parsed, ["qci_num", "qci", "qciNum", "qciLevel"]);
  const qci = Number.isInteger(directQci) && directQci > 0 && directQci <= 255 ? directQci : 0;
  const hasLimitService = ["has_limit_service", "limitFlag", "speedLimitFlag"]
    .some((key) => [true, 1, "1", "true", "Y", "y"].includes(parsed?.[key]))
    || activeServices.some((service) => String(service?.serviceid) === "50027"
      || firstString(service, ["servicename", "serviceName"]) === "限速服务");

  if (!qci && !hasLimitService && !hasServiceList) return { ok: true, code: "" };

  return {
    ok: true,
    code: "0000",
    ...(qci ? { qci_num: qci } : {}),
    network_quality_services: qualityServices,
    // 客户端据此区分“业务清单为空”与“上游没给业务清单”。
    has_service_list: hasServiceList,
    has_limit_service: hasLimitService,
    max_net_mbps: firstNumber(parsed, ["max_net_mbps", "maxNetSpeed", "maxRate"]),
    services: activeServices.map(publicService).filter((service) => service.name || service.id),
  };
}
