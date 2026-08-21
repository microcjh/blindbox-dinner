/**
 * bottom-bar.test.js — bottom-bar 离线单测(Node 环境，无微信 SDK)
 * 覆盖：fixed/bordered 默认值、安全区由 CSS env() 处理(无需 JS 逻辑)。
 */
const assert = require('assert');
const { loadComponent, createInstance } = require('./__mocks__/harness');

function run() {
  let pass = 0;
  const ok = (name) => { pass += 1; console.log('  ✓', name); };

  const def = loadComponent('./bottom-bar/bottom-bar.js');

  // 1. 默认 fixed=true, bordered=false
  const d = createInstance(def);
  assert.strictEqual(d.data.fixed, true);
  assert.strictEqual(d.data.bordered, false);
  ok('默认 fixed=true, bordered=false');

  // 2. 可切换为普通流内条
  const c = createInstance(def, { fixed: false, bordered: true });
  assert.strictEqual(c.data.fixed, false);
  assert.strictEqual(c.data.bordered, true);
  ok('可切换 fixed=false + bordered=true');

  console.log(`\nbottom-bar: ${pass} passed`);
}

run();
