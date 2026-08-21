# Changelog

本文件记录 blindbox-dinner 的每个版本重要变更。

- 格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
- 版本号遵循 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)
- 自动发版：打 `vX.Y.Z` tag 即触发 [release.yml](./.github/workflows/release.yml) 生成 GitHub Release

## [Unreleased]

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

[Unreleased]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/microcjh/blindbox-dinner/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/microcjh/blindbox-dinner/releases/tag/v0.1.0
