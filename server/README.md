# 余量面板 · 自建后端

自托管的 Fastify 网关。默认数据流是浏览器 → 你的后端 → 中国联通，链路中不存在第三方网关，也不持久化手机号、短信验证码或联通 Token。

## 它做什么

前端以 `Content-Type: text/plain;charset=UTF-8` 提交 JSON，也兼容 `application/json`。后端只接收 JSON 对象，请求正文上限 16 KiB；所有接口响应禁止缓存。

| 路径 | 说明 |
| --- | --- |
| `POST /gettoken/?action=send` | 请求短信验证码 |
| `POST /gettoken/?action=validate` | 校验腾讯云验证码票据，签发 `resultToken` |
| `POST /gettoken/?action=login` | 手机号 + 验证码换 Token 和 Cookie 会话 |
| `POST /gettoken/?action=password` | 手机号 + 联通登录密码登录 |
| `POST /ocs_proxy/` | 套餐与资源余量，按字段白名单逐条重建 |
| `POST /basicdata_proxy/` | 脱敏号码、签约速率 |
| `POST /qci_proxy/` | 已订业务：网络质量业务、业务清单标志、限速状态、可用最高速率、在用业务清单 |
| `GET /healthz` | 健康检查 |

## 快速开始

```bash
cp server/.env.example server/.env
pnpm install
pnpm dev
```

`pnpm dev` 同时启动后端与前端。浏览器访问 `http://localhost:5173`，API 默认监听 `127.0.0.1:8788`。单独启动可使用 `pnpm dev:web`、`pnpm dev:api`，后端生产启动使用 `pnpm --filter unicom-server start`。

后端始终从项目的 `server/.env` 读取配置，不依赖命令执行目录；系统环境变量优先。修改配置后重启进程。

前端保持 `VITE_API_BASE_URL` 为空。开发及 `pnpm preview` 的 API 代理自动跟随 `server/.env` 中的 `HOST`、`PORT`，包含带 `?action=...` 参数的登录请求和 `/healthz`。根目录 `.env` 的 `VITE_DEV_API_TARGET` 可覆盖代理目标；连接远程后端时使用 `pnpm dev:web`。

修改本地后端端口只需改 `server/.env` 的 `PORT`。也可以临时运行 `PORT=9123 pnpm dev`。端口被占用时会明确报错，不会静默换端口。

Docker Compose 一起起前后端。拉取已发布的镜像不需要克隆仓库：

```bash
curl -fLO https://github.com/yatotm/unicomvue/releases/latest/download/docker-compose.yml
docker compose pull
docker compose up -d          # http://localhost:8086
```

网关的默认值够用就到此为止。要改配置，把发行版里的 `server.env.example` 放成 compose 文件旁边的 `server/.env`：

```bash
mkdir -p server
curl -fL -o server/.env https://github.com/yatotm/unicomvue/releases/latest/download/server.env.example
docker compose up -d
```

在仓库里则从源码构建，`server/Dockerfile` 与网页镜像一起重建：

```bash
cp server/.env.example server/.env
docker compose up -d --build  # http://localhost:8086
```

Compose 对外只映射网页端口，默认 `127.0.0.1:8086`。在 compose 文件旁边的 `.env` 设置 `WEB_PORT=9124` 可更改它；需要局域网访问时设置 `WEB_HOST=0.0.0.0`。同一份 `.env` 里的 `IMAGE_NAMESPACE` 和 `IMAGE_TAG` 决定拉哪个命名空间、哪个版本的镜像。容器间固定使用 `api:8788`，Compose 会覆盖后端的 `HOST`、`PORT` 和 `TRUST_PROXY`，因此宿主机已有服务不会占用容器内的 API 端口。API 无需映射到宿主机。

Compose 支持无 `server/.env` 使用默认值（需要 Docker Compose 2.24+）。`server/Dockerfile` 分两阶段：先按仓库锁文件解析网关自己的生产依赖（`pnpm deploy`，不会带进前端的依赖），运行阶段只留网关代码和这些依赖，以非 root 的 `node` 用户启动；健康检查通过后再启动网页容器。

