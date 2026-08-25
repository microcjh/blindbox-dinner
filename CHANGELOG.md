# Changelog

本文件记录 blindbox-dinner 的每个版本重要变更。

- 格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
- 版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)
- 自动发版：打 `vX.Y.Z` tag 即触发 [release.yml](./.github/workflows/release.yml) 生成 GitHub Release

## [Unreleased]

### Added
- **饭后双向评价云函数 `cloudfunctions/review`（task-020）**：`submit` 须登录 + 须为本桌成员（查 match_groups，members 同时含 from/to，跨桌返回 403）+ 唯一约束 (from,to,event) 防重复（409）+ 评分 1–5 / 不可评自己（400）；`list` 按 event_id 查该场次全部评价（浏览类）。错误码 401/400/403/404/409/500；复用 common/db + common/session，不下发敏感字段；15 项单测。
- **黑名单（举报）云函数 `cloudfunctions/blacklist`（task-020）**：`report` 须登录 + 落 blacklist(status=pending)（缺对象/缺原因/举报自己 400）；`list` 返回「我举报的 + 关于我的」；13 项单测。
- **前端业务门面** `miniprogram/services/review.js`（submitReview/listReviews）+ `blacklist.js`（reportBlacklist/listMyBlacklist），loading 语义对齐 §23；各 11/9 项单测，纳入 services/package.json 闸门。
- **详情页接通饭后沉淀**：`pages/event-detail` 新增「饭后沉淀」区块（仅当 `syncMyTable()` 命中本场即本桌成员时显示），列出同桌其他成员 + 评价/举报按钮；评价弹层 1–5 星、举报弹层原因输入（maxlength 50）；`utils/auth` 新增 `getUid()`（`services/auth` 同步暴露）用于从 members 过滤自己。
- `coding-style.md` 新增第 23 节「饭后双向评价 + 黑名单约定」；schema 中 reviews/blacklist 集合与索引（task-008 已预留）正式启用。
- **退款云函数 `cloudfunctions/refund`（task-021）**：`apply` 须登录 + 仅本人 `registrations.status==='paid'` 可退（`pending`/已退/其他态 409）；查 `payments` 取 `transaction_id`（无记录/无 transaction_id → 409）；落 `refunds` + 翻转 `registrations(refunded)`；幂等（已有退款单返回 `{duplicated:true}`）；未配置商户号走 devStub 占位（不触真实计费）。`query` 按 registration_id 查退款单（浏览类）。错误码 401/400/404/409/503；复用 common/db + common/session + common/pay；12 项单测。
- **前端业务门面** `miniprogram/services/refund.js`（applyRefund/queryRefund），loading 语义对齐；5 项单测，纳入 services/package.json 闸门。
- **profile 接通退款入口**：`deriveMyRow` 新增 `canRefund = price>0 && status==='paid'`（与 canPay 互斥）；`pages/profile` 对已支付卡片显示「申请退款」按钮（`onRefund` 二次确认 → `applyRefund` → 刷新）；`coding-style.md` 新增第 20.1 节退款约定。
- **一键 SOS 云函数 `cloudfunctions/sos`（task-022）**：`create` 须登录 + 关联 event_id 且场次存在（缺 event_id/type 非法 400、场次不存在 404）+ 落 `sos(status=pending)`（type 白名单 unsafe/lost/medical/other）；`query` 按 id 浏览、`mine` 我的求助列表（created_at 降序）。错误码 401/400/404/500；复用 common/db + common/session；20 项单测。
- **前端业务门面** `miniprogram/services/sos.js`（createSos/querySos/mySos），loading 语义对齐 §24；3 项单测，纳入 services/package.json 闸门。
- **详情页接通 SOS 浮标**：`pages/event-detail` 右上角红色圆形「SOS」浮标（`onSos` 前置分流未登录→login / 二次确认防误触 / `sosSending` 防重复）；`coding-style.md` 新增第 24 节 SOS 约定；schema 中 sos 集合与索引（task-008 已预留）正式启用。
- **管理端云函数 `cloudfunctions/admin`（task-023）**：闭合 review/blacklist/sos 的「待处理」锚点——`listReports`/`handleReport`（decision=resolved|banned，须 pending 且存在，已处理 409）/ `listSos`/`handleSos`（标记 handled + 可选 note）。权限双校（verifyToken + 管理员白名单 env `ADMIN_UIDS`，非管理员 403）；错误码 401/403/400/404/409/500；17 项单测。
- **前端管理端门面** `miniprogram/services/admin.js`（listReports/handleReport/listSos/handleSos），loading 语义对齐 §25；4 项单测，纳入 services/package.json 闸门。
- `coding-style.md` 新增第 25 节 admin 约定；schema 中 blacklist.status(pending/resolved/banned) / sos.status(pending/handled) 枚举正式补全。
- **问卷云函数 `cloudfunctions/questionnaire`（task-024 上）**：`submit` 须登录 + 强实名（402，复用 §15 护城河）+ 按 `user_id` 唯一索引幂等 upsert（重复提交覆盖不落重复文档）；`get` 查自己 full 维度 / 查他人仅公开维度（隐藏 `expect` 个人期待）。字段裁剪只回传必要维度，不触敏感字段；错误码 401/402/400/404/500；27 项单测。
- **匹配算法接入问卷（task-024 下）**：改造 `cloudfunctions/match` 的 `handleRun`——凑桌前批量读候选人问卷公开维度，以首候选为锚按 `scorePair`（budget 接近度 30% + topics Jaccard 重合度 35% + personality 同频 20% + 无冲突 15%，taboo 互相命中强惩罚 ×0.6）同频优先选人，取前 4 人成一桌（上限 6）；**无问卷时回退纯先到先得**（保开桌下限不变）。落库 `match_groups.match_score`（两两均值）供前端「同频度」展示；已支付门槛 / 4 人下限 / matched 防重复 / 幂等翻转约束与 §22 完全一致。新增 15 项单测（同频优先 / 回退 / taboo 冲突挤出），match 单测合计 32 项。
- **前端问卷门面 + 页接通（task-024）**：`miniprogram/services/questionnaire.js`（submitQuestionnaire/getQuestionnaire/getPublicDimension，loading 语义对齐 §16）+ 14 项单测，纳入 services/package.json 闸门；`pages/questionnaire` 由空壳接通（口味/性格/预算输入 + 忌口·话题·期待 chips 多选 + 实名前置分流 + 已填回显 + 提交回退/回首页）。
- `coding-style.md` 新增第 26 节「问卷 + 同频匹配约定」；schema 中 `questionnaires` 集合（task-008 预留）正式启用写入链路。
- **我的桌展示（task-025）**：`pages/profile` 已登录态并行接入 `matchService.myMatches()`，新增「我的桌」区块展示凑桌成功的同频饭局（场次城市·区 / 时间 / 价格 / 同桌人数 / **同频分 match_score**），与「我的饭局」双区块并列；卡片点击进 `event-detail`。`coding-style.md` 新增 §27。
- **修复：match_score 不返回（task-024 遗留）**：`cloudfunctions/match` 的 `MATCH_FIELDS` 漏写 `match_score`，导致 `myMatches` 查不到同频分；已补齐并补单测断言（myMatches 返回含 match_score），match 单测合计 33 项。
- **订阅消息通知（task-026）**：新增 `cloudfunctions/common/subscribe.js` 薄封装 `sendMatchSuccess`（消费 env `SUBSCRIBE_TMPL_MATCH`，未配走 dev 占位不触真实发送）；`cloudfunctions/match` 落桌成功后 `notifyTable` 反查 members 的 `users.openid` 逐个下发「凑桌成功」通知（失败静默不阻断主流程）；`services/match.js` 增 `requestMatchSubscribe`（封装 `wx.requestSubscribeMessage`，常量模板 ID），`pages/event-detail` 在报名/支付成功后申请授权（最佳 opt-in 时机）。coding-style §28 + match 单测合计 35 项（含订阅触发断言）。
- **同频分可解释性（task-027）**：`cloudfunctions/match` 的 `myMatches` 新增"个人同频分构成"——为每个桌计算"本人 vs 同桌其他成员"的 `my_match_score`（个人同频总分 0–100）+ `match_breakdown`（四维：budget 预算接近度 / topics 话题重合度 / personality 性格契合度 / taboo 忌口无冲突度，均 0–100）；**读时计算**（批量预取本人 + 同桌成员问卷公开维度后取均值），不落库、不改 `match_groups` schema，桌级 `match_score`（§27）仍兜底透出。打分内核重构为 `scorePairBreakdown`（返回 `{total, breakdown}`）+ 薄委托 `scorePair`，保证 `match_score` 口径与 task-024 完全一致；`breakdown.taboo` 为正向无冲突度（与 `tabooPenalty` 口径一致）。前端 `pages/profile`「我的桌」卡片展示"我的同频分"+ 四维进度条（无构成时退回桌级"同频分"）。`coding-style.md` 新增 §29；match 单测增 2 个可解释性场景（含本人无问卷兜底），合计 49 项。

