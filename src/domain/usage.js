export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function toNum(value) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) ? number : null;
}

export function formatRateMbps(value) {
  if (value === "LTE") return "LTE";
  const number = toNum(value);
  return number === null || number <= 0 ? "—" : `${Number(number.toFixed(3))}Mbps`;
}

export function formatQciNum(value) {
  const number = toNum(value);
  return Number.isInteger(number) && number > 0 && number <= 255 ? String(number) : "—";
}

const QCI_BY_NETWORK_QUALITY = [["VVIP", 6], ["VIP", 8]];
const QCI_DEFAULT_BEARER = 9;

function reportedQci(data) {
  if (data?.qci_inferred) return "";
  const text = formatQciNum(data?.qci_num ?? data?.qci);
  return text === "—" ? "" : text;
}

function inferredQci(data) {
  const services = Array.isArray(data?.network_quality_services)
    ? data.network_quality_services.map((level) => String(level).trim().toUpperCase())
    : [];
  const matched = QCI_BY_NETWORK_QUALITY.find(([level]) => services.includes(level));
  if (matched) return matched[1];
  return data?.has_service_list === true ? QCI_DEFAULT_BEARER : 0;
}

// QCI 只取决于生效的 5G 网络质量业务：VVIP=6、VIP=8、都没订=9；速率档位不参与判断。
export function resolveQciLevel(data) {
  const reported = reportedQci(data);
  if (reported) return reported;

  const inferred = inferredQci(data);
  return inferred ? `${inferred}（推断）` : "未确认";
}

export const SIGNED_RATE_HINT = "签约速率只代表套餐签约值，不代表实时测速结果。";

const RATE_SOURCE_CONTRACT = "套餐签约";
const RATE_SOURCE_CEILING = "接口最高速率";

function positiveRate(value) {
  const number = toNum(value);
  return number !== null && number > 0 ? number : 0;
}

export function orderedServices(data) {
  return Array.isArray(data?.services)
    ? data.services.filter((service) => service && typeof service === "object")
    : [];
}

// 速率来源分散在两个接口和业务名里：全部收集，展示最高值，其余留在 title 里可查。
export function collectRateSources(basic, qci) {
  return [
    { label: RATE_SOURCE_CONTRACT, mbps: positiveRate(basic?.rate_mbps) },
    { label: RATE_SOURCE_CEILING, mbps: positiveRate(qci?.max_net_mbps) },
    ...orderedServices(qci).map((service) => ({
      label: String(service.name || "").trim() || "已订业务",
      mbps: positiveRate(service.downlink_mbps),
    })),
  ]
    .filter((source) => source.mbps > 0)
    .sort((first, second) => second.mbps - first.mbps);
}

export function resolveSignedRate(basic, qci) {
  const sources = collectRateSources(basic, qci);
  if (!sources.length) {
    return { text: basic?.rate_is_lte === true ? "LTE" : "—", title: SIGNED_RATE_HINT };
  }

  const detail = sources.map((source) => `${source.label} ${formatRateMbps(source.mbps)}`).join("；");
  return {
    text: formatRateMbps(sources[0].mbps),
    title: `${SIGNED_RATE_HINT}取以下来源的最高值：${detail}`,
  };
}

export function formatFlowFromMB(value) {
  const number = toNum(value);
  if (number === null) return "—";
  return number >= 1024
    ? `${(number / 1024).toFixed(2)}GB`
    : `${number.toFixed(2)}MB`;
}

export function formatMinutes(value) {
  const number = toNum(value);
  return number === null ? "—" : `${Math.round(number)}分钟`;
}

export function extractPackageName(data) {
  return String(data?.packageName || data?.result?.packageName || "").trim();
}

function pickByIndex(items, index) {
  return Array.isArray(items) && items.length > index ? items[index] : null;
}

function normalizeDetails(details) {
  return Array.isArray(details) ? details.filter(Boolean) : [];
}

function detailPart(value) {
  return String(value ?? "").trim();
}

// 资源块自己的名字在 addUpItemName；feePolicyName 给的是资费政策名（整份套餐的名字），
// 同一份套餐下的每一块都一样。上游只给一个时回退到另一个。
export function detailName(detail) {
  return detailPart(detail?.addUpItemName) || detailPart(detail?.feePolicyName);
}

// feePolicyId 认的是资费政策，不是资源块：一份套餐会派生出套内额度、上月结转额度、附赠包
// 等好几块，它们共用同一个 feePolicyId。只按它去重会把结转那一块整块吞掉，所以身份必须是
// 「资费政策 + 这一块自己的名称/额度/到期/流量类型/计费单元」。缺字段统一归一成空串，
// 免得 undefined 让两块不同的资源撞成一个键。
export function detailKey(detail) {
  return [
    detailPart(detail?.feePolicyId),
    detailName(detail),
    detailPart(detail?.total),
    detailPart(detail?.endDate),
    detailPart(detail?.flowType),
    detailPart(detail?.addupItemCode),
  ].join("|");
}

