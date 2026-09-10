// 已订业务分组：serviceid 最可靠，先按编号归类；编号不认识时按业务名关键词兜底，
// 两者都认不出的业务落到“其他业务”，绝不丢弃。
const SERVICE_GROUPS = [
  {
    id: "network",
    title: "网络与速率",
    ids: ["50100", "50107", "50334", "50867", "53546", "11006078", "50027"],
    pattern: /上网|网络|峰值|提速|限速|带宽/,
  },
  { id: "voice", title: "语音", ids: ["50000", "50106"], pattern: /语音|通话|VoLTE/i },
  { id: "sms", title: "短信", ids: ["50003", "50173"], pattern: /短信|彩信/ },
  {
    id: "call",
    title: "通话功能",
    ids: ["50004", "50006", "50007", "50019", "50020", "50021", "50022"],
    pattern: /来电|呼叫|转接/,
  },
  { id: "value", title: "增值与提醒", ids: ["50202", "50300", "50356"], pattern: /彩铃|提醒|会员|视频/ },
  { id: "roaming", title: "国际与漫游", ids: ["50011", "50015"], pattern: /国际|漫游|长途|港澳台/ },
];

const OTHER_GROUP = { id: "other", title: "其他业务" };

function findGroup(id, name) {
  const byId = id && SERVICE_GROUPS.find((group) => group.ids.includes(id));
  return byId || SERVICE_GROUPS.find((group) => group.pattern.test(name)) || OTHER_GROUP;
}

function toItem(service, index) {
  const id = String(service?.id ?? "").trim();
  const name = String(service?.name ?? "").trim();
  return {
    key: `${id || "unknown"}:${index}`,
    group: findGroup(id, name).id,
    name: name || (id ? `业务 ${id}` : "未命名业务"),
    since: String(service?.since ?? "").trim() || "—",
  };
}

export function groupServices(services) {
  const items = (Array.isArray(services) ? services : [])
    .filter((service) => service && typeof service === "object")
    .map(toItem);

  return [...SERVICE_GROUPS, OTHER_GROUP]
    .map((group) => ({
      id: group.id,
      title: group.title,
      items: items
        .filter((item) => item.group === group.id)
        .sort((first, second) => first.name.localeCompare(second.name, "zh-CN")),
    }))
    .filter((group) => group.items.length);
}