## [0.1.14] - 2026-08-24

### Added
- **match 匹配凑桌云函数**（task-019）：`run` 把某场次已支付(paid)且未 matched 的报名凑成一桌（开桌下限 4 人），落 `match_groups` 并标记 `registrations.matched=true` 防重复凑桌；`myMatches` 查我参与的桌 + 关联场次摘要。
- **前端 match 门面** `services/match.js`（runMatch/myMatches）+ 8 项单测。
- coding-style 第22节（匹配凑桌约定）；database-schema 补 registrations.matched 字段。

## [0.1.13] - 2026-08-24

### Added
- **我的报名页（profile tab）**：把原"紧急求助"占位页改造为"我的饭局"列表，消费 `register.my` 接口
  - 列表展示城市/区、时间、价格、座位进度，按状态派生标签（已报名/待支付/已支付）
  - 付费 + 待支付项底部「继续支付」按钮，接入 `paymentService.createPrepay + pay`（与详情页同源，devStub 直接成功）
  - 未登录 → `ui-empty` 引导去登录；骨架/空态/下拉刷新；卡片点击进 `event-detail`
- `services/event.deriveMyRow(reg)` 纯函数：把报名记录派生为展示行，便于单测（event.test.js 第8~11项）

### Changed
- profile 导航栏标题由"紧急求助"改为"我的"

