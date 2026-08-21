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