function mergeDetails(first, second) {
  const merged = [];
  const seen = new Set();

  for (const detail of [...normalizeDetails(first), ...normalizeDetails(second)]) {
    const key = detailKey(detail);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(detail);
  }

  return merged;
}

function mergeBlock(data, index) {
  const resource = pickByIndex(data?.resources, index);
  const unshared = pickByIndex(data?.unshared, index);
  const details = mergeDetails(resource?.details, unshared?.details);

  return details.length
    ? { ...unshared, ...resource, details }
    : null;
}

function flowTypeLabel(flowType) {
  if (flowType === "1") return "通用流量";
  if (flowType === "2") return "专属流量";
  if (flowType === "3") return "其他流量";
  return flowType ? `流量(${flowType})` : "流量";
}

function flowTypeLabelShort(flowType) {
  if (flowType === "1") return "通用";
  if (flowType === "2") return "专属";
  if (flowType === "3") return "其他";
  return "未知";
}

function shareLabel(typeMark) {
  if (typeMark === "0") return "共享";
  if (typeMark === "1") return "非共享";
  return "";
}

function flowTypeRank(flowType) {
  if (flowType === "1") return 1;
  if (flowType === "2") return 2;
  if (flowType === "3") return 3;
  return 9;
}

function getAggregate(resource) {
  const used = toNum(resource?.userResource) ?? 0;
  const remain = Math.max(0, toNum(resource?.remainResource) ?? 0);
  return { used, remain, total: used + remain };
}

function buildVoiceCard(resource) {
  const { used, remain, total } = getAggregate(resource);
  const percent = total > 0 ? clamp((used / total) * 100, 0, 100) : null;

  return {
    id: "voice",
    kind: "voice",
    title: "语音",
    subtitle: "（已用）",
    mainValue: formatMinutes(used),
    smallTotal: `总：${formatMinutes(total)}`,
    unlimited: false,
    percent,
    canUseText: `剩：${formatMinutes(remain)}`,
  };
}

function buildSmsCard(resource) {
  const { used, remain, total } = getAggregate(resource);
  const percent = total > 0 ? clamp((used / total) * 100, 0, 100) : null;

  return {
    id: "sms",
    kind: "sms",
    title: "短信",
    subtitle: "（已用）",
    mainValue: `${Math.round(used)}条`,
    smallTotal: `总：${Math.round(total)}`,
    unlimited: false,
    percent,
    canUseText: `剩：${Math.round(remain)}`,
  };
}

function buildFlowCard(detail) {
  const unlimited = String(detail?.limited) === "1";
  const flowType = String(detail?.flowType ?? "").trim();
  const used = toNum(detail?.use) ?? 0;
  const total = toNum(detail?.total);
  const remain = toNum(detail?.remain);
  const fallbackTotal = used + (remain || 0);
  const percent = unlimited
    ? 100
    : total > 0
      ? clamp((used / total) * 100, 0, 100)
      : fallbackTotal > 0
        ? clamp((used / fallbackTotal) * 100, 0, 100)
        : null;
  const sharing = unlimited ? shareLabel(detail?.typemark) : "";
  const badges = [
    { key: "flow-type", text: flowTypeLabelShort(flowType) },
    sharing ? { key: "sharing", text: sharing } : null,
    { key: "limit", text: unlimited ? "无限量" : "有上限" },
  ].filter(Boolean);

  return {
    id: `flow:${detailKey(detail)}`,
    kind: "flow",
    title: detailName(detail) || flowTypeLabel(flowType),
    mainValue: formatFlowFromMB(used),
    smallTotal: unlimited
      ? "总量：∞"
      : total !== null
        ? `总：${formatFlowFromMB(total)}`
        : "总量：—",
    unlimited,
    percent,
    canUseText: unlimited
      ? ""
      : `剩：${remain === null ? "—" : formatFlowFromMB(remain)}`,
    hideCanUseLine: unlimited,
    badges,
    flowTypeRank: flowTypeRank(flowType),
    flowLimitedKey: unlimited ? 0 : 1,
  };
}

function cardSortRank(card) {
  if (card.kind === "voice") return 0;
  if (card.kind === "sms") return 5;
  return 1000 + (card.flowTypeRank ?? 9) * 100 + (card.flowLimitedKey ?? 1) * 10;
}

export function buildCardsFromOcs(data) {
  const cards = [];
  const flowResource = mergeBlock(data, 0);
  const voiceResource = mergeBlock(data, 1);
  const smsResource = mergeBlock(data, 2);

  if (voiceResource) cards.push(buildVoiceCard(voiceResource));
  if (smsResource) cards.push(buildSmsCard(smsResource));

  if (flowResource) {
    for (const detail of flowResource.details) {
      if (String(detail?.elemType) !== "3" || detail?.hide === true) continue;
      cards.push(buildFlowCard(detail));
    }
  }

  return cards.sort((first, second) => {
    const rankDifference = cardSortRank(first) - cardSortRank(second);
    return rankDifference || String(first.title).localeCompare(String(second.title), "zh-CN");
  });
}