## [0.1.12] - 2026-08-24

### Added
- 支付云函数 `cloudfunctions/payment`（task-017）：`create` 统一下单（先报名后支付，仅对 pending 报名下单，金额来自 events.price×100 分）、`notify` 微信支付结果通知（落 payments(paid) + 翻转 registrations(paid)，transaction_id 幂等）、`query` 兜底查支付态；复用 common/db + common/pay（微信支付·云调用 cloudPay 薄封装）
- `cloudfunctions/common/pay.js`：isPayConfigured/unifiedOrder/resultNotification 薄封装；真实路径读环境变量 `WXPAY_SUB_MCH_ID`，未配置走 dev 占位（不触真实计费，与 faceverify dev 占位同范式）
- 前端支付业务门面 `miniprogram/services/payment.js`：createPrepay（调 payment.create 取 prepay）/ pay（devStub 直接 resolve，否则 wx.requestPayment，取消 resolve cancelled）/ queryStatus；页面只依赖门面，不裸调 callFunction 或 wx.requestPayment
- 详情页 `pages/event-detail` 接通付费：onRegister 顺序为 register →(price>0) createPrepay+pay；支付取消保留 pending（toast 待支付并刷新），付费成功 toast「报名并支付成功」，免费场次跳过支付
- 支付单测：`cloudfunctions/payment/test.js` 20 项（404/409/401/400/devStub/真实下单/notify 翻转/幂等/失败回传/query）；`miniprogram/services/payment.test.js` 12 项（createPrepay/pay 两种模式/queryStatus/防御）；services/package.json 纳入
- `coding-style.md` 新增第 20 节「支付约定」；`database-schema.md` 已含 payments 集合与 transaction_id 唯一索引（task-008 预留）

## [0.1.11] - 2026-08-24

### Added
- 前端业务服务门面 `miniprogram/services/event.js`：1:1 封装 `events`/`register` 云函数（task-014/015）——`listEvents`（公开浏览，默认 city=北京、status 走云函数默认 open）、`getEvent`（详情含关联餐厅）、`register`/`unregister`/`myRegistrations`；页面只依赖此门面，不裸调 `callFunction`（task-016）
- 纯展示格式化工具 `miniprogram/utils/format.js`：`formatEventTime`（ISO→`MM-DD HH:mm`）、`formatPrice`（`¥xx`），无 wx 依赖便于单测；列表与详情页共用
- 「场次」tab（`pages/index`）由占位改造为场次列表：区筛选 chips + 卡片列表（城市/时间/价格/座位进度）+ 下拉刷新 + 触底加载更多 + `skeleton`/`empty` 占位；点击进详情（task-016）
- 场次详情页 `pages/event-detail`（已注册路由）：展示城市/时间/价格/座位进度与关联餐厅（字段由云函数裁剪，前端只消费）+ 吸底报名条；`onRegister` 前置分流（未登录→login / 未实名→realname / 已报名·已满→toast 拦截），报名成功 `loadDetail` 刷新座位、按 `myRegistrations` 推断「已报名」态切换「取消报名」
- `event.js` 离线单测 `event.test.js` 18 项（mock wx）：覆盖 list/detail/register/unregister/my 的云函数名+action 分发、参数透传（含默认 city、event_id、token 自动注入）、成功解析、id 缺失边界；`services/package.json` test 脚本纳入 `event.test.js`
- `coding-style.md` 新增第 19 节「前端场次浏览/报名页面约定」

