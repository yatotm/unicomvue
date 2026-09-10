// 两套画面用的假数据。号码一律是掩码串，绝不放真实手机号。
//
// sparse：这套设计就是照着它做的——四个流量包里三个同名、三条语音全叫「语音」、
//         短信分组返回 0 条记录、没有不限量包。
// rich  ：截图和健壮性用——七个计量流量包 + 一个不限量共享包、语音短信都有消耗、
//         二十条已订业务里混一条认不出编号的。

function flow(feePolicyId, feePolicyName, total, remain, use, endDate, extra = {}) {
  return {
    feePolicyId,
    feePolicyName,
    elemType: "3",
    limited: "0",
    flowType: "1",
    total: String(total),
    remain: String(remain),
    use: String(use),
    endDate,
    ...extra,
  };
}

function pack(feePolicyId, feePolicyName, total, remain, use, endDate) {
  return {
    feePolicyId,
    feePolicyName,
    elemType: "1",
    total: String(total),
    remain: String(remain),
    use: String(use),
    endDate,
  };
}

function service(id, name, since) {
  return { id, name, since };
}

const SPARSE_SERVICES = [
  service("11006078", "5G-A上网服务(下行峰值2Gbps上行峰值200Mbps）", "2024-03-18"),
  service("50100", "5G网络服务质量VIP", "2024-03-18"),
  service("50000", "语音主服务", "2019-06-02"),
  service("50003", "短信主服务", "2019-06-02"),
  service("50004", "来电显示", "2019-06-02"),
  service("50006", "呼叫等待", "2019-06-02"),
  service("50007", "呼叫转移", "2019-06-02"),
  service("50019", "主叫号码显示限制", "2019-06-02"),
  service("50020", "三方通话", "2020-01-11"),
  service("50021", "无条件呼叫前转", "2020-01-11"),
  service("50022", "遇忙呼叫前转", "2020-01-11"),
  service("50011", "国际漫游", "2021-07-30"),
  service("50015", "港澳台长途", "2021-07-30"),
  service("50107", "VoLTE高清语音", "2021-09-14"),
  service("50173", "短信中心业务", "2019-06-02"),
  service("50202", "视频彩铃", "2022-05-06"),
  service("50300", "话费到账提醒", "2019-06-02"),
  service("50356", "沃音乐会员", "2023-02-17"),
  service("50334", "4G上网服务", "2019-06-02"),
  service("50867", "5G基础套餐上网", "2024-03-18"),
  service("53546", "定向流量加速", "2024-08-01"),
  service("50106", "语音信箱", "2020-01-11"),
];

export const SPARSE = {
  label: "sparse",
  mobile: "170****0000",
  ocs: {
    ok: true,
    code: "0000",
    packageName: "畅越冰激凌5G套餐129元",
    resources: [
      {
        details: [
          flow("f-1", "套内国内流量(30.00G)", 30720, 30720, 0, "长期有效"),
          flow("f-2", "套内国内流量(25.00G)", 25600, 25599.97, 0.03, "2027年02月28日"),
          flow("f-3", "套餐内流量(30.00G)", 30720, 30720, 0, "长期有效"),
          flow("f-4", "结转套内国内流量(30.00G)(上月结转限本月使用)", 30720, 22131.61, 8588.39, "长期有效"),
        ],
      },
      {
        userResource: "9",
        remainResource: "1191",
        details: [
          pack("v-1", "语音", 500, 500, 0, "长期有效"),
          pack("v-2", "语音", 200, 191, 9, "2027年02月28日"),
          pack("v-3", "语音", 500, 500, 0, "长期有效"),
        ],
      },
      { userResource: "0", remainResource: "0", details: [] },
    ],
    unshared: [null, null, null],
  },
  basic: { ok: true, code: "0000", mobile: "170****0000", rate_mbps: 2000, rate_is_lte: false },
  qci: {
    ok: true,
    code: "0000",
    network_quality_services: ["VIP"],
    has_service_list: true,
    has_limit_service: false,
    max_net_mbps: 2000,
    services: SPARSE_SERVICES,
  },
};