镜像由 [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) 发布：lint 与测试通过后，`unicomvue-web`、`unicomvue-api` 两个镜像各构建 `linux/amd64` 与 `linux/arm64` 推到 Docker Hub，`v*` 标签还会附带部署文件创建 GitHub 发行版。自建 fork 需要配置仓库密钥 `DOCKER_USERNAME` 和 `DOCKER_PASSWORD`，缺失时推送任务直接报错。

### SSH 端口转发

VS Code Remote SSH 的“端口”面板通常连接项目服务器的本机地址。仅通过 SSH 访问时使用 `WEB_HOST=127.0.0.1`；同时需要局域网访问时使用 `WEB_HOST=0.0.0.0`。修改根目录 `.env` 后执行 `docker compose up -d --no-deps web`，随后在 VS Code 中转发 `8086`，在自己的电脑浏览器打开端口面板显示的本地地址，通常为 `http://localhost:8086/`。

转发目标必须使用项目服务器实际监听的地址。例如 `WEB_HOST=192.168.1.203` 时，目标应为 `192.168.1.203:8086`；同一机器的 `127.0.0.1:8086` 没有监听，不能代替它。前端与 API 均为同源请求，只需转发网页端口。

若在 VPS 上连接项目服务器，在 VPS 执行（替换 SSH 用户和地址）：

```bash
ssh -NT -o ExitOnForwardFailure=yes -L 127.0.0.1:8086:192.168.1.203:8086 ssh_user@PROJECT_SSH_HOST
```

若从项目服务器连接 VPS，在项目服务器执行：

```bash
ssh -NT -o ExitOnForwardFailure=yes -R 127.0.0.1:8086:192.168.1.203:8086 ssh_user@VPS_SSH_HOST
```