## [0.1.10] - 2026-08-24

### Added
- 报名（注册场次）云函数 `cloudfunctions/register`：`action:'register'`（令牌校验 + 强实名 402 + 场次存在 404 + 状态需 open/未满 409 + 唯一索引防重复 409 + 落库 status=pending + events.registered+1、满员翻 full）、`action:'unregister'`（取消报名减员、由 full 回 open、已支付 409 需走退款）、`action:'my'`（我的报名 + 关联场次摘要）（task-015）
- `register` 复用「强实名护城河」（未实名 402）；报名即锁座（pending 预留支付），`registered` 计所有未取消报名；一人一场次一条报名（DB 唯一索引 `(user_id,event_id)` + 业务预检双保险）；错误码 未登录 401 / 参数 400 / 未实名 402 / 不存在 404 / 冲突 409 / 异常 500
- `register` 单测 23 项（mock wx-server-sdk 链式 + 复用真实 common/db、common/session）：register 成功落库+registered+1+满员翻 full / 未登录 401 / 未实名 402 / 缺 event_id 400 / 不存在 404 / 已满 409 / 重复报名 409、unregister 成功减员 / 未报名 404 / 已支付 409、my 列表 + 关联场次摘要
- 修复 register/events mock 缺口：链式 `api` 补顶层 `remove()`（对齐 `common/db.remove` 的 `where` 分支 `collection.where(cond).remove()`）
- `coding-style.md` 新增第 18 节「register 报名云函数约定」

## [0.1.9] - 2026-08-24

### Added
- 场次（约饭局）云函数 `cloudfunctions/events`：`action:'list'`（按 `city/district/status` 筛选 + 分页，命中 `idx_city_district_time` 左前缀；**默认只出 `status=open`** 的可报名场次）、`action:'detail'`（取详情并关联餐厅基础信息，不联表按 `restaurant_id` 取）、`action:'create'`（发起场次，需登录 + 强实名，参数校验 `capacity≤6` / `time` 须未来 / `price>0`，落库 `registered=0` / `status=open`）（task-014）
- `list`/`detail` 统一走 `common/db`（query / getById），字段裁剪只回传必要字段；关联餐厅只下发名称/菜系/地址/均价/评分/认证状态，绝不下发经纬度等内部字段
- `create` 复用「强实名护城河」：仅 `verified=true` 用户可发起（未实名 402）；错误码 未登录 401 / 参数 400 / 未实名 402 / 不存在 404 / 异常 500
- `events` 单测（mock wx-server-sdk + 复用真实 common/db、common/session）：覆盖 list 默认 open / 城市过滤 / status 过滤 / 分页、detail 关联餐厅 / 缺 id 400 / 不存在 404、create 成功 / 未登录 401 / 未实名 402 / 非法·过去时间 400 / 容量 >6 400 / 票价 0 400
- `coding-style.md` 新增第 17 节「events 场次云函数约定」

## [0.1.8] - 2026-08-24

