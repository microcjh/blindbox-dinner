# 盲盒约饭 · blindbox-dinner

> 北京专属的「强实名盲盒约饭」微信小程序 —— 用微信信任链把 6 个陌生人凑成一桌好饭。
> 本仓库是**项目主仓库**，同时沉淀团队标准化的 Git 研发规范。

## 仓库定位

- **产品**：微信小程序（原生 + 微信云开发 CloudBase），MVP 范围 = 实名 / 问卷匹配 / 报名支付 / 邀请破冰 / 评价黑名单 / 紧急求助。
- **规范库**：本仓库首批提交即沉淀团队 Git 开发标准（分支、提交、PR、测试、发布），供所有协作者遵循。

## 目录结构

```
blindbox-dinner/
├── miniprogram/          # 小程序前端（原生 WXML/WXSS/JS）
│   ├── pages/            # 页面：login / index / event-detail / questionnaire / invitation / sos / review / profile
│   ├── components/       # 公共组件
│   └── utils/            # request / auth / subscribe
├── cloudfunctions/       # 云函数（Node）：auth / verify / events / register / payment / match / review / blacklist / sos / admin
├── docs/                 # 团队研发规范（本仓库重点）
│   ├── git-workflow.md      # 分支模型与工作流
│   ├── commit-convention.md # 提交信息规范
│   ├── pull-request.md      # PR 规范与审查清单
│   ├── testing.md           # 测试规范
│   ├── release.md           # 版本与发布规范
│   └── coding-style.md      # 小程序编码风格
├── .github/              # CI / 模板 / CODEOWNERS
├── CONTRIBUTING.md       # 贡献入口
└── README.md
```

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/microcjh/blindbox-dinner.git
cd blindbox-dinner

# 2. 安装微信开发者工具，导入 miniprogram/ 目录
# 3. 开通云开发环境，配置 project.config.json 中的 envId
# 4. 在微信开发者工具内「上传并部署」云函数
```

## 研发规范入口

新同学请先读 [CONTRIBUTING.md](./CONTRIBUTING.md)，再按需在 `docs/` 查阅具体规范。

## 许可

内部项目，未开源授权前请勿外传代码与数据。
