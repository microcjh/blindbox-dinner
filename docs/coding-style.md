# 小程序编码风格

> 微信小程序原生（WXML / WXSS / JS）+ 云函数（Node）。轻量、可读、守平台约束。

## 1. 通用

- 缩进 2 空格，UTF-8，末尾换行，无 BOM。
- 文件名小写下划线或中划线：`realname.js` / `event-detail.wxml`。
- 一个文件一个主对象（Page / Component / 云函数入口），职责单一。

## 2. JS / 云函数

- 用 `const` / `let`，禁用 `var`；async/await 替代回调嵌套。
- 回调式 `wx.*` API 统一 promisify（见 `utils/request.js`、`utils/auth.js`）。
- 云函数入口只用 `try/catch` 包裹，统一返回 `{ code, message, data }`，错误码见技术方案。
- 禁止把密钥、openid 明文打到日志；敏感数据（身份证）只存哈希。

## 3. WXML

- 数据绑定用 `{{ }}`，复杂表达式移到 `setData` 前算好。
- 列表用 `wx:for` + `wx:key`，禁止无 key 渲染。
- 事件绑定语义化：`bindtap` / `catchtap`（阻止冒泡用 catch）。
- 不用任何 DOM 操作（小程序双线程，无 document）。

## 4. WXSS

- 颜色用 `app.wxss` 里的 CSS 变量（`--primary` 等），不在页面硬编码十六进制。
- rpx 适配：设计稿 750rpx = 屏宽，组件间距以 4px 为基准（8/12/16 rpx 圆角约定）。
- 不写 `position: fixed` 全屏遮罩滥用；弹层用官方 `wx.showModal` / 自定义组件。
- 主包体积纪律：图片走 CDN（WebP），首屏图 ≤ 500KB，主包 ≤ 1.5MB。

## 5. setData 性能纪律

- 每次 `setData` 都跨 JS↔Native 桥，频率与 payload 要省。
- 合并多次更新为一次；只传视图需要的字段，不整对象丢回去。
- 大列表用纯数据字段（`data-*` / 不渲染字段）或虚拟列表。

## 6. 注释与文档

- 云函数、复杂算法（匹配、金额、校验位）必须有 JSDoc 简述「输入/输出/边界」。
- 对外接口变更同步更新 `docs/` 与技术方案，保持单一事实源。

## 7. 云函数响应约定（全仓统一）

所有云函数（无论独立函数还是 `api` 路由分发）统一返回如下结构，前端 `utils/request.js` 据此解析：

- 成功：`{ code: 0, message: 'ok', data: <payload> }`
- 失败：`{ code: <错误码>, message: '<人类可读文案>' }`

错误码语义（与技术方案 API 设计一致）：

| 错误码 | 含义 | 前端行为 |
|---|---|---|
| 400 | 参数错误 | Toast 提示文案 |
| 401 | 未登录 / 未授权 | 触发重登（若已注入 handler）后重试 |
| 402 | 未实名 | 引导去实名页 |
| 403 | 不满足条件 | Toast 提示 |
| 404 | 不存在 | Toast 提示 |
| 409 | 冲突（重复 / 名额满） | Toast 提示 |
| 429 | 限频 | Toast 提示 |
| 500 | 服务器 / 第三方异常 | Toast「稍后再试」 |
| 503 | 第三方不可用 | Toast 提示 |

> 云函数内部一律用 `try/catch` 包裹，禁止把异常原样抛到前端；敏感字段（身份证号、openid）只存哈希或留云端，不进 `data` 下发。

## 8. 登录态约定（前端，见 utils/auth.js）

前端登录态由 `utils/auth.js` 管理，storage 契约如下，云函数（task-011 `auth`）必须按此返回：

- storage key：
  - `token`：自定义登录态（由 `auth` 云函数签发，`request.js` 自动注入每次调用）
  - `user`：用户资料对象（JSON 序列化）
- `auth` 云函数 `action: 'login'` 的返回 `data` 结构必须为：
  ```json
  { "token": "<string>", "user": { "id": "<string>", "verified": false } }
  ```
  - `user.verified` 为布尔：实名完成后由 task-012 `verify` 云函数写库并回填，前端 `isVerified()` 据此判断。
  - 敏感字段（openid、手机号、身份证）**只存云端，不得下发进 `user`**，避免本地存储泄露。
- 登录/重登均为静默操作（`loading: false`），不弹全局 loading，由页面自行控制；登出 `logout()` 会清 storage 并清除 401 重登钩子。

## 9. 订阅消息约定（前端，见 utils/subscribe.js）

订阅消息授权由 `utils/subscribe.js` 封装，统一约束如下：

- 模板 ID 集中管理在 `subscribe.js` 的 `TEMPLATES` 常量（按场景：`enroll_success` / `match_success` / `meal_reminder` / `review_reminder` / `sos_alert`）。
  - 当前为占位串，需在「微信公众平台 → 功能 → 订阅消息 → 我的模板」申请真实模板 ID 后替换（形如 `wSxjJ...`）。
