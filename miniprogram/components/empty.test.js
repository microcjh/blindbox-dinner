/**
 * empty.test.js — empty 离线单测(Node 环境，无微信 SDK)
 * 覆盖：默认图标/文案、desc 与 showAction 开关。
 */
const assert = require('assert');
const { loadComponent, createInstance } = require('./__mocks__/harness');

function run() {
  let pass = 0;
  const ok = (name) => { pass += 1; console.log('  ✓', name); };

  const def = loadComponent('./empty/empty.js');

  // 1. 默认图标与文案
  const d = createInstance(def);
  assert.strictEqual(d.data.icon, '🍽️');
  assert.strictEqual(d.data.text, '这里空空如也');
  assert.strictEqual(d.data.desc, '');
  assert.strictEqual(d.data.showAction, false);
  ok('默认图标/文案/开关正确');

  // 2. 可覆盖文案与开启 action 插槽
  const c = createInstance(def, { icon: '🔍', text: '没有匹配的饭局', desc: '换个条件试试', showAction: true });
  assert.strictEqual(c.data.icon, '🔍');
  assert.strictEqual(c.data.text, '没有匹配的饭局');
  assert.strictEqual(c.data.desc, '换个条件试试');
  assert.strictEqual(c.data.showAction, true);
  ok('可覆盖文案/描述并开启 action 插槽');

  console.log(`\nempty: ${pass} passed`);
}

run();