const RICH_SERVICES = [
  service("11006078", "5G-A上网服务(下行峰值1Gbps上行峰值100Mbps）", "2023-11-02"),
  service("50100", "5G网络服务质量VVIP", "2023-11-02"),
  service("50000", "语音主服务", "2018-04-19"),
  service("50003", "短信主服务", "2018-04-19"),
  service("50004", "来电显示", "2018-04-19"),
  service("50006", "呼叫等待", "2018-04-19"),
  service("50007", "呼叫转移", "2018-04-19"),
  service("50019", "主叫号码显示限制", "2019-02-25"),
  service("50020", "三方通话", "2019-02-25"),
  service("50021", "无条件呼叫前转", "2019-02-25"),
  service("50011", "国际漫游", "2022-06-08"),
  service("50015", "港澳台长途", "2022-06-08"),
  service("50107", "VoLTE高清语音", "2020-08-13"),
  service("50173", "短信中心业务", "2018-04-19"),
  service("50202", "视频彩铃", "2021-12-01"),
  service("50300", "话费到账提醒", "2018-04-19"),
  service("50356", "沃音乐会员", "2022-03-30"),
  service("50334", "4G上网服务", "2018-04-19"),
  service("53546", "定向流量加速", "2023-11-02"),
  service("90881", "校园宽带融合权益", "2024-09-01"),
];

export const RICH = {
  label: "rich",
  mobile: "186****6666",
  ocs: {
    ok: true,
    code: "0000",
    packageName: "5G智慧沃家融合套餐199元",
    resources: [
      {
        details: [
          flow("r-1", "套内国内流量(40.00G)", 40960, 27853.44, 13106.56, "长期有效"),
          flow("r-2", "定向视频流量(15.00G)", 15360, 4915.2, 10444.8, "2026-09-30"),
          flow("r-3", "夜间闲时流量(20.00G)(23时至次日7时可用)", 20480, 20480, 0, "2026-12-31"),
          flow("r-4", "结转套内国内流量(12.00G)(上月结转限本月使用)", 12288, 3072.5, 9215.5, "长期有效"),
          flow("r-5", "校园专属流量(10.00G)", 10240, 6553.6, 3686.4, "2027-06-30"),
          flow("r-6", "赠送体验流量(5.00G)", 5120, 512, 4608, "2026-09-30"),
          flow("r-7", "家庭共享流量(30.00G)", 30720, 22118.4, 8601.6, "长期有效"),
          flow("r-8", "视频彩铃定向免流", 0, 0, 2765.31, "长期有效", { limited: "1", typemark: "0", flowType: "2" }),
        ],
      },
      {
        userResource: "246",
        remainResource: "554",
        details: [
          pack("rv-1", "套内国内语音(500分钟)", 500, 314, 186, "长期有效"),
          pack("rv-2", "赠送通话(300分钟)", 300, 240, 60, "2026-12-31"),
        ],
      },
      {
        userResource: "37",
        remainResource: "163",
        details: [
          pack("rs-1", "套内国内短信(200条)", 200, 163, 37, "长期有效"),
        ],
      },
    ],
    unshared: [null, null, null],
  },
  basic: { ok: true, code: "0000", mobile: "186****6666", rate_mbps: 1000, rate_is_lte: false },
  qci: {
    ok: true,
    code: "0000",
    network_quality_services: ["VVIP"],
    has_service_list: true,
    has_limit_service: false,
    max_net_mbps: 1000,
    services: RICH_SERVICES,
  },
};