- **授权时机强约束**：必须在「用户点击手势」中调用 `requestSubscribe`（如报名后按钮回调），**禁止**在 `onLoad` / 定时器中自动触发，否则微信审核拒绝。
- 一次性订阅：用户授权后服务端仅 **7 天内**可发 1 条；社交类目无长期订阅权限。
- 前端只负责「请求授权 + 记录授权状态」，**发送**动作在云函数侧通过 `cloud.openapi.subscribeMessage.send` 完成（task-015 match / task-016 register 等触发）。
- 授权结果：`accept` 写入 granted 缓存；`reject` 不缓存；`ban`（errCode 20004）标记不再弹窗，需引导去设置页。
- 订阅失败**绝不可阻断主流程**（如报名成功但用户拒订阅，饭局照常），`requestSubscribe` 始终 `resolve` 不 `reject`。
- 登出时 `auth.logout()` 应一并 `subscribe.clearGranted()` 清授权缓存。

## 10. 组件约定（公共组件库，见 miniprogram/components）

- 组件统一放在 `miniprogram/components/<name>/`，每个组件一个目录，含 `.js` / `.json` / `.wxml` / `.wxss` 四件套，命名小写下划线（如 `ui-button/`、`bottom-bar/`）。
- 组件定义统一 `options: { addGlobalClass: true, styleIsolation: 'apply-shared' }`，保证 `app.wxss` 的品牌 token（CSS 变量）与页面工具类可在组件内生效；含多个具名插槽的组件（ui-card、empty）同时声明 `multipleSlots: true`。
- 颜色 / 圆角 / 间距一律引用 `app.wxss` 的 CSS 变量，写法 `var(--color-primary, #FF6B4A)`，**必须带回退值**——防止组件在隔离样式下因变量缺失而丢色。
- 交互状态（type / size / loading / disabled / block 等）由 `observers` 计算最终 class 字符串，不在 WXML 里写复杂表达式；`loading` 或 `disabled` 时必须拦截点击（`triggerEvent('tap')` 不触发），避免重复提交。
- 资源纪律：图标优先用 emoji（如 `empty` 的 🍽️）或字体图标，不引入图片资源以控主包体积；刘海屏安全区用 CSS `env(safe-area-inset-bottom)`（见 `bottom-bar`），不依赖 JS 读取系统信息，保持组件零副作用。
- 测试：组件逻辑单测在 Node 环境跑（见 `miniprogram/components/*test.js` + `__mocks__/harness.js`），mock `global.Component` / `global.wx`，覆盖 observer 计算、点击拦截、事件触发；`scripts/test-all.sh` 已纳入，CI 同款、与云函数单测共用闸门。

## 11. 数据库集合与索引约定（见 docs/database-schema.md）

- 集合统一放云开发文档数据库，命名用**复数**；逻辑外键用「字段存对方 `_id`」实现，查询靠 `where({ _id: db.command.in([...]) })` 批量取，**禁止文档库联表**。
- 初始化走 **`init-db` 云函数**（幂等）：集合已存在吞 `-502005`、索引已存在吞 `-502007`，可重复安全运行；索引定义集中在 `index.js` 的 `INDEXES` 常量，与 `docs/database-schema.md` 第 3 节保持一致。
- **唯一索引即业务约束**：`registrations.uniq_user_event` = 防一人重复报名；`payments.transaction_id` = 防支付重复入账；`users.openid` = 防重复账号。新增唯一索引前先确认历史数据不冲突。
- 复合索引字段顺序即查询顺序：`events.idx_city_district_time` 支持「城市→区→时间」筛选，查询条件必须**从左前缀**命中才能走索引。
- 所有集合 / 索引变更必须经 `init-db` 云函数落地，**禁止手动在控制台零散建索引**（易遗漏、不可追溯）；变更同步更新 `docs/database-schema.md`。

## 12. 云函数 db 公共模块约定（见 cloudfunctions/common/db.js）

- 所有业务云函数的数据库访问**统一 require `cloudfunctions/common/db.js`**，禁止在各云函数里重复拼 `.where().orderBy().skip().limit().field()`，避免散落与不一致。
- 查询一律用 `db.query(collectionName, { where, page, pageSize, orderBy, fields })`，返回 `{ code, message, data: { list, total } }`；`total` 由独立 `count()` 链算出，不受 `skip/limit` 影响。
- **分页**：`page` 从 1 起，`pageSize` 默认 20、上限 100（超界自动截断），内部换算 `skip=(page-1)*size`；前端列表场景必须传 `page` 而非一次性拉全量。
- **where 透传**：普通对象（如 `{ status: 'open' }`）与 `db.command`（如 `_.in([...])` / `_.gt(...)`）都直接透传，不做二次封装；复合条件在调用方拼好再传入。
- **字段裁剪**：`fields` 只回传必要字段（如列表只取 `city/district/time/status`），**敏感字段（id_card_hash/openid/face_token）严禁进入 `fields` 下发前端**，降传输体积同时满足隐私合规。
- `common` 是共享模块而非独立云函数：`scripts/test-all.sh` 只跑其单测、不 `npm install`（mock 内联），也不会被当作部署单元上传。

## 13. 种子数据约定（见 cloudfunctions/seed-restaurants）

- 种子数据集中放在云函数 `cloudfunctions/seed-restaurants/data.js`，与导入逻辑 `index.js` 分离，便于维护与代码审阅。
- 导入**幂等**：以 `name + address` 作为去重键（先 `query` 是否已存在，已存在则跳过），可重复运行不重复插入；返回统一结构 `{ code, message, data: { inserted, skipped, total } }`。
- 数据字段严格对齐集合 Schema（restaurants 为 `name/address/cuisine/avg_price/rating/lng/lat/verified`），坐标用真实经纬度，`verified` 默认 false；新增/修改种子需同步 `docs/database-schema.md`。
- 种子云函数**仅在首次部署或数据更新时手动触发一次**，不进日常业务流；`data.js` 顶部 `validate()` 校验条数与必填字段，单测覆盖幂等 / 去重 / 条数。

