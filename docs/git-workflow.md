# Git 分支模型与工作流

> 目标：让多人协作可预测、可回滚、发布可追溯。所有协作者必须遵循。

## 1. 长期分支

| 分支 | 作用 | 保护规则 |
|------|------|----------|
| `main` | 生产环境对应代码，永远可发布 | 保护分支：禁止直接 push，必须 PR + 至少 1 人审批 + CI 通过 |
| `develop` | 集成分支，下个版本的功能汇总 | 保护分支：禁止直接 push，需 PR 合入 |

## 2. 临时分支（用完即删）

| 类型 | 命名 | 来源 | 合入 | 示例 |
|------|------|------|------|------|
| 功能 | `feature/<简短描述>` | develop | develop | `feature/realname-verify` |
| 发布 | `release/vX.Y.Z` | develop | main + develop | `release/v0.1.0` |
| 热修 | `hotfix/<问题描述>` | main | main + develop | `hotfix/pay-callback-idempotent` |
| 修复 | `fix/<问题描述>` | develop | develop | `fix/event-capacity-lock` |

> 命名小写中划线；功能分支从 `develop` 拉，禁止从 `main` 直接拉功能分支。

## 3. 标准流程（一次功能开发）

```
develop ──▶ feature/xxx ──▶ (PR) ──▶ develop
                                      │
develop ──▶ release/vX.Y.Z ──▶ (PR) ──▶ main ──▶ tag vX.Y.Z ──▶ 发布
                                      └──────────▶ develop (合回)
```

1. 从 `develop` 拉 `feature/xxx`，本地开发、自测。
2. 提交遵循 [commit-convention.md](./commit-convention.md)。
3. 推送远程，开 PR 到 `develop`，绑定对应 Issue。
4. CI 通过 + 至少 1 名 reviewer 审批后，**Squash Merge** 合入 develop。
5. 周期性从 `develop` 拉 `release/vX.Y.Z`，只修 release 阻断问题。
6. release 通过验收后，PR 合入 `main`，打 `vX.Y.Z` tag，触发发布流程（见 [release.md](./release.md)）。

## 4. 合并策略

- **默认 Squash Merge**：把 feature 的多条 commit 压成一条干净记录进 develop/main，保持主线线性。
- 禁止 `--no-ff` 普通 merge 堆积，禁止直接 push 到保护分支。
- 合入前必须 `rebase` 最新 `develop`，解决冲突本地化。

## 5. 分支清理

- 合入后 **24 小时内**删除远程 feature/release/hotfix 分支。
- 本地分支定期 `git fetch -p` 清理已删除的远程分支。

## 6. 回滚

- `main` 上发现问题：`hotfix/<问题>` 从 `main` 拉，修完合回 main + develop，打新 tag（如 `vX.Y.(Z+1)`）。
- 严禁在 `main` 上 `git revert` 后长期留半成品，hotfix 走正式流程。
