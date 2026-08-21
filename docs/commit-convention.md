# 提交信息规范（Conventional Commits 中文版）

> 每条 commit 必须能被人和工具读懂。格式统一，便于自动生成 Changelog 与版本号。

## 格式

```
<type>(<scope>): <subject>

<body 可选>

<footer 可选>
```

- `type`：提交类型（见下表），**小写**。
- `scope`： affected 模块，如 `auth` / `pay` / `match` / `ui` / `docs`，**可省略**。
- `subject`：简短动宾短语，**不以句号结尾，不超过 50 字**，用中文。
- `body`：说明「为什么」，而非「改了什么」，可多行。
- `footer`：关联 `Issue`，如 `Closes #123`；或 `BREAKING CHANGE:`。

## Type 表

| type | 含义 | 是否触发版本号变化 |
|------|------|--------------------|
| `feat` | 新功能 | minor（次版本） |
| `fix` | 缺陷修复 | patch（修订） |
| `docs` | 仅文档变更 | 否 |
| `style` | 不影响逻辑的格式调整（空格/缩进/重命名） | 否 |
| `refactor` | 重构（非 feat 非 fix） | 否（除非行为变更） |
| `perf` | 性能优化 | 否（显著时可记） |
| `test` | 增删测试用例 | 否 |
| `build` | 构建/依赖/云函数配置变更 | 否 |
| `ci` | CI 配置变更 | 否 |
| `chore` | 其他杂项 | 否 |
| `revert` | 回滚某次提交 | 视回滚内容 |

> 破坏性变更（不兼容旧接口）在 footer 写 `BREAKING CHANGE: <说明>`，触发 **major** 版本。

## 示例

```
feat(pay): 微信支付下单接入并支持回调幂等

register 创建 pending 订单后由 payment 云函数调用 wxpay 下单，
回调按 transaction_id 去重，避免重复改 registrations.status。

Closes #42
```

```
fix(match): 修复人数不足时成桌锁冲突导致超卖

Closes #51
```

```
docs: 补充测试规范与覆盖率门槛
```

## 工具（可选）

- 提交校验：引入 `commitlint` + `@commitlint/config-conventional`，在 `commit-msg` 钩子拦截不合规提交。
- 自动版本：CI 依据 `feat/fix/BREAKING` 自动 bump 版本（见 [release.md](./release.md)）。