## 14. 登录态与令牌约定（见 cloudfunctions/auth + cloudfunctions/common/session）

- **身份来源权威是 `cloud.getWXContext().OPENID`**：云开发下 `wx.cloud.callFunction` 自动注入调用者 openid，**无需前端 code2Session 换 session_key**。`auth` 云函数 `action:'login'` 以 OPENID 为主键 find-or-create `users`；前端 `wx.login()` 的 `code` 仅兼容保留，不强制。
- **令牌走 `common/session.js`**：`signToken({openid, uid})` / `verifyToken(token)` 为 HMAC-SHA256 **无状态自描述令牌**（载荷含 `openid/uid/iat/exp`，TTL 7 天）。下游云函数（register/events/payment…）用 `verifyToken(event.token)` 取 `uid` 解析身份，或直接用 `wxContext.OPENID`（云开发恒可靠），二选一保持一致。
- **密钥**：生产必须配置云函数环境变量 `AUTH_TOKEN_SECRET`；未配置回退开发期常量，**仅本地/测试可用，严禁生产依赖回退值**。
- **公开档案脱敏**：`auth` 的 `toPublicProfile` 必须剔除 `id_card_hash / openid / face_token`，并将 `_id` 重命名为 `id` 下发（见 §7/§8）；`user.verified` 默认 false，实名完成后由 task-012 `verify` 云函数写库并回填，`utils/auth.js` 的 `isVerified()` 据此判定。
- **用户集合新增 `verified` 字段**（boolean，默认 false），已同步 `docs/database-schema.md`；`users.openid` 唯一索引（init-db 已建）即「一人一号」约束。

## 15. 实名认证约定（见 cloudfunctions/verify + common/crypto + common/faceverify）

- **强实名第二重：人脸核身**。`verify` 云函数 `action:'submit'` 负责把用户 `verified` 置 true，第二重护城河即「人脸核身通过」（`faceVerify` 返回 ok 才写库）；第一重「微信实名」由微信账号体系保证，第三重「双向评价黑名单」由 review/blacklist 负责。
- **身份证只存哈希**：`common/crypto.hashIdCard(idCard)` 用 HMAC-SHA256（密钥 `ID_CARD_HASH_SECRET`，回退 `AUTH_TOKEN_SECRET`）计算，**明文身份证绝不落库、绝不进 `data` 下发**；公开档案 `toPublicProfile` 已剔除 `id_card_hash`，前端 `user` 缓存中无身份证信息（见 §7/§8、PIPL 合规）。
- **人脸核身外部依赖必须 mock**：`common/faceverify.faceVerify(verifyResult)` 在未配置 `WX_FACE_VERIFY_RULE_ID` 时走本地格式校验（派生稳定 `face_token` 占位），**不发起真实腾讯云调用、不触发实名计费**（见 `docs/testing.md`）；生产真实 `CheckE证通` 接入留待 task-034（需安装 tencentcloud SDK 并配 `WX_FACE_VERIFY_RULE_ID`）。verify 云函数只依赖 `faceVerify()` 返回值，真实 SDK 接入不影响调用方。
- **错误码语义**：未登录 `401`、姓名/身份证/核身结果参数 `400`、人脸核身未通过 `403`、已实名重复提交 `409`（返回当前公开档案，不重复写库）、用户不存在 `404`、异常 `500`。前端 `isVerified()` 据 `user.verified` 判断，实名页据此跳转。
- **身份解析复用令牌**：`verify` 用 `verifyToken(event.token)` 取 `uid` 写 `users`；与 auth 一致，也可改用 `wxContext.OPENID`（云开发恒可靠），二选一保持一致。

## 16. 前端 services 业务层约定（见 miniprogram/services）

- **分层职责**：`utils/request.js` 只负责「统一云函数调用 + token 注入 + 错误码转文案」；`utils/auth.js` 负责「会话态存储 + 401 重登钩子」（被 `app.js` 全局依赖，页面不宜直接依赖其实现细节）；**页面/组件只依赖 `services/*`**，由 services 封装「调哪个云函数、成功后刷新哪部分缓存」等业务动作。
- **services 是云函数的 1:1 门面**：`services/auth.js` 封装 `auth` 云函数（`login/me/ensureSession` 等），`services/verify.js` 封装 `verify` 云函数（`startFaceVerify/submit`）。后续每个云函数（events/register/match/review/payment…）都应在这里有对应门面，页面不得自行 `callFunction` 裸调。
- **人脸核身在 services 内封装**：`verify.startFaceVerify({name,idCard})` 调 `wx.startFacialRecognitionVerify` 取 `verifyResult`；DevTools / 未配核身能力时返回 dev 占位结果（标记 `__dev`，**不触真实计费**），与 `common/faceverify` 的 mock 策略对齐（见 §15、task-034）。页面只关心「拿到 verifyResult 交给 submit」。
- **实名成功后刷新缓存**：`verify.submit` 在云函数返回后调用 `utils/auth.setUserInfo(user)` 把 `verified` 等公开档案写回本地，页面据此即时切换「已实名态」，无需额外 `me()` 拉取。
- **测试同范式**：`services/*test.js` 复用全局 `global.wx` mock（含 `cloud.callFunction` 队列 + `storage` 模拟），纯 Node 运行，`scripts/test-all.sh` 已纳入，与云函数/组件/工具层共用同一闸门；新增 services 必须带单测覆盖「成功写缓存 / 参数透传 / 业务错误不覆盖缓存」。

