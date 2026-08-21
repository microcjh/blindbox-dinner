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