两种方式均在 VPS 上访问 `http://127.0.0.1:8086/`。SSH 连接需保持运行，已有同端口隧道时先修改原隧道，避免端口冲突。`localhost` 指打开浏览器的机器；本地电脑的浏览器不能直接使用 VPS 的本地监听端口。`-L` 与 `-R` 的方向见 [OpenSSH 手册](https://man.openbsd.org/ssh)。

## 上游协议的验证边界

适配层集中在 `src/upstream/unicom.js` 与 `normalize.js`。2026-09-08 已用真实账号完成密码登录、官方图形验证、余量查询，速率和已订业务接口也返回成功。不同账号与省份仍可能存在差异，短信刷脸限制和 QCI 的推断规则见下文。

| 端点 | 状态 |
| --- | --- |
| `/mobileService/sendRadomNum.htm` | 本机显式直连得到 HTTP 200 和号码校验错误；真实短信发送待验证。 |
| `/mobileService/radomLogin.htm` | 本机显式直连得到 HTTP 200 和号码校验错误；真实验证码登录待验证。 |
| `/mobileService/login.htm` | 真实账号完成官方图形验证后返回 `code=0`，成功获取 Token 和 Cookie。 |
| `/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune` | 完整 Cookie 鉴权后返回 `0000` 和真实余量数据，已验证连续刷新。 |
| `/servicebusiness/query/fiveg/getbasicdata` | 返回 `0000`；签约速率位于 `rateResource.rate`，已观察到 `2Gbps` 并换算为 `2000Mbps`。 |
| `/servicebusiness/newOrdered/queryOrderRelationship` | 返回 `0000` 和 `data.serviceinfo` 业务列表；当前账号返回网络质量 VIP 业务，未直接返回 QCI 数字，页面据此推断为 `8（推断）`。 |

`data.serviceinfo` 的每条业务固定 12 个字段：`servicename`、`serviceid`、`servicestate`、`completedate`、`completedateFmt`、`productmode`、`productid`、`productname`、`packageid`、`packagename`、`discntvalue`、`ordermethod`。其中 `servicestate` 是数字串而非中文状态文案，在用业务恒为 `"1"`；`completedate` 形如 `20230301000000`，`completedateFmt` 形如 `2023-03-01 00:00:00`。`server/test/normalize.test.js` 的夹具照抄了这份字段形状。

短信与查询路径全部由 `UNICOM_*_PATH` 配置，默认值即上表实测通过的那几条。`login.htm` 用于密码登录，不能替代短信登录的 `radomLogin.htm`，两者不可互换。

登录与查询使用独立配置：`UNICOM_LOGIN_BASE_URL` 默认 `https://loginxhm.10010.com`，`UNICOM_BASE_URL` 默认 `https://m.client.10010.com`。登录域名、`login.htm` 路径与 `android@13.0000` 版本取自联通[官方下载指引](https://img.client.10010.com/dwguide/index.html)链接的 Android 13.0 客户端（APK MD5：`87F59B80533DB0953CA5DBC2FC48AC74`）。只进行了静态协议核对，未运行该客户端。

2026-09-08 实网定位：手机密码登录多传 `userType=01` 时返回 `code=4 / 请输入6位数字密码[7237]`；更换域名和版本参数未解决。移除该字段后，同一账号的九位混合密码请求进入 `ECS99999 / type=10` 官方图形验证。手机密码登录请求不再发送 `userType`，联通返回的验证上下文仍原样保留该字段。该结果只证明已进入验证流程，不能代替最终登录与查询验收。

同次联调还确认官方验证地址可能带有 `#` 路由参数。前后端按 HTTPS 来源和 `/loginRisk/index.html` 路径校验，保留原始查询和路由参数；禁止其他域名、路径及带 URL 凭证的地址，避免误将有效的图形验证提示为“必须使用 App”。

后续真实账号完成图形验证，登录返回 `code=0`，但仅携带单个 Token 的余量请求返回 `999999`。现在保留登录及验证重试过程中的 Cookie，随登录结果返回给浏览器；浏览器按账号保存并在三个查询请求中提交 `cookie`。Cookie 中的百分号编码保持原样，查询使用空表单和 Cookie 鉴权，不再向联通混入固定 `ecs_acc`。完整会话已通过三个查询接口及连续刷新验证。

查询失败不会自动删除账号。主余量查询要求重新登录时，同一凭证只提示一次并停止自动重试；速率或已订业务查询失败仅显示部分信息不可用。只有用户主动移除账号才删除其浏览器凭证。

### 余量响应的字段白名单

`/ocs_proxy/` 的上游响应里除了余量，还夹带副卡清单 `viceCardlist`（含副卡号码 `usernumber` 与加密的 `userMobile`）、带账号参数的跳转链接等内容。网关不整体透传这份响应，`normalizeOcs` 按固定字段清单逐条重建：顶层只放行 `packageName`；资源分组放行 `type`、`userResource`、`remainResource` 和 `details`；每条明细放行名称（`feePolicyName`、`addUpItemName`）、数量（`total`、`use`、`remain`、`usedPercent`）、类型标记（`limited`、`flowType`、`typemark`、`elemType`、`resourceType`、`realresourcetype`、`hide`）、有效期（`endDate`、`endDate1`、`endXsbDate`）和计费单元编号（`feePolicyId`、`addupItemCode`）。

只放行标量，嵌套的对象与数组连结构都不出网关，`viceCardlist` 因此整个消失。分组数、每组明细条数和单个字段长度都有上限；既没有名称也没有任何可读数量的明细在网关就被剔除。分组按下标对应流量、语音、短信，空分组保留占位，否则浏览器会错位。

`feePolicyId` 与 `addupItemCode` 必须放行，页面靠它们区分同名资源：`feePolicyId` 认的是**资费政策**而不是资源块，一份套餐会从同一个政策派生出套内额度、上月结转额度、附赠包等好几块，只按它去重会把后面几块整块吞掉。

### 速率与 QCI

`rateResource.rate` 是联通返回的签约速率，支持 Mbps/Gbps 等单位换算，不代表实时测速。`rateResource.mobile` 仅以脱敏形式返回。

一个账号可能同时挂着多个带速率的业务（基础上网业务再加一个 5G-A 提速包），所以页面上的「签约速率」取三类来源的最高值：`basicdata` 的签约速率、已订业务接口的 `max_net_mbps`，以及从在用业务名里解析出的下行峰值速率。解析只认带单位的数字，并且只取「下行」那一段，`下行峰值2Gbps上行峰值200Mbps` 得到 2000 而不是 200；`5G上网服务` 这类不带单位的名字得到 0。全部来源连同各自的数值挂在该数值的 `title` 上，可逐项核对。

网关只上报事实，不做推断。已订业务响应经 `normalizeQci` 整形后交给浏览器六项内容：联通若明确给出数字则输出 `qci_num`（无值时该字段不出现）、生效的 5G 网络服务质量业务列表 `network_quality_services`（VIP / VVIP）、是否取到业务清单 `has_service_list`、限速标志 `has_limit_service`、可用最高速率 `max_net_mbps`，以及在用业务清单 `services`。

`services` 按显式白名单逐条重建，只放行 `id`、`name`、`since`，外加业务名里写明下行速率时才追加的 `downlink_mbps`；`id` 不符合 `^[A-Za-z0-9_-]{1,32}$` 时置空，`name` 截断到 60 字符，清单最多 100 条。上游条目里的 `usernumber`（手机号）、`username`（姓名）以及 `packagename`、`productname` 等套餐与产品名称一律不出网关，`server/test/normalize.test.js` 会断言这些值不出现在返回给浏览器的结果里。

在用与否以 `servicestate` 判定：该字段是数字串时按白名单判定，只有 `"1"` 算在用；只有当它是中文状态文案时才回退到「失效 / 已退订 / 已取消 / 未生效 / 待生效 / 停用」的文案黑名单；上游压根没给这个字段时不擅自剔除，否则整张清单会被判死。早先的实现只有那份文案黑名单，拿中文去比一个数字串永远匹配不上，于是已退订的业务照样算在用 —— 一个已经退掉的 `5G网络服务质量VVIP` 会让页面继续显示 QCI 6。不在用的业务不进入 `services`，也不参与网络质量业务与限速业务的判断。

QCI 数值由浏览器的 `resolveQciLevel` 依据上述事实推断：生效 VVIP 记 6，生效 VIP 记 8，取到业务清单但两者都未订购记 9（3GPP 默认承载）。该映射已在真实联通号码上核对。推断值在界面标注为「推断」，例如 `8（推断）`；联通明确返回的 QCI 数字优先于推断，且不加标注；完全取不到业务清单时显示「未确认」，`/qci_proxy/` 本身失败时保持「—」。限速服务仍通过独立的 `50027` 服务标识识别。

签约速率不参与 QCI 判断，三类速率来源一视同仁。带宽上限与 QoS 等级在 5G 中是分开配置的参数（Session-AMBR 与 5QI/ARP，见 [3GPP TS 23.501 §5.7](https://www.etsi.org/deliver/etsi_TS/123500_123599/123501/18.11.00_60/ts_123501v181100p.pdf)），签约 2000Mbps 的下行同样可能是 QCI 8；业务名里解析出的速率同理，只进速率展示，不进 QCI 推断。这条独立性由 `server/test/normalize.test.js` 与 `tests/usage.test.js` 的用例守着。因此推断出的数值必须带「推断」标注，而不能当作联通直接上报的值展示。

手机号和短信验证码的 RSA PKCS#1 v1.5 加密、登录字段 `password`、短信返回字段 `rsp_code/rsp_desc`、在线凭证 `token_online` 参考了协议实现者发布的 [短信发送脚本](https://github.com/ChinaTelecomOperators/ChinaUnicom/releases/download/Prerelease-Alpha/10010_send_sms.js) 与 [短信登录脚本](https://github.com/ChinaTelecomOperators/ChinaUnicom/releases/download/Prerelease-Alpha/10010_sms_sign.js)。这些历史实现提供协议线索，真实账号测试才是当前可用性的依据；项目使用 Node 内置加密实现，不执行下载的脚本。

### 本机直连与短信实测

后端上游请求使用独立的 Node HTTP/HTTPS Agent，显式关闭环境代理。以下命令运行的是落盘脚本，可在配置了 `HTTP_PROXY`、`HTTPS_PROXY` 的终端中使用：

```bash
pnpm --filter unicom-server check:network
```

它不携带手机号、密码、验证码或 Token，只检查已知入口，输出 HTTP 状态、业务码、实际连接 IP 和 TLS 校验状态，不发送短信。

短信实测使用仅保存在本机的 `server/.env.probe`，权限设置为 `600`，内容如下。该文件已被 Git 和 Docker 构建忽略：

```dotenv
PHONE=本人联通手机号
SMS_CODE=
```

```bash
pnpm --filter unicom-server check:live status
pnpm --filter unicom-server check:live send
# 收到短信后填写 SMS_CODE，再执行：
pnpm --filter unicom-server check:live login
```

登录成功后脚本会在内存中使用取得的 Token 查询余量、基础信息和已订业务，输出脱敏结果，不打印或保存取得的完整 Token。测试用设备标识保存在 `.env.probe`，保证发送与登录一致。脚本不会自动反复发送短信，两次发送尝试至少间隔 60 秒。

如果联通返回图形验证要求，需要完成联通认可的验证流程；自建网关的可选腾讯验证码不能代替联通侧校验。

### ECS1502 与额外验证

实网联调已观察到短信发送阶段返回“当前账号登录需要密码校验[ECS1502]”，此时 HTTP 直连成功，但短信尚未发送。公开的[客户端校验分支参考](https://github.com/adolfmc/liantong/blob/main/sources/com/sinovatech/unicom/separatemodule/login/fengkong/LoginFilterUtil.java)显示，`ECS99999/ECS99998` 需要携带完整上下文进入上游给出的验证页面，取得 `resultToken` 后重试原请求。只忽略错误码或用本地验证码放行都不能完成该校验。

网关已补齐凭证加密的随机后缀以及短信请求的 `keyVersion/send_flag`、设备描述和短信登录的 `loginStyle`。`need_verification` 响应将联通原始校验类型与上下文交给固定的官方验证页，严格检查 iframe 消息的来源和窗口。取得官方 `resultToken` 后，后端复用原始请求密文重试；待恢复请求仅在内存中保留，五分钟有效，绑定手机号、设备和操作，最多 1000 条。

实网已观察到 `ECS1500 / type=4`。联通官方[人脸验证页面代码](https://img.client.10010.com/loginRisk/js/chunk-500f7482.388f2c77.js)调用 `faceV3Detect/FacePlusPlus` 原生能力，纯网页无法执行。界面对此明确提示需要官方 App，不会自动改成较弱的校验类型。短信、登录密码登录均支持联通提供的浏览器验证分支；真实账号通过情况仍以实网结果为准。

界面接受 8–20 位 App 登录密码，保留大小写和符号，完整加密后通过 `/mobileService/login.htm` 提交，不写入账号记录或日志。登录密码与旧六位服务密码不同，不能要求用户截短或改用六位数字。联通[官方登录页](https://uac.10010.com/portal/custLogin)已说明这项密码升级；真实账号是否能使用当前请求参数完成登录仍待验证。

图形验证由联通官方页面提供，该页面自行加载其所需的验证码资源，部署者无需配置腾讯验证码密钥。网关可选的腾讯云验证码是独立于联通验证的另一道闸，默认关闭。

日志记录实际请求的 `upstreamOrigin`、`reportedCode`、服务密码提示标识、密码/人脸验证标识和验证页静态路径，不记录 URL 参数值或验证凭证。

### 校准流程

在能连通 10010 的机器上抓真实响应：

```bash
ECS_TOKEN=<你的 token> pnpm --filter unicom-server probe > probe.txt
```

按输出调整两处：

- 路径不对 → 改 `.env` 里的 `UNICOM_*_PATH`，不用改代码。
- 字段名不对 → 根据已脱敏的实际响应修改 `normalize.js`；不要用空数组掩盖未知格式。

也可以设 `DEBUG_RAW=true`，三个查询接口会在响应里附带 `_raw` 原始报文。

探测脚本自动隐藏常见凭证字段、输入 Token 和字符串手机号，但不能识别所有个人信息，分享前仍需检查。`DEBUG_RAW` 是显式诊断选项，会向浏览器返回原始数据，正常使用保持关闭。

## 配置

见 `.env.example`。几个值得注意的：

- `ALLOWED_ORIGINS` — 默认只允许同源浏览器请求。跨域部署时填写自己的前端来源，例如 `https://panel.example.com`，多个来源用逗号分隔。后端会在执行请求前检查来源。命令行客户端无需 Origin，因此这不能代替身份认证。
- `TRUST_PROXY` — 默认不信任转发头；反向代理部署时填写可信代理 IP/CIDR 或跳数。Compose 已配置单层 nginx，并覆盖客户端提供的转发头。单层代理配置要求 API 只能由该代理访问。
- `ACCESS_TOKEN` — 可选的 API 共享密钥，经正文 `access_token` 提交；前端设置 `VITE_API_ACCESS_TOKEN` 同值。**VITE_ 变量会写入公开的 JS 文件，这不是站点密码。** 公网使用应在网页与 API 之前统一配置 VPN 或反向代理认证及 HTTPS。如果 TLS 在外层代理终止，请在 `ALLOWED_ORIGINS` 填写公网 HTTPS 来源。
- `CAPTCHA_ENABLED` — 默认关闭。开启时必须配置自己的应用 ID 和密钥，缺失会拒绝启动。后端在 `need_captcha` 响应里返回公开的应用 ID；无需重新构建前端。验证码结果绑定手机号和客户端 IP，只能使用一次，默认五分钟有效。票据走腾讯旧版校验接口 `https://ssl.captcha.qq.com/ticket/verify`，启用前需用自己的应用验证兼容性。
- `SMS_LIMIT_*`、`LOGIN_LIMIT_*`、`CAPTCHA_LIMIT_*` — 短信、登录及验证码校验的每小时请求上限。计数和待消费的验证结果仅存在进程内存中，设有容量上限；重启清空，不适合多副本共享限流。
- `UNICOM_TIMEOUT_MS` — 覆盖连接、响应头和完整正文，默认 15 秒；单次响应上限 2 MiB。错误 HTTP 状态与重定向不会被当作成功结果；凭证请求不会跟随重定向。

服务日志记录请求 ID、路由、操作类型、HTTP 状态、耗时、联通业务码、直连地址和响应字段结构，不记录请求正文、响应字段值、原始报文或凭证。响应头 `X-Request-ID` 可关联同一次请求的 `api.response` 与 `unicom.response` 日志。后端访问密钥错误会提示配置问题，不会让前端删除联通账号。

### 通过网页联调

部署后在网页选择“短信登录”或“密码登录”，输入对应信息即可，不需要填写 `.env.probe`。官方图形验证会在页面内显示。登录密码不会保存在账号列表中，登录请求结束或关闭窗口时会清除密码输入。遇到问题时记录页面提示及操作时间，然后查看：

```bash
docker compose logs --since 10m --timestamps api
```

日志没有账户凭证；`DEBUG_RAW` 保持关闭。Compose 为 API 日志配置了轮转，最多保留三个 10 MiB 文件。

## 测试

```bash
pnpm --filter unicom-server test
```

共 88 个用例，覆盖配置加载、端口校验、真实本地 HTTP 慢响应和错误状态、Cookie Token 提取、响应整形与两套字段白名单、业务清单的在用判定、业务名速率解析、限流、验证码绑定、来源检查与敏感日志；其中 `test/normalize.test.js` 一个文件就有 30 个用例，`test/routes.test.js` 有 23 个。

根目录 `pnpm test` 会连同前端的 158 个用例一并运行（合计 246 个），额外覆盖 Vite 开发代理、`localStorage` 读写、账号保留、余量与 QCI 归一化、签约速率的多来源取值、已订业务分组、到期分组的展示模型、登录流程、运营商验证、截图分享、滚动锁定、页头滚动表面与界面契约。测试不会发送真实短信。