## 17. events 场次云函数约定（见 cloudfunctions/events）

- **列表默认只出可报名场次**：`list` 未显式传 `status` 时强制 `where.status = 'open'`，保证浏览页只见可报名场次；显式传 `status`（如 `closed`）则按传入，供后台/历史查看。
- **索引左前缀命中**：`list` 筛选条件按 `city → district → status` 从左往右拼，命中 `events.idx_city_district_time`（city, district, time）+ `events.idx_status`；城市为最左前缀，缺城市时仍可按 status 命中 `idx_status`。
- **详情关联餐厅不联表**：`detail` 取 `events` 后，按 `restaurant_id` 调 `getById('restaurants')` 单独取，**禁止文档库联表**；关联餐厅只下发 `name/cuisine/address/avg_price/rating/verified`，**绝不下发经纬度等内部字段**（见 §11 逻辑外键约定 + 隐私裁剪）。
- **发起场次强实名**：`create` 复用「强实名护城河」，仅 `verified=true` 用户可发起（未实名返回 `402` 引导去实名页）；参数校验 `capacity ∈ [1,6]`（每桌 ≤6，见 `database-schema`）、`time` 须晚于当前、`price > 0`；落库 `registered=0`、`status = cap>0 ? 'open' : 'full'`。
- **字段裁剪纪律**：`list` 只用 `fields` 回传列表所需字段（`_id/city/district/restaurant_id/time/price/capacity/registered/status`），events 本身无敏感字段，但遵循 §12 一致的裁剪风格；前端引用统一用 `id`（`_id` 重命名）。
- **错误码语义**：未登录 `401`、参数 `400`、未实名 `402`、不存在 `404`、异常 `500`；与 §7 统一错误码表一致。

## 18. register 报名云函数约定（见 cloudfunctions/register）

- **报名复用强实名护城河**：`register` / `unregister` 与 events `create` 一致，仅 `verified=true` 用户可操作（未实名返回 `402` 引导去实名页）；`my` 仅查询当前用户，同样需登录态（`401`）。
- **报名即锁座（pending 预留支付）**：`register` 落库 `registrations.status='pending'`，并 `events.registered + 1`；达容量（`registered >= capacity`）立即翻 `status='full'`。**`registered` 计所有未取消报名（含 pending）**，座位在报名时即预留，支付见后续 `payment` 任务（届时 pending→paid）。
- **一人一场次一条报名**：`registrations.uniq_user_event (user_id, event_id)` 唯一索引是 DB 级兜底；业务层先 `query` 预检「已报名」再插入，返回 `409`（避免依赖不同 SDK 版本的唯一键错误码解析）；唯一索引仍保留作并发防重双保险。
- **不可报名态一律 `409`**：场次 `status !== 'open'`、或 `registered >= capacity`（满员）均返回 `409`，文案区分「已满/已关闭/已报名」。
- **取消即减员 + 状态回滚**：`unregister` 删除 `registrations` 后 `events.registered - 1`；若此前为 `full` 且减员后有余位（`registered < capacity`）则回 `open`。**已支付报名（status='paid'）不允许在此取消**，返回 `409` 引导走退款流程（退款由 `payment` 任务处理）。
- **`my` 关联场次摘要不联表**：`my` 取当前用户 `registrations`（`orderBy created_at desc`）后，逐条 `getById('events')` 附 `_id/city/district/time/price/capacity/registered/status/restaurant_id` 摘要（单用户报名数受 `capacity≤6` 约束，N 次小查询可接受）；不下发明文身份证等敏感信息（registrations 本无敏感字段）。
- **错误码语义**：未登录 `401`、参数 `400`、未实名 `402`、场次不存在 `404`、冲突 `409`（已报名/已满/已支付）、异常 `500`；与 §7 统一错误码表一致。
- **数据访问统一走 `common/db`**：`register` 用 `query`（预检）/ `insert` / `update`（按 `_id` 增减 `registered`、翻 `status`）；`unregister` 用 `query`（查现存）/ `remove`（按 `where` 删除）/ `update`；`my` 用 `query` + `getById`。本文件不裸拼查询链。

## 19. 前端场次浏览/报名页面约定（见 miniprogram/pages/index + pages/event-detail + services/event）

- **列表进「场次」tab（index）**：tabBar 首个 tab 即场次列表，已在 `app.json` 注册；index 页负责 `events.list` 的公开浏览（区筛选 chips + 触底加载 + 下拉刷新），**列表为公开数据，不强制登录**，浏览态用 `skeleton` 骨架、`empty` 空态占位，控制首屏体积与流畅度。
- **详情独立页**：`pages/event-detail`（`app.json` 已注册路由）负责单场展示 + 报名；`onLoad(id)` 调 `eventService.getEvent`，展示城市/时间/价格/座位进度与关联餐厅（餐厅字段由云函数裁剪，前端只消费，不依赖坐标）。
- **报名态由 services 门面收敛**：`services/event.js` 是 events/register 云函数的 1:1 门面（见 §16），页面只调 `eventService.listEvents/getEvent/register/unregister/myRegistrations`，**不得裸调 `callFunction`**；`list/detail/my` 为浏览类用 `loading:false`（不盖全局 loading），`register/unregister` 为写操作走默认 loading。
- **报名前置分流在页面内做**：详情页 `onRegister` 顺序判断——未登录 `→ navigateTo login`、未实名 `→ navigateTo realname`、已报名/已满 `→ toast` 拦截；该分流依赖 `services/auth.isLoggedIn()/isVerified()`（见 §14/§16），不把登录态判断散落到 services/event 内部。
- **「我是否已报名」用 `myRegistrations` 推断**：详情页 `onShow`/`loadDetail` 后调 `eventService.myRegistrations()`，按 `event.id` 匹配当前场次，得出 `registered` 决定吸底按钮显示「立即报名」还是「取消报名」；推断失败（网络/未登录）不阻断浏览，保持 `registered=false`。
- **展示格式化走纯函数**：`utils/format.js` 的 `formatEventTime/formatPrice` 为无 wx 依赖纯函数，列表与详情共用，避免 WXML 内联运算、便于单测。

## 20. 支付约定（见 cloudfunctions/payment + common/pay + services/payment + pages/event-detail）

- **先报名后支付**：`register` 落 `registrations(pending)`，`payment.create` 仅对已存在的 pending 报名下单，`schema` 中 `registrations.status` 由 `pending→paid`（退款任务接 `refunded`）；金额来自 `events.price`（元，下单时 ×100 转分）。
- **支付结果以服务端通知为准**：`payment.notify`（即 `unifiedOrder` 指定的 `functionName='payment'`）落 `payments(paid)` + 翻转 `registrations(paid)`，`payments.transaction_id` 幂等（唯一索引）；客户端 `query` 仅作兜底轮询，正常不依赖。
- **真实商户号走环境变量**：`common/pay.isPayConfigured()` 读 `WXPAY_SUB_MCH_ID`；未配置时 `payment.create` 返回 `devStub` 占位（不触真实计费，与 faceverify dev 占位同范式），前端 `services/payment.pay()` 在 devStub 时直接 resolve，便于开发演示；真实配置（商户号/证书/APIv3 key）接入留独立任务。
- **前端门面收敛支付**：页面只调 `paymentService.createPrepay(eventId)` + `paymentService.pay(prepay)`（真实 prepay 调 `wx.requestPayment`，取消 resolve `{success:false,reason:'cancelled'}`），**不得裸调 `callFunction` 或 `wx.requestPayment`**；`createPrepay` 走默认 loading，`query` 用 `loading:false`。
- **详情页付费流程**：`event-detail.onRegister` 顺序——`register` →（price>0）`createPrepay`+`pay`；支付取消保留 pending（toast「待支付」并 `loadDetail` 刷新，不翻 paid）；付费成功 toast「报名并支付成功」。免费场次跳过支付直接成功。
- **退款前置**：`register.unregister` 对 `paid` 报名返回 `409`（提示走退款流程），退款由后续 refund 任务处理；支付链路与退款链路在 `payments/registrations` 状态机上解耦。

## 20.1 退款约定（见 cloudfunctions/refund + services/refund + pages/profile）

- **退款是 paid 态的专属闭环**：`refund.apply` 仅允许本人 `registrations.status==='paid'` 的报名退款；`pending`（未支付）应走 `unregister`（register 已 409 拦截），`refunded`（已退）幂等保护返回既有单，其他态返回 `409`「当前状态不可退款」。
- **必须有有效支付记录才退**：先 `query payments`（where `reg_id` + `status='paid'`）取 `transaction_id`；无支付记录或 `transaction_id` 缺失均返回 `409`（防止 notify 未落账就退款）；金额取 `payments.amount`（全额退，不分摊）。
- **真实退款走云支付退款 API**：`common/pay` 预留 `cloudPay.refund`（读 `WXPAY_SUB_MCH_ID`）；未配置商户号时 `refund.apply` 走 devStub 占位——直接标记 `refunds(success)` + 翻转 `registrations(refunded)`，不触真实计费（与 payment devStub 同范式）；真实路径下 `cloudPay.refund` 异步到账，此处简化标记 success（以退款通知为准留待后续）。
- **幂等与落库**：`refund.apply` 先查 `refunds`（where `reg_id`）已有单则直接返回 `{duplicated:true}`；新单落 `refunds(pending)` 后调退款，成功翻 `refunds(success)` + `registrations(refunded, refunded_at)`。`refunds` 集合在 schema 已定义，`registrations.status` 新增 `refunded` 终态。
- **前端门面收敛退款**：页面只调 `refundService.applyRefund(eventId)` + `queryRefund(regId)`，**不得裸调 `callFunction`**；`applyRefund` 走默认 loading（写操作），`queryRefund` 用 `loading:false`（浏览类）。
- **profile 退款入口**：`deriveMyRow` 增 `canRefund = price>0 && status==='paid'`；卡片底部对 paid 行显示「申请退款」按钮（`catchtap onRefund`），`onRefund` 先 `wx.showModal` 二次确认，再调 `applyRefund`，成功后 `loadMine` 刷新（状态翻 refunded 后该按钮自动隐藏，与 canPay 互斥）。

## 21. 我的报名页（profile tab，见 miniprogram/pages/profile + services/event.deriveMyRow）

