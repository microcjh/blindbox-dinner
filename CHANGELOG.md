# Changelog

本文件记录 blindbox-dinner 的每个版本重要变更。

- 格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
- 版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)
- 自动发版：打 `vX.Y.Z` tag 即触发 [release.yml](./.github/workflows/release.yml) 生成 GitHub Release

## [Unreleased]

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

[Unreleased]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/microcjh/blindbox-dinner/releases/tag/v0.1.0
