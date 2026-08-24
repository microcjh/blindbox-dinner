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