- **profile 即「我的」tab，承载我的饭局列表**：原占位页（早期"紧急求助"模板）改造为 `eventService.myRegistrations()` 的消费页；导航栏标题由 `profile.json` 设为「我的」，列表为登录后私有数据。
- **派生纯函数收敛在 services**：`services/event.deriveMyRow(reg)` 把 `register.my` 的一条 `{status,event}` 派生为展示行（state: joined/unpaid、stateText、priceText、timeText、seatsText、canPay）；**页面不内联派生逻辑**，便于单测（见 event.test.js 第8~11项），列表只 `filter(cancelled).map(deriveMyRow)`。
- **付费态与继续支付**：`canPay = price>0 && status==='pending'` 时卡片底部显示「继续支付」按钮（`ui-button` 通栏 small），调 `paymentService.createPrepay + pay`（与详情页同源，devStub 直接成功）；支付成功后 `loadMine` 刷新（最终态由服务端 notify 异步翻转，列表短暂仍 unpaid 属预期）。`canRefund = price>0 && status==='paid'` 时显示「申请退款」按钮（见 §20.1），与 canPay 互斥。
- **未登录前置分流**：`onLoad/onShow` 经 `authService.isLoggedIn()` 判定；未登录显示 `ui-empty` 引导「去登录」（`navigateTo login`），不拉列表；`onShow` 用于从 login/realname 返回后刷新登录态与列表。
- **骨架/空态/下拉刷新**：列表区用 `ui-skeleton`（loading 时骨架，false 渲染插槽）；空列表 `ui-empty` 引导「去逛逛」（`switchTab` 到 `pages/index` —— tabBar 页必须用 switchTab，不能用 navigateTo）；`enablePullDownRefresh` 开启，下拉 `loadMine` 后 `stopPullDownRefresh`。
- **点击进详情**：卡片整卡 `bindtap goDetail` 带 `eventId` 进 `event-detail`；「继续支付」按钮用 `catchtap` 阻止冒泡（避免触发卡片跳转）。

## 22. 匹配凑桌约定（见 cloudfunctions/match + services/match）

- **凑桌以「已支付」为门槛**：`match.run` 只取某场次 `status=paid && matched!==true` 的报名凑桌（付费信任，与产品付费门槛一致），`pending`（待支付）报名不参与；开桌下限 4 人（`match_groups.members 4–6`，见 schema），不足 4 人返回 `409` 文案提示需满 4 人。
- **落库与防重复**：凑桌成功落 `match_groups`（event_id + members[] + matched_at），并 `update(registrations, {matched:true}, {_id:{$in:[...]}})` 标记成员报名已凑桌；`matched` 字段是「一人一桌一次」的业务兜底，`match.run` 查询已 `matched!==true` 排除，重复触发不会把同一人凑进第二桌。
- **错误码语义**：未登录 `401`、参数 `400`、场次不存在 `404`、人数不足/已凑满 `409`、异常 `500`；与 §7 统一错误码表一致。
- **前端门面收敛**：页面只调 `matchService.runMatch(eventId)` + `matchService.myMatches()`（见 §16），**不得裸调 `callFunction`**；`runMatch` 写操作走默认 loading，`myMatches` 浏览类 `loading:false`。通知类（订阅消息/饭局群）接入留独立任务，云函数内预留 `matched_at` 时间锚点供后续触发。
- **`myMatches` 列表态**：`match_groups.members` 数组含 uid 即视为「我的桌」，返回时逐条 `getById(events)` 附场次摘要（city/district/time/price/restaurant_id），不联表、不前移敏感字段。

## 23. 饭后双向评价 + 黑名单约定（见 cloudfunctions/review + cloudfunctions/blacklist + services/review + services/blacklist + pages/event-detail）

- **强实名第三重护城河**：评价与举报是「强实名（第一重微信 + 第二重人脸核身）」之后的**社交信任兜底**——只有真实约过饭、且被系统确认为同桌的人，才能互评/被举报；评价数据沉淀为「饭友信用」，黑名单沉淀为「风险隔离」。（见 §13/§15）
- **评价严格限定本桌**：`review.submit` 必须校验「评价者(from_uid) 与 被评者(to_uid) 同属一个 match_groups（同一 event_id 且 members 同时含双方）」，跨桌/陌生人无法评价，返回 `403`；唯一约束 `(from_uid,to_uid,event_id)` 防重复评价（`409`）；评分 `1–5`、不能评自己（`400`）；不下发任何敏感字段。
- **举报轻量沉淀**：`blacklist.report` 仅落 `reporter/target/reason/detail/status=pending`（待审），不即时封禁，避免误伤；`list` 同时返回「我举报的」与「关于我的」，供前端信任安全中心展示。
- **错误码语义**：评价 未登录 `401` / 参数 `400`（缺对象、评分越界、评自己）/ 非本桌 `403` / 场次不存在 `404` / 重复 `409` / 异常 `500`；举报 未登录 `401` / 参数 `400`（缺对象、缺原因、举报自己）/ 异常 `500`；与 §7 统一错误码表一致。
- **前端门面收敛**：页面只调 `reviewService.submitReview({eventId,toUid,score,tags,comment})` + `listReviews(eventId)`、`blacklistService.reportBlacklist({target,reason,detail})` + `listMyBlacklist()`（见 §16），**不得裸调 `callFunction`**；写操作（submit/report）走默认 loading，浏览类（list）`loading:false`。
- **入口设在详情页「饭后沉淀」区块**：仅当用户 `syncMyTable()` 命中本场（`myMatches` 的 `event_id === 当前场次`）即为本桌成员，显示本桌其他成员 + 「评价/举报」按钮；成员昵称用 `饭友 + uid 后4位` 占位（真实昵称留待用户档案任务）；评价弹层 1–5 星选择，举报弹层原因输入（maxlength 50，与云函数 `REASON_MAX` 对齐）。`getUid()` 由 `utils/auth` 新增（解析公开档案 `id`，即 `users._id` / token `uid`），用于从 members 过滤掉自己。
- **会话态基础能力补充**：`utils/auth.getUid()` / `services/auth.getUid()` 返回当前用户 uid，供需要从本地会话识别「我是谁」的场景（凑桌成员列表过滤、评价对象区分）。

