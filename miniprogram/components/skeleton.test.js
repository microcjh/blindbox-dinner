/**
 * skeleton.test.js — skeleton 离线单测(Node 环境，无微信 SDK)
 * 覆盖：rows observer 生成 rowArray、loading 默认态、lastRowWidth 生效。
 */
const assert = require('assert');
const { loadComponent, createInstance } = require('./__mocks__/harness');

function run() {
  let pass = 0;
  const ok = (name) => { pass += 1; console.log('  ✓', name); };

  const def = loadComponent('./skeleton/skeleton.js');

  // 1. 默认 loading=true
  const d = createInstance(def);
  assert.strictEqual(d.data.loading, true);
  ok('默认 loading=true');

  // 2. rows=3 → rowArray 长度 3
  assert.strictEqual(d.data.rowArray.length, 3);
  ok('rows=3 生成 3 行');

  // 3. rows=0 → 0 行
  const z = createInstance(def, { rows: 0 });
  assert.strictEqual(z.data.rowArray.length, 0);
  ok('rows=0 生成 0 行');

  // 4. rows=5 → 5 行
  const f = createInstance(def, { rows: 5 });
  assert.strictEqual(f.data.rowArray.length, 5);
  ok('rows=5 生成 5 行');

  // 5. 运行中修改 rows → observer 重算
  const sw = createInstance(def);
  sw.setData({ rows: 2 });
  assert.strictEqual(sw.data.rowArray.length, 2);
  ok('setData 修改 rows 触发 observer 重算');

  // 6. lastRowWidth 默认 60%
  assert.strictEqual(d.data.lastRowWidth, '60%');
  ok('lastRowWidth 默认 60%');

  console.log(`\nskeleton: ${pass} passed`);
}

run();
