# 业务域名白名单（task-003 结论）

> 原始 task-003 定义为「申请并配置业务域名白名单（HTTPS / uploadFile / downloadFile / WebSocket）」。
> 本文给出**在云开发架构下的正式结论**：当前阶段**无需配置**，并说明未来若切换架构时的登记清单。

## 结论：当前无需配置

本项目采用 **微信小程序原生 + 微信云开发（CloudBase）** 架构，数据链路为：

```
小程序前端 ──wx.cloud.callFunction──▶ 云函数 ──▶ 云数据库 / 云存储 / 第三方 API
```

关键事实（微信官方明确支持）：

| 调用方式 | 是否受「request 合法域名」白名单限制 | 原因 |
|---|---|---|
| 前端 `wx.cloud.callFunction` | ❌ 不受限 | 走微信/腾讯内网通道，不视为外网 HTTPS 请求 |
| 前端读取云存储文件（`cloud://` 协议） | ❌ 不受限 | 云存储 CDN 由微信内网调度 |
| 云函数内 `wx-server-sdk` 访问云数据库/存储 | ❌ 不受限 | 同 env 内网 |
| 云函数内 `https.request` 调第三方 API | ❌ 不受限（云函数有外网出口） | 白名单仅约束**小程序前端**的 `wx.request` |
| 前端 `wx.request` 直连自有/第三方 HTTPS | ✅ **受限** | 必须在微信后台登记域名 |

因此，只要前端**只通过云函数通信**，就不触发白名单校验。本项目的 MVP 与 v1.1 规划均满足此约束。

## 何时需要配置（未来触发条件）

出现以下任一情况时，才需在 **微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名** 登记：

1. **小程序前端直接 `wx.request` 到自有服务器**（例如未来切到独立后端、不经云函数）
2. **`wx.uploadFile` / `wx.downloadFile` 直传外部 CDN**（头像/图片不走云存储时）
3. **`wx.connectSocket` 直连外部 WebSocket**（实时聊天若不用云数据库 watch，而用自有 WS 服务）
4. **`web-view` 内嵌 H5 页**（需配置业务域名且做 ICP 备案校验）

## 未来若切自有服务器的登记清单（预置，暂不执行）

| 类型 | 域名示例 | 用途 |
|---|---|---|
| request 合法域名 | `https://api.blindbox-dinner.com` | 前端直连后端 API |
| uploadFile 合法域名 | `https://upload.blindbox-dinner.com` | 直传图片/头像 |
| downloadFile 合法域名 | `https://cdn.blindbox-dinner.com` | 下载文件 |
| socket 合法域名 | `wss://ws.blindbox-dinner.com` | 实时通信 |
| UDP 合法域名 | （一般无需） | 音视频通话场景 |

> ⚠️ 所有域名必须 **HTTPS + 已备案 + 证书有效**；微信后台不支持 IP 或 http。
> 登记前需先完成 ICP 备案（约 1~2 周），这是 task-034 合规上线的前置项之一。

## 当前动作

- [x] 确认云开发架构规避白名单需求（本文件即结论）
- [ ] 仅在「前端直连自有服务器」分支被启用时，再回来填写上表并登记
- [ ] task-034 合规上线前复评一次（是否仍纯云函数）