## 24. 一键 SOS 约定（见 cloudfunctions/sos + services/sos + pages/event-detail）

- **饭局中安全兜底**：SOS 是「强实名 + 人脸核身 + 评价/黑名单」之后的**最后一道安全网**——任何已登录用户均可一键发起求助，覆盖「报名后到场前 / 到场中」的焦虑与真实危险场景；不强制「必须已凑桌」，最大化兜底覆盖面。
- **云函数 three actions**：`create`（落 `sos(status=pending)`，须关联 event_id 且场次存在，type 白名单 `unsafe/lost/medical/other`）/ `query`（按 id 浏览）/ `mine`（我的求助列表，按 created_at 降序）。错误码 未登录 `401` / 参数 `400`（缺 event_id、type 非法）/ 场次不存在 `404` / 异常 `500`。
- **前端门面收敛**：页面只调 `sosService.createSos({eventId,type,desc,location})` + `querySos(id)` + `mySos()`（见 §16），**不得裸调 `callFunction`**；写操作（createSos）走默认 loading，浏览类（querySos/mySos）`loading:false`。
- **入口设在详情页右上角固定浮标**：`pages/event-detail` 的 `.sos-fab` 浮标（红色圆形「SOS」），`onSos` 前置分流（未登录→login）/ 二次确认（`wx.showModal` 红字确认，防误触）/ `sosSending` 防重复点击；提交成功 `wx.showToast('已发出求助')`。真实处置联动（平台客服 / 线下）留 admin 任务，云函数内 `status=pending` 为处置锚点。

## 25. 管理端 admin 约定（见 cloudfunctions/admin + services/admin）

- **待处理锚点闭环**：review/blacklist 的 `status=pending`、sos 的 `status=pending` 是"待处理"锚点，由 admin 端消费——admin 是闭合「举报审核 + 求助处置」的最后一道管理链路，普通用户端不直接调用。
- **权限双校**：所有 action 先 `verifyToken` 拿 uid，再比对管理员白名单（env `ADMIN_UIDS` 逗号分隔，读不到回退本地常量 `['admin-u1']` 仅供 dev）。非管理员返回 `403`，生产必须配置 env `ADMIN_UIDS`。
- **四个 action**：`listReports`（查 blacklist.status=pending，分页）/ `handleReport`（decision=resolved|banned，须 pending 且存在，已处理 409）/ `listSos`（查 sos.status=pending）/ `handleSos`（标记 handled + 可选 note，须 pending 且存在）。错误码 401/403/400/404/409/500。
- **状态机**：blacklist `pending→resolved|banned`、sos `pending→handled`，处置时落 `handler`（管理员 uid）+ `handled_at` + `note`（≤500 字）；幂等靠"已处理则返回 409"防止重复翻转。
- **前端门面收敛**：页面只调 `adminService.listReports/handleReport/listSos/handleSos`（见 §16），**不得裸调 `callFunction`**；写操作默认 loading，浏览类 `loading:false`。管理端 UI 非 MVP 必需，门面 + 单测先行，真实审核台后续独立任务接入。

## 26. 问卷 + 同频匹配约定（见 cloudfunctions/questionnaire + cloudfunctions/match + services/questionnaire + pages/questionnaire）

- **盲盒核心卖点落地**：产品定位第一句即"填问卷→系统凑同频陌生人"，`questionnaires` 集合（task-008 预留）此前无写入链路、`match.run` 纯先到先得——本任务补上「问卷写入」+「凑桌同频优先」，让"盲盒同频"名副其实。
- **问卷云函数 `questionnaire`**：`submit`（须登录 + 强实名 402，复用 §15 护城河；按 `user_id` 唯一索引幂等 upsert，重复提交覆盖不落重复文档）+ `get`（查自己 full 维度 / 查他人仅公开维度 `diet_pref/taboo/budget/topics/personality`，隐藏 `expect` 个人期待）。错误码 401/402/400/404/409/500；字段裁剪只回传必要维度，不触敏感字段。
- **同频匹配算法（改造 `match.run`）**：凑桌前 `loadQuestionnaires` 批量读候选人公开维度 → 以首候选（先报者）为锚，按 `scorePair` 两两打分——`budget` 接近度 30% + `topics` 重合度（Jaccard）35% + `personality` 同频 20% + 无冲突 15%，`taboo` 互相命中则强惩罚（整体 ×0.6）。按分降序取前 `MIN_MEMBERS(4)` 人成一桌（上限 `MAX_MEMBERS(6)`）；**无问卷时回退纯先到先得**（保开桌下限不变）。落库 `match_groups.match_score`（两两均值，供前端"同频度"展示 / 后续调优）。
- **约束不变**：已支付门槛、4 人开桌下限、`matched` 防重复凑桌、幂等翻转，与 §22 完全一致；仅"选人策略"从"先到先得"升级为"同频优先"。
- **错误码语义**：问卷 未登录 401 / 未实名 402 / 参数 400（必填缺失·类型错·budget 越界）/ 不存在 404 / 异常 500；与 §7 统一错误码表一致。
- **前端门面收敛**：页面只调 `questionnaireService.submitQuestionnaire/getQuestionnaire/getPublicDimension`（见 §16），**不得裸调 `callFunction`**；`submitQuestionnaire` 写操作走默认 loading，`get*` 浏览类 `loading:false`。问卷页 `pages/questionnaire` 接通：表单（口味/性格/预算/忌口·话题·期待 chips 多选）+ 实名前置分流（未登录→login / 未实名→realname）+ 已填回显 + 提交后回退/回首页。

