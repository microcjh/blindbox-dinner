# 测试规范

> 「提交，测试，发布」三件套里，测试是质量闸门。没有测试覆盖的改动不准合入 `develop`。

## 1. 测试分层

| 层级 | 对象 | 工具 | 说明 |
|------|------|------|------|
| 单元测试 | 云函数纯逻辑（匹配算法、金额计算、身份证校验位、幂等键） | Jest | 不依赖微信运行时，mock 掉 `wx.cloud` / 数据库 |
| 集成测试 | 云函数 + 云数据库（本地用云开发「本地调试」或测试环境） | Jest + 云开发 Node SDK | 跑在独立的 `test` 环境，不污染生产数据 |
| 组件/页面测试 | 小程序组件渲染、事件 | miniprogram-simulate / jest | 关键组件（ui-button、进度卡）需覆盖 |
| 真机测试 | 登录、支付、人脸核身、订阅消息 | 微信开发者工具「真机预览」 | 必须在 iOS + Android 真机各验一次 |

## 2. 覆盖率门槛

- 云函数核心逻辑（auth/verify/register/payment/match/review/sos）行覆盖率 **≥ 80%**。
- 新增逻辑必须有对应单测，否则 PR 卡 CI。
- 支付、实名等外部依赖用 mock，不触发真实扣费 / 实名计费。

## 3. 本地怎么跑

```bash
# 云函数单测（以 payment 为例）
cd cloudfunctions/payment
npm install
npm test

# 全量（仓库根，遍历所有含 package.json 的云函数）
./scripts/test-all.sh
```

> 根目录 `scripts/test-all.sh` 会逐个进入含 `package.json` 的 `cloudfunctions/*` 跑 `npm ci && npm test`，CI 同款。

## 4. CI 中的测试

- 每次 PR 自动在 `.github/workflows/ci.yml` 跑全部云函数单测 + 组件测试。
- 任一测试失败 → PR 禁止合并，状态标红。
- 真机验收为**人工卡点**（release 前由负责人在真机走查清单上签字）。

## 5. 写测试的约定

- 测试文件命名 `*.test.js`，与源文件同目录。
- 测试名用「应当…」句式，如 `should reject when capacity is full`。
- 涉及时间/随机的用例用 `mockdate` / 固定种子，保证可重复。
- 异常分支必须测（见 PRD 异常全景：超卖、回调丢失、人脸翻拍、SOS 滥用等）。
