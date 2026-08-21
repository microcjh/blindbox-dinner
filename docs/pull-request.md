# Pull Request 规范

> PR 是代码进入 `develop` / `main` 的唯一通道。质量靠 PR 卡住，而不是靠事后救火。

## 1. 开 PR 前自查

- [ ] 已从最新 `develop`（或 `main` 用于 hotfix）rebase，无冲突。
- [ ] 本地通过 [测试规范](./testing.md) 要求的测试。
- [ ] 提交信息遵循 [commit-convention.md](./commit-convention.md)。
- [ ] 关联了对应 Issue / 任务（如 `Closes #123`）。
- [ ] 无密钥、无 `.env`、无 `node_modules` 入库（见 `.gitignore`）。
- [ ] 小程序主包体积 ≤ 1.5MB（如涉及前端）。

## 2. PR 标题与描述

- 标题复用主要 commit 的 `type(scope): subject` 格式。
- 描述按模板填写（见 [PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md)）：
  - 变更目的
  - 改动点（列表）
  - 测试方式（如何验证）
  - 风险点 / 需 reviewer 重点看的地方

## 3. 审查（Code Review）

- **最少 1 名 reviewer** 审批；安全敏感模块（`verify` / `payment` / `sos`，见 CODEOWNERS）必须由 `@microcjh` 审批。
- Reviewer 关注：逻辑正确性、边界与异常、隐私合规、性能（setData 频率/包大小）、可维护性。
- 评论需具体（指明文件+行+建议），避免「这写得不对」式空话。
- 修改后重新请求 review，不要在未解决评论下强合。

## 4. 合并

- 通过 CI + 审批后，由**作者或审批人**执行 **Squash Merge**。
- 合入 `develop` 后删除源 feature 分支。
- `release/*` → `main` 的 PR 合入时**必须打 tag**（见 [release.md](./release.md)）。

## 5. 禁止事项

- 禁止直接 push 到 `main` / `develop`。
- 禁止 `force push` 到保护分支。
- 禁止把未自测的「WIP」PR 合并。
- 禁止在 PR 里夹带与主题无关的改动（拆分成多个 PR）。