## §27 我的桌展示（task-025）
- **「我的桌」= 用户参与凑桌成功的 `match_groups`**：前端 `pages/profile` 已登录态下并行调用 `matchService.myMatches()`（浏览类 `loading:false`，见 §16/§22），与"我的饭局"（`eventService.myRegistrations`）双区块并列展示。
- **match_score 透出硬约束**：`cloudfunctions/match` 的 `MATCH_FIELDS` **必须含 `match_score`**（task-024 初版漏写导致 `myMatches` 查不到同频分，已修复并补单测断言）。落库与 `toMatchView` 均透传 `match_score`，任何"我的桌"展示依赖该字段时不得再从 `MATCH_FIELDS` 裁剪掉。
- **派生纯函数在前端做**：`profile.js` 的 `loadMyTables` 把 `myMatches` 每条 `{id,event,members,match_score}` 派生为展示行（`city/district/timeText/priceText/memberCount/matchScore/isMine`），不内联复杂逻辑；`timeText/priceText` 复用 `utils/format`（`formatEventTime`/`formatPrice`）。
- **展示维度**：卡片显示场次（城市·区/时间/价格）+ 同桌人数 + **同频分 match_score**（让用户感知"盲盒同频"依据）；点击进 `event-detail`。同频分仅作展示，不参与权限/状态判断。

## §28 订阅消息通知（task-026）
- **封装层 `cloudfunctions/common/subscribe.js`**：薄封装 `sendMatchSuccess({openid, event, members})`，消费环境变量 `SUBSCRIBE_TMPL_MATCH`（凑桌成功模板 ID）。**未配置走 dev 占位**（返回 `{sent:false, stub:true}`，不触真实发送，与 pay/faceverify dev 占位同范式）；配置后调 `cloud.openapi.subscribeMessage.send`。真实模板接入为独立任务（后台申请 + 配 env）。
- **触发点**：`cloudfunctions/match` 落桌成功后（标记 matched 之后）调 `notifyTable` —— 批量反查 members 的 `users.openid`（按 `_id $in` 查）并逐个发「凑桌成功」通知。**通知是增强能力：失败静默 catch，绝不阻断凑桌主流程**（错误码语义见 §7）。
- **前端 opt-in 时机**：`pages/event-detail` 在**报名/支付成功后**调 `matchService.requestMatchSubscribe()`（task-019 门面扩展，封装 `wx.requestSubscribeMessage`，模板 ID 用常量 `MATCH_SUBSCRIBE_TMPL_ID`）。这是微信订阅消息转化最高的时机（用户刚完成关键动作）；用户拒绝 → 返回 `{accepted:false}` 静默不阻断。注意：前端申请的 tmplId 须与后台申请的模板一致，否则 `requestSubscribeMessage` 报错（门面已 fail 兜底）。
- **字段映射**：订阅消息 data 用 `thing1`（饭局名）/ `time2`（时间）/ `number3`（同桌人数），跳转 `pages/profile/profile`（我的桌）。

## §29 同频分可解释性（task-027）
- **让"同频"可被用户感知**：产品核心卖点是"系统凑同频陌生人"，但 `match_score` 仅是桌级两两均值（匿名、不可归因到本人）。task-027 让「我的桌」能展示"你与这桌人为何同频"——`myMatches` 为每个桌计算"本人 vs 同桌其他成员"的个人同频分构成。
- **读时计算，不落库**：`match_breakdown`（四维：`budget` 预算接近度 / `topics` 话题重合度 / `personality` 性格契合度 / `taboo` 忌口无冲突度，均 0–100）+ `my_match_score`（个人同频总分 0–100）在 `handleMyMatches` 内由 `scorePairBreakdown` 现算（批量预取本人 + 同桌成员的问卷公开维度后取均值），**不新增存储字段**、不改动 `match_groups` schema；桌级 `match_score`（§27）仍照常透出作兜底展示。
- **字段语义**：`breakdown.taboo` 为**正向无冲突度**（100=同桌无人忌口冲突，60=存在忌口互相命中），与打分端 `tabooPenalty=0.4` 口径一致；四维均为 0–100 便于前端进度条直渲。
- **优先展示个人分**：前端 `profile.js` 的 `loadMyTables` 派生 `scoreValue`/`scoreLabel`——有 `match_breakdown` 时显示"我的同频分"+ 四维进度条，否则退回桌级"同频分"；本人无问卷（`myQ` 为空）时后端不返回 breakdown，前端仅展示 `match_score`（与 §27 行为一致）。
- **复用打分内核**：`scorePairBreakdown(qa,qb)` 返回 `{total, breakdown}`，`scorePair` 改为委托它仅取 `total`——保证"桌级 match_score"与 task-024 数值口径**完全一致**，不破坏既有单测。