### Added
- 前端业务服务层 `miniprogram/services/`：`auth.js`（登录态门面，含 `me()` 刷新公开档案、`ensureSession()`）+ `verify.js`（封装人脸核身 `startFaceVerify` 与实名提交 `submit`），作为页面与云函数之间的 1:1 门面（task-013）
- `verify.submit` 成功后自动刷新本地会话缓存（`utils/auth.setUserInfo`），实名页即时切换「已实名态」
- `verify.startFaceVerify` 封装 `wx.startFacialRecognitionVerify`；DevTools / 未配核身能力时返回 dev 占位结果（标记 `__dev`，不触真实计费），与 `common/faceverify` 的 mock 策略对齐
- `realname` 实名页接通：填写姓名+身份证 → 人脸核身 → 提交，成功 `reLaunch` 到「我的」；已实名进入「已通过」态
- `login` 登录页接通：微信一键登录 → 按 `isVerified()` 分流（已实名进首页 / 未实名进实名页）；已登录且已实名自动跳过
- `services` 单测（`verify.test.js` 13 项 + `auth.test.js` 6 项）：覆盖 核身 dev 占位 / 真机透传 / 提交成功写缓存 / 参数透传 / 业务错误不覆盖缓存 / `me()` 刷新
- `scripts/test-all.sh` 纳入 `miniprogram/services` 扫描；`coding-style.md` 新增第 16 节「前端 services 业务层约定」

### Added
- 实名认证云函数 `cloudfunctions/verify`：`action:'submit'` 校验 姓名 + 身份证 + 人脸核身结果，核身通过则回填 `users.verified/real_name/id_card_hash/face_token`，完成「强实名」第二重护城河（task-012）
- 身份证脱敏哈希模块 `cloudfunctions/common/crypto.js`：`isValidIdCard`（18 位格式）+ `hashIdCard`（HMAC-SHA256，密钥 `ID_CARD_HASH_SECRET` 回退 `AUTH_TOKEN_SECRET`），明文身份证只存哈希不落库（PIPL 合规）
- 人脸核身封装 `cloudfunctions/common/faceverify.js`：`faceVerify(verifyResult)` 未配 `WX_FACE_VERIFY_RULE_ID` 走本地格式校验（不触真实计费，testing.md 约定），生产 `CheckE证通` 真实接入留待 task-034
- `verify` 错误码：未登录 401 / 参数 400 / 核身未过 403 / 已实名 409 / 不存在 404 / 异常 500；重复实名不重复写库
- `verify` 单测（mock wx-server-sdk + 复用真实 common 模块）：覆盖 未登录401 / 已实名409 / 姓名·身份证·缺核身400 / 核身失败403 / 实名成功回填+脱敏 / crypto+faceverify 单元
- `coding-style.md` 新增第 15 节「实名认证约定」

## [0.1.6] - 2026-08-22

### Added
- 登录与身份云函数 `cloudfunctions/auth`：`action:'login'`（按 `wxContext.OPENID` find-or-create `users` 集合，签发令牌，返回 `{token,user,isNew}`）、`action:'me'`（校验令牌返回公开档案），闭合登录链路（前端 `utils/auth.js` 已就绪，待后端首落地）
- 共享令牌模块 `cloudfunctions/common/session.js`：`signToken/verifyToken`（HMAC-SHA256 无状态自描述令牌，TTL 7 天，密钥取自 `AUTH_TOKEN_SECRET` 环境变量，未配回退开发常量）；供 auth 及下游云函数（register/events/payment…）复用，离线可验身份
- 公开档案脱敏：`toPublicProfile` 剔除 `id_card_hash/openid/face_token`、`_id→id`，满足隐私合规（`user.verified` 默认 false，实名后由 task-012 回填）
- `auth` 单测（mock wx-server-sdk + 复用真实 common/db、common/session）：覆盖首次建用户 / 二次复用 / OPENID 缺失 401 / me 合法·非法·过期·无记录 / 公开档案脱敏 / 令牌签名校验往返
- `coding-style.md` 新增第 14 节「登录态与令牌约定」；`docs/database-schema.md` 的 `users` 集合增补 `verified` 字段（默认 false，与 §8 登录态约定一致）

## [0.1.5] - 2026-08-22

### Added
- 餐厅库种子数据云函数 `cloudfunctions/seed-restaurants`：幂等导入 27 家北京探店餐厅（覆盖京菜/烤鸭/川菜/火锅/日料/西餐/粤菜/闽菜/云南菜/杭帮菜/湘菜/小吃多菜系），字段严格对齐 `restaurants` 集合（name/address/cuisine/avg_price/rating/lng/lat/verified）
- 导入逻辑（index.js）以 `name + address` 去重键幂等写入（已存在跳过），复用 `common/db` 的 `query/insert`，返回 `{ code, message, data: { inserted, skipped, total } }`
- 种子数据（data.js）与导入逻辑分离；`validate()` 校验条数与必填字段；单测覆盖首次插入 / 二次全跳过（幂等）/ 去重键 / 字段完整
- `coding-style.md` 新增第 13 节「种子数据约定」（集中存放 / 幂等去重键 / 字段对齐 Schema / 仅手动触发一次）

