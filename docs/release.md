# 版本与发布规范

> 「提交，测试，发布」的最后一环。版本可追溯，发布可灰度，回滚有路径。

## 1. 版本号（SemVer）

格式 `vX.Y.Z`：

- `X`（major）：不兼容的破坏性变更（如 API 契约、实名流程大改）。
- `Y`（minor）：向后兼容的新功能（如新增主题局、会员订阅）。
- `Z`（patch）：向后兼容的缺陷修复（如支付回调幂等修复）。

> 版本号由 CI 依据提交类型自动 bump（见 [commit-convention.md](./commit-convention.md)），无需手改。

## 2. 发布流程

```
develop ──▶ release/vX.Y.Z ──▶ 验收 ──▶ PR 合入 main ──▶ git tag vX.Y.Z
                                                            │
                                                            ▼
                                              GitHub Release（自动生成说明）
                                                            │
                                                            ▼
                                              微信开发者工具「上传」+ 提审/灰度
```

1. 从 `develop` 拉 `release/vX.Y.Z`，仅接受 release 阻断修复。
2. 跑真机验收清单（登录/支付/实名/求助/评价 全链路）。
3. release 合入 `main` 后，打 tag `vX.Y.Z`（CI 的 `release.yml` 监听 tag 自动建 GitHub Release）。
4. 在微信开发者工具上传体验版 → 内部体验码 → 提审 → 审核通过后**灰度 5%~10%** 观察 24h → 全量。

## 3. Changelog

- 遵循 [Keep a Changelog](https://keepachangelog.com/)：`Added / Fixed / Changed / Removed`。
- 由 `standard-version` 或 CI 依据 conventional commits 自动生成，不手写。
- 每条变更关联 PR / Issue 编号，便于溯源。

## 4. 灰度与回滚

- 新版本先放 **5%~10% 用户**，监控崩溃率（目标 < 0.1%）、支付转化率、北极星指标（月度成功匹配饭局数）。
- 异常飙升 → 微信后台「回退版本」或紧急 `hotfix` 走 fast track。
- `main` 上的 hotfix 必须打新 patch tag，禁止静默改线上。

## 5. 发布检查清单

- [ ] 所有 PR 已合入 release 分支，CI 全绿
- [ ] 真机验收签字
- [ ] tag 已打，GitHub Release 说明完整
- [ ] 隐私政策 / 类目资质在微信后台有效
- [ ] 监控告警（崩溃 / 支付失败率）已就位
