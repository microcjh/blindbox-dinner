# 数据库 Schema 与索引约定

> 云开发文档数据库（CloudBase Document DB）。本文件是 task-008 的权威依据，与 `cloudfunctions/init-db/index.js` 的 `COLLECTIONS` / `INDEXES` 常量保持一致。

## 1. 总约定

- **集合名用复数**（`users` / `events` / `reviews`），`_id` 由系统自动生成。
- **无硬外键**：逻辑外键用「字段存对方 `_id`」实现（如 `registrations.user_id → users._id`）。查询时先查主表，再 `db.collection().where({ _id: db.command.in([...]) })` 批量取，避免文档库联表。
- **初始化幂等**：集合 / 索引已存在时静默跳过，可重复运行 `init-db` 云函数。
- **唯一索引即业务约束**：如 `(user_id, event_id)` 唯一 → 一人一场次只能有一条报名；`transaction_id` 唯一 → 支付防重复入账。

## 2. 集合与字段

| 集合 | 字段 | 类型 | 约束 |
|---|---|---|---|
| **users** | _id, openid, phone, real_name, id_card_hash, face_token, gender, age, mbti, education, occupation, tags[], verified, status, created_at | string/int/array/bool | openid 唯一；id_card_hash 实名后必填；verified 默认 false（实名后由 verify 置 true） |
| **realname_verify** | _id, user_id, id_card_hash, face_score, verify_status, verify_time | string/float | user_id 唯一 |
| **questionnaires** | _id, user_id, diet_pref, taboo[], budget, topics[], personality, expect[], created_at | json/array | user_id 唯一 |
| **events** | _id, city, district, restaurant_id, time, price, capacity, registered, status | string/datetime/int | capacity≤6 |
| **match_groups** | _id, event_id, members[](user_id), match_score | array/json | members 4–6 |
| **registrations** | _id, user_id, event_id, status(pending/paid/refunded), paid_at | string/datetime | (user_id,event_id) 唯一 |
| **payments** | _id, reg_id, amount, status, transaction_id, created_at | string/decimal | transaction_id 唯一 |
| **restaurants** | _id, name, address, cuisine, avg_price, rating, lng, lat, verified | string/number | verified 默认 false |
| **reviews** | _id, event_id, from_uid, to_uid, score, tags[], comment, created_at | int/array | (from,to,event) 唯一 |
| **blacklist** | _id, reporter, target, reason, status, created_at | string | — |
| **sos** | _id, user_id, event_id, type, status, location, created_at, handled_at | string/json | — |
| **memberships** | _id, user_id, type, start, end, status | string/datetime | — |

## 3. 索引定义

| 集合 | 索引名 | 字段（顺序即复合索引顺序） | 唯一 |
|---|---|---|---|
| users | idx_openid | openid | 是 |
| users | idx_status | status | 否 |
| realname_verify | idx_user_id | user_id | 是 |
| questionnaires | idx_user_id | user_id | 是 |
| events | idx_city_district_time | city, district, time | 否 |
| events | idx_status | status | 否 |
| match_groups | idx_event_id | event_id | 否 |
| registrations | idx_user_id | user_id | 否 |
| registrations | idx_event_id | event_id | 否 |
| registrations | idx_status | status | 否 |
| registrations | uniq_user_event | user_id, event_id | 是 |
| payments | idx_reg_id | reg_id | 否 |
| payments | idx_transaction_id | transaction_id | 是 |
| restaurants | idx_cuisine | cuisine | 否 |
| restaurants | idx_verified | verified | 否 |
| reviews | idx_to_uid | to_uid | 否 |
| reviews | idx_event_id | event_id | 否 |
| reviews | uniq_from_to_event | from_uid, to_uid, event_id | 是 |
| blacklist | idx_target | target | 否 |
| blacklist | idx_status | status | 否 |
| sos | idx_user_id | user_id | 否 |
| sos | idx_status | status | 否 |
| memberships | idx_user_id | user_id | 否 |
| memberships | idx_status | status | 否 |

> 共 24 个索引。复合索引 `idx_city_district_time` 支持「按城市→区→时间」的场次列表筛选；`uniq_*` 系列为业务幂等 / 防重复约束。

## 4. 初始化方式

```bash
# 1. 部署 init-db 云函数（含 wx-server-sdk 依赖）
cd cloudfunctions/init-db && npm install && 上传并部署

# 2. 在云函数日志 / 本地调试中触发一次
wx.cloud.callFunction({ name: 'init-db' })
# 返回 { code:0, data:{ collections:[...12], indexes:[...24], summary:{ created, skipped } } }
```

**何时重跑**：新增集合 / 索引后，更新 `index.js` 的 `INDEXES` 常量并重新部署调用；已存在的集合 / 索引会被自动跳过。