## [0.1.4] - 2026-08-21

### Added
- 云函数侧 db 公共模块 `cloudfunctions/common/db.js`：统一封装 `query({where,page,pageSize,orderBy,fields})` 返回 `{list,total}`（total 由独立 count 链算出）+ `getById/insert/update/remove` 基础 CRUD
- `query` 支持：分页自动换算 skip/limit（pageSize 默认 20 上限 100）、单组/多组 orderBy、fields 字段裁剪、`where` 普通对象与 `db.command`（_.in/_.gt 等）透传
- `common` 单测（mock wx-server-sdk 链式 db）：覆盖分页换算、where 透传、排序、字段裁剪、CRUD；`scripts/test-all.sh` 已纳入（共享模块只跑测试、不 install）
- `coding-style.md` 新增第 12 节「云函数 db 公共模块约定」（统一走 common/db、字段裁剪降传输、敏感字段禁下发）

## [0.1.3] - 2026-08-21

### Added
- 数据库初始化云函数 `cloudfunctions/init-db`：幂等创建 12 个集合（users / realname_verify / questionnaires / events / match_groups / registrations / payments / restaurants / reviews / blacklist / sos / memberships）并按技术方案建 24 个索引（含唯一索引防重复约束）
- 新增 `docs/database-schema.md`：12 集合字段 + 24 索引定义权威表（与 init-db 的 `INDEXES` 常量一致）
- `init-db` 云函数单测（mock wx-server-sdk）：覆盖首次创建、幂等跳过、索引数量与唯一约束；已纳入 `scripts/test-all.sh`

### Changed
- `docs/coding-style.md` 新增第 11 节「数据库集合与索引约定」（复数命名 / 逻辑外键 / 幂等初始化 / 唯一索引即业务约束 / 复合索引前缀命中）

## [0.1.2] - 2026-08-21

### Added
- 公共组件库 `miniprogram/components`：`ui-button`（类型/尺寸/加载/禁用/通栏/圆角/open-type 透传）、`ui-card`（标题/副标题/header/footer 插槽）、`ui-tag`（类型/描边/可关闭）、`empty`（空状态占位）、`skeleton`（加载骨架屏）、`bottom-bar`（吸底操作条 + 安全区适配）
- 组件离线单测（Node 环境，mock 微信运行时）：`__mocks__/harness.js` + 6 个 `*test.js`，覆盖 observer 计算、点击拦截、事件触发；`scripts/test-all.sh` 已纳入组件测试

### Changed
- `docs/coding-style.md` 新增第 10 节「组件约定」（命名 / 插槽 / styleIsolation / 品牌 token 回退 / 安全区适配 / 测试）

## [0.1.1] - 2026-08-21

### Added
- 注册微信云开发环境 `cloud1-d5g7ys8ci9724c437`（上海 / 微信体验版套餐）
- 新增首个云函数 `cloudfunctions/quickstart`（支持 `ping` / `echo` / `sum` / `whoami`），用于环境联通验证
- 新增 `docs/cloudbase-env.md`：环境信息、套餐能力、必备环境变量清单、升级迁移清单

### Fixed
- 修复 CI：`scripts/test-all.sh` 兼容无 lock 场景（`npm ci` ↔ `npm install` 优雅降级）
- 修正 `.gitignore`：云函数 `package-lock.json` 改为入库，保证 CI 用 `npm ci` 可重现

## [0.1.0] - 2026-08-21

### Added
- 初始化仓库，沉淀团队 Git 研发规范（分支模型 / 提交规范 / PR / 测试 / 发布 / 编码风格）
- 小程序项目骨架：9 个页面路由、tabBar（场次 / 我的）、window、定位权限声明
- 全局品牌设计 token（珊瑚橙 `#FF6B4A` / 神秘紫 `#7C5CFC` / 信任绿 `#16B981` + 4px 间距 / 8·12·16 圆角）
- CI 工作流（`ci.yml` 云函数测试 + 文档检查）、PR 模板、CODEOWNERS、CONTRIBUTING

[Unreleased]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.10...HEAD
[0.1.11]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.10...v0.1.11
[0.1.2]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/microcjh/blindbox-dinner/releases/tag/v0.1.0
