# 盲盒约饭 · blindbox-dinner

> 北京专属的「强实名盲盒约饭」微信小程序 —— 用微信信任链把 6 个陌生人凑成一桌好饭。
> 本仓库是**项目主仓库**，同时沉淀团队标准化的 Git 研发规范。

## 产品定位

一个人吃饭太冷清？想认识同频的人又怕踩雷？我们用地道的「盲盒 + 强实名」把北京独居青年凑成一桌：

- **盲盒匹配**：填一份口味 / 话题 / 预算问卷，系统把 6 个同频陌生人凑成一桌
- **强实名信任**：微信实名 + 人脸核身 + 双向评价黑名单，把骗子挡在门外
- **饭后沉淀**：饭局群 + 订阅消息，让一次约饭变成长期关系，而非「日抛」

## 特性

- 🍜 **精准口味匹配**：问卷驱动，拒绝「为啥连蔬菜都是甜的」式翻车
- 🛡️ **三重信任护城河**：微信实名 → 人脸核身 → 双向评价黑名单
- 💸 **透明付费**：单次门票 49–59 元（早鸟 39），餐费现场 AA，无隐藏消费
- 🆘 **紧急求助**：饭局中一键 SOS，双向确认 + 限频防骚扰
- 🔗 **微信原生裂变**：分享卡片 / 群入口 / 订阅消息，天然适合社交分发

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | 微信小程序原生（WXML / WXSS / JS） | 免框架、包体小、DevTools 一键预览 |
| 后端 | 微信云开发 CloudBase（云函数 Node） | 免服务器、免备案、免费额度覆盖 MVP |
| 数据库 | 云开发文档型数据库 | JSON 结构契合问卷 / 匹配数据 |
| 存储 | 云存储 | 头像 / 餐厅图 |
| 支付 | 微信支付（云函数内签名） | task-017 接入 |
| 实名 | 腾讯云人脸核身 | task-012 接入 |
| CI/CD | GitHub Actions | 云函数测试 + 文档检查 + tag 自动发版 |

> 环境：`cloud1-d5g7ys8ci9724c437`（上海 / 微信体验版）。详见 [docs/cloudbase-env.md](./docs/cloudbase-env.md)。

## 架构

```
┌─────────────┐     wx.cloud.callFunction     ┌──────────────┐
│  小程序前端   │ ───────────────────────────▶ │   云函数      │
│ (WXML/WXSS)  │                              │ (Node/CloudBase)│
└─────────────┘ ◀─────────────────────────── └──────┬───────┘
      │ 仅经云函数通信（不受白名单限制）              │
      │                                    ┌────────┴────────┐
      │                                    │ 云DB │ 云存储 │ 第三方API │
      └── 微信支付 / 订阅消息 / 人脸核身 ──▶ │(微信内网)        │
                                           └─────────────────┘
```

> 业务域名白名单在当前架构下**无需配置**，详见 [docs/domain-whitelist.md](./docs/domain-whitelist.md)。

## 目录结构

```
blindbox-dinner/
├── miniprogram/          # 小程序前端（原生 WXML/WXSS/JS）
│   ├── pages/            # 页面：login / index / event-detail / questionnaire / invitation / sos / review / profile
│   ├── components/       # 公共组件
│   └── utils/            # request / auth / subscribe
├── cloudfunctions/       # 云函数（Node）：quickstart / auth / verify / events / register / payment / match / review / blacklist / sos / admin
├── docs/                 # 团队研发规范 + 项目文档
│   ├── git-workflow.md      # 分支模型与工作流
│   ├── commit-convention.md # 提交信息规范
│   ├── pull-request.md      # PR 规范与审查清单
│   ├── testing.md           # 测试规范
│   ├── release.md           # 版本与发布规范
│   ├── coding-style.md      # 小程序编码风格
│   ├── cloudbase-env.md     # 云开发环境信息
│   └── domain-whitelist.md  # 业务域名白名单结论
├── .github/              # CI / 模板 / CODEOWNERS
├── LICENSE               # 开源协议（默认 MIT，可改）
├── CHANGELOG.md          # 版本变更记录
├── CONTRIBUTING.md       # 贡献入口
└── README.md
```

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/microcjh/blindbox-dinner.git
cd blindbox-dinner

# 2. 用微信开发者工具导入本仓库根目录（自动识别 miniprogram/ 与 cloudfunctions/）
# 3. 在「云开发」面板确认环境 cloud1-d5g7ys8ci9724c437 已激活
# 4. 右键 cloudfunctions/quickstart → 上传并部署（云端安装依赖）
# 5. DevTools 控制台执行以下命令验证环境联通：
#    wx.cloud.callFunction({ name: 'quickstart', data: { action: 'echo', payload: 'hi' } })
```

## 部署

> ⚠️ **关键前置**：共享模块 `cloudfunctions/common/` 必须作为 CloudBase「**公共模块**」上传一次，否则所有云函数云端 `require` 必崩（标准「上传并部署单个云函数」不会打包目录外的 common）。

1. **换真实 AppID**：`project.config.json` 的 `appid` 从 `touristappid` 改为你在 `mp.weixin.qq.com` 注册的小程序 AppID；`miniprogram/app.js` 的 `globalData.cloudEnv` 改为你账号下的云环境 ID（`cloud1-...` 为体验版环境，不可跨账号使用）。
2. **上传公共模块（最关键）**：云函数面板 → 「公共模块」→ 上传本地 `cloudfunctions/common` 目录（模块名取 `common`）。所有业务云函数用 `require('common/db')` 等裸模块写法，平台部署时自动注入 `node_modules/common`。**不要**对 `common` 单独「上传并部署」，也不要在业务云函数里用相对路径引用它。
3. **上传业务云函数**：对 `auth / register / verify / events / payment / refund / review / sos / admin / blacklist / match / questionnaire / seed-restaurants / init-db` 逐个右键 → 「上传并部署：云端安装依赖」。
4. **初始化数据库（首次）**：右键 `init-db` → 云端测试/触发 `main()` 建 12 个集合 + 索引（幂等，可重跑）；再右键 `seed-restaurants` → 触发灌入种子餐厅。
5. **选配**：人脸核身（`WX_FACE_VERIFY_RULE_ID`）、微信支付（商户号 / API 密钥）、订阅消息模板（配 `SUBSCRIBE_TMPL_MATCH`）——未配置时均走 dev 占位，不阻断主流程。
6. **验证联通**：DevTools 控制台 `wx.cloud.callFunction({ name: 'events', data: { action: 'list' } })` 返回 `{ code:0, data:{ list:[...] } }` 即成功。

本地单测：`bash scripts/test-all.sh`（会自动建 `cloudfunctions/node_modules/common` 软链，使 `require('common/X')` 本地可解析）。游客模式（`touristappid`）只能 DevTools 模拟器看 UI，云功能不可用。

## 研发规范入口

新同学请先读 [CONTRIBUTING.md](./CONTRIBUTING.md)，再按需在 `docs/` 查阅具体规范。
版本变更见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可

代码默认采用 **MIT 协议**（见 [LICENSE](./LICENSE)），允许自由使用、修改与再分发。
如你作为产品所有者不希望他人商用核心业务代码，可要求改为专有协议——只需替换 LICENSE 文件，不影响其他代码。