// 健壮性场景：条数、空态、长名、完全重复、对不上的数字。
function repeated(count) {
  return Array.from({ length: count }, (_, index) => flow(
    `m-${index}`,
    `套内国内流量(${(index % 5 + 1) * 5}.00G)`,
    (index % 5 + 1) * 5120,
    (index % 5 + 1) * 5120 * (1 - (index % 7) / 10),
    (index % 5 + 1) * 5120 * ((index % 7) / 10),
    index % 3 === 0 ? "长期有效" : index % 3 === 1 ? "2027年02月28日" : "2026-12-31",
  ));
}

function withFlow(details, extra = {}) {
  return {
    ok: true,
    code: "0000",
    packageName: "健壮性验证套餐",
    resources: [{ details }, { userResource: "0", remainResource: "0", details: [] }, { details: [] }],
    unshared: [null, null, null],
    ...extra,
  };
}

export const CASES = {
  "buckets-0": withFlow([]),
  "buckets-1": withFlow([flow("s1", "套内国内流量(30.00G)", 30720, 20480, 10240, "长期有效")]),
  "buckets-2": withFlow(repeated(2)),
  "buckets-10": withFlow(repeated(10)),
  "buckets-20": withFlow(repeated(20)),
  unlimited: withFlow([
    flow("u1", "套内国内流量(20.00G)", 20480, 12288, 8192, "2026-12-31"),
    flow("u2", "畅享不限量共享流量", 0, 0, 41287.68, "长期有效", { limited: "1", typemark: "0" }),
  ]),
  "all-empty": {
    ok: true,
    code: "0000",
    packageName: "空套餐",
    resources: [{ details: [] }, { details: [] }, { details: [] }],
    unshared: [null, null, null],
  },
  "no-parenthetical": withFlow([
    flow("p1", "省内闲时流量", 8192, 6144, 2048, "2026-11-30"),
    flow("p2", "套内国内流量(10.00G)", 10240, 5120, 5120, "长期有效"),
  ]),
  "long-names": withFlow([
    flow(
      "l1",
      "中国联通5G智慧沃家全屋千兆融合套餐内赠送的国内通用数据流量(50.00G)(仅限本机使用不可结转不可转赠)",
      51200,
      33280,
      17920,
      "2027年02月28日",
    ),
    flow(
      "l2",
      "结转上月未用完的套餐内国内通用数据流量额度(30.00G)(上月结转限本月使用)",
      30720,
      6144,
      24576,
      "长期有效",
    ),
  ]),
  duplicates: withFlow([
    flow("d1", "套内国内流量(30.00G)", 30720, 30720, 0, "长期有效"),
    flow("d2", "套内国内流量(30.00G)", 30720, 30720, 0, "长期有效"),
    flow("d3", "套内国内流量(30.00G)", 30720, 30720, 0, "长期有效"),
  ]),
  // remain + use 与 total 差了一大截：必须钳位并明确标出来。
  unreconciled: withFlow([
    flow("x1", "套内国内流量(30.00G)", 30720, 28000, 9000, "长期有效"),
    flow("x2", "套内国内流量(20.00G)", 20480, 25600, 0, "2027年02月28日"),
  ]),
  "no-expiry": withFlow([
    flow("n1", "套内国内流量(30.00G)", 30720, 20480, 10240, ""),
    flow("n2", "套内国内流量(20.00G)", 20480, 20480, 0, ""),
  ]),
  // 每个包一个不同的到期日 ⇒ 十二条 lane，比任何面板都高：这是「内容超出就在区域内部
  // 滚动，区域本身不长高」那条规则唯一的驱动场景。
  "many-dates": withFlow(Array.from({ length: 12 }, (_, index) => flow(
    `md-${index}`,
    `套内国内流量(${index + 1}.00G)`,
    (index + 1) * 1024,
    (index + 1) * 1024 * 0.6,
    (index + 1) * 1024 * 0.4,
    `2026-${String((index % 12) + 1).padStart(2, "0")}-${String(((index * 3) % 27) + 1).padStart(2, "0")}`,
  ))),
};
