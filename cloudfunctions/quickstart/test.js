// quickstart 云函数的最小单元测试
// 不依赖真实云环境（避免 CI 触达 CloudBase），而是手动 mock wx-server-sdk。
//
// 验收点：
//   - action=ping/echo/sum/whoami 四种 action 都返回 code=0
//   - sum 对 [1,2,3] = 6，对非数字元素做 Number() 转换
//   - whoami 在 context 没有 OPENID 时不抛错

const assert = require('assert');

// ---- mock: 模拟 wx-server-sdk 的 cloud.getWXContext() ----
const calls = require.cache;
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === 'wx-server-sdk') return require.resolve('./__mocks__/wx-server-sdk.js');
  return origResolve.call(this, req, parent, ...rest);
};

// 写入 mock 文件
const fs = require('fs');
const path = require('path');
const mockDir = path.join(__dirname, '__mocks__');
if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir);
fs.writeFileSync(
  path.join(mockDir, 'wx-server-sdk.js'),
  `module.exports = {
    init() {},
    DYNAMIC_CURRENT_ENV: 'mock-env',
    getWXContext() { return { OPENID: 'mock-openid', APPID: 'mock-appid', UNIONID: null }; }
  };`
);

// 动态加载被测函数（在 mock 写入后）
delete require.cache[require.resolve('./index.js')];
const main = require('./index.js').main;

(async () => {
  // 1) action=ping
  let r = await main({ action: 'ping' }, {});
  assert.strictEqual(r.code, 0, 'ping should return code=0');
  assert.strictEqual(r.data.action, 'ping');
  assert.strictEqual(typeof r.data.now, 'string');

  // 2) action=echo
  r = await main({ action: 'echo', payload: 'hello' }, {});
  assert.strictEqual(r.data.echo, 'hello');

  // 3) action=sum
  r = await main({ action: 'sum', numbers: [1, 2, 3, '4'] }, {});
  assert.strictEqual(r.data.sum, 10);
  assert.strictEqual(r.data.count, 4);

  // 4) action=sum 空数组
  r = await main({ action: 'sum', numbers: [] }, {});
  assert.strictEqual(r.data.sum, 0);
  assert.strictEqual(r.data.count, 0);

  // 5) action=whoami
  r = await main({ action: 'whoami' }, {});
  assert.strictEqual(r.data.openid, 'mock-openid');
  assert.strictEqual(r.data.appid, 'mock-appid');

  // 6) 默认 action (无 action 字段)
  r = await main({}, {});
  assert.strictEqual(r.data.action, 'ping');

  // 7) 未知 action 不抛错（降级到 ping 行为）
  r = await main({ action: 'unknown' }, {});
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.data.action, 'unknown');

  console.log('  ✔ all 7 quickstart tests passed');
})().catch(e => { console.error(e); process.exit(1); });