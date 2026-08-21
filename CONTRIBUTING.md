# 贡献指南（CONTRIBUTING）

欢迎参与「盲盒约饭」小程序开发。开始之前，请按顺序读完以下规范。

## 0. 前置

- 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
- 拥有本仓库写权限；没有请先提 Issue 申请。
- 本地装好 `git` 与（如需跑云函数测试）`node >= 20`。

## 1. 认领任务

- 看 [Issues](https://github.com/microcjh/blindbox-dinner/issues)，认领或新建任务。
- 任务粒度参考技术方案的任务拆解（如 `task-016: register 云函数`）。

## 2. 分支与开发

- 从 `develop` 拉 `feature/<描述>`（见 [docs/git-workflow.md](./docs/git-workflow.md)）。
- 写代码遵循 [docs/coding-style.md](./docs/coding-style.md)。
- 提交信息遵循 [docs/commit-convention.md](./docs/commit-convention.md)。

## 3. 自测

- 跑对应云函数/组件测试（见 [docs/testing.md](./docs/testing.md)）。
- 涉及支付/实名/求助的改动，**必须真机走查**。

## 4. 提 PR

- 开 PR 到 `develop`，填好模板（见 [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md)）。
- 等 CI 通过 + 至少 1 人审批（安全模块需 `@microcjh`）。
- Squash Merge，合入后删源分支。

## 5. 发布

- 由负责人从 `develop` 拉 `release/vX.Y.Z`，走 [docs/release.md](./docs/release.md) 流程。

## 6. 有问题？

- 规范不清楚 → 在 PR 里 @  reviewer 或在 Issue 提问。
- 发现规范本身不合理 → 提 PR 改 `docs/`，大家一起迭代规范。

> 规范也是代码，欢迎共建。
