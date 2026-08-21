/**
 * ui-button.test.js — ui-button 离线单测(Node 环境，无微信 SDK)
 * 覆盖：class observer、loading/disabled 拦截点击、open-type 透传下的 tap 行为。
 */
const assert = require('assert');
const { loadComponent, createInstance } = require('./__mocks__/harness');

function run() {
  let pass = 0;
  const ok = (name) => { pass += 1; console.log('  ✓', name); };

  const def = loadComponent('./ui-button/ui-button.js');

  // 1. 默认 type=primary → btnClass 含 ui-btn--primary
  const d = createInstance(def);
  assert.ok(d.data.btnClass.includes('ui-btn--primary'));
  ok('默认 type=primary 计算正确 class');

  // 2. 组合属性 → 累加对应 class
  const c = createInstance(def, { type: 'danger', size: 'large', block: true, round: false });
  assert.ok(c.data.btnClass.includes('ui-btn--danger'));
  assert.ok(c.data.btnClass.includes('ui-btn--lg'));
  assert.ok(c.data.btnClass.includes('ui-btn--block'));
  assert.ok(c.data.btnClass.includes('ui-btn--square'));
  assert.ok(!c.data.btnClass.includes('ui-btn--loading'));
  ok('danger+large+block+square 组合 class 正确');

  // 3. 正常点击 → 触发 tap 事件
  const t = createInstance(def);
  t.onTap();
  assert.strictEqual(t._events.length, 1);
  assert.strictEqual(t._events[0].name, 'tap');
  ok('正常态点击触发 tap 事件');

  // 4. loading 态点击 → 拦截，不触发
  const l = createInstance(def, { loading: true });
  assert.ok(l.data.btnClass.includes('ui-btn--loading'));
  l.onTap();
  assert.strictEqual(l._events.length, 0);
  ok('loading 态拦截点击');

  // 5. disabled 态点击 → 拦截，不触发
  const dis = createInstance(def, { disabled: true });
  assert.ok(dis.data.btnClass.includes('ui-btn--disabled'));
  dis.onTap();
  assert.strictEqual(dis._events.length, 0);
  ok('disabled 态拦截点击');

  // 6. 运行中切换 disabled → observer 更新 class
  const sw = createInstance(def);
  sw.setData({ disabled: true });
  assert.ok(sw.data.btnClass.includes('ui-btn--disabled'));
  ok('setData 切换 disabled 触发 observer 更新 class');

  // 7. open-type 透传且未禁用 → 仍触发 tap(页面另绑微信能力回调)
  const ot = createInstance(def, { openType: 'getPhoneNumber' });
  ot.onTap();
  assert.strictEqual(ot._events.length, 1);
  ok('open-type 按钮正常态仍触发 tap');

  console.log(`\nui-button: ${pass} passed`);
}

run();
