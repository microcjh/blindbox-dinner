/**
 * services/questionnaire.test.js — questionnaire 业务层离线单测(Node 环境 mock wx)
 * 运行: node questionnaire.test.js  (由 package.json test / scripts/test-all.sh 调用)
 *
 * 覆盖: submitQuestionnaire / getQuestionnaire / getPublicDimension 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(diet_pref / personality / budget / taboo / topics / expect / uid)
 *   - loading 语义(写操作默认 / 浏览类 loading:false)
 *   - 成功结果解析(回传 data)
 */
const assert = require('assert');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.error('  ✗', msg); }
}

let queue = [];
let lastCall = null;
let showLoadingCalls = 0;
const store = {};

function installWx() {
  queue = [];
  lastCall = null;
  showLoadingCalls = 0;
  global.wx = {
    cloud: {
      callFunction(opts) {
        lastCall = opts;
        const r = queue.shift() || { code: 0, data: {} };
        if (opts.success) opts.success({ result: r });
      },
    },
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    showLoading: () => { showLoadingCalls += 1; },
    hideLoading: () => {},
    showToast: () => {},
  };
}

const questionnaire = require('./questionnaire');

async function run() {
  // 1) submitQuestionnaire: 透传参数 + action=submit + 默认 loading
  installWx();
  queue = [{ code: 0, data: { id: 'q1', updated: false } }];
  const r = await questionnaire.submitQuestionnaire({
    dietPref: '川菜微辣', personality: 'e人话痨', budget: 80,
    taboo: ['香菜'], topics: ['旅行'], expect: ['认识有趣的人'],
  });
  ok(lastCall && lastCall.name === 'questionnaire', 'submitQuestionnaire 调 questionnaire 云函数');
  ok(lastCall.data.action === 'submit', 'submitQuestionnaire action=submit');
  ok(lastCall.data.diet_pref === '川菜微辣', '透传 diet_pref');
  ok(lastCall.data.personality === 'e人话痨', '透传 personality');
  ok(lastCall.data.budget === 80, '透传 budget');
  ok(Array.isArray(lastCall.data.taboo) && lastCall.data.taboo[0] === '香菜', '透传 taboo 数组');
  ok(showLoadingCalls === 1, 'submitQuestionnaire 写操作默认 showLoading');

  // 2) getQuestionnaire: action=get + loading:false（不弹 loading）
  installWx();
  queue = [{ code: 0, data: { id: 'q1', diet_pref: '川菜', expect: ['x'] } }];
  const r2 = await questionnaire.getQuestionnaire();
  ok(lastCall.data.action === 'get', 'getQuestionnaire action=get');
  ok(showLoadingCalls === 0, 'getQuestionnaire 浏览类不弹 loading');
  ok(r2 && r2.id === 'q1', '解析回传 data');

  // 3) getPublicDimension: 透传 uid + action=get + loading:false
  installWx();
  queue = [{ code: 0, data: { user_id: 'u_x', diet_pref: '日料' } }];
  const r3 = await questionnaire.getPublicDimension('u_x');
  ok(lastCall.data.action === 'get', 'getPublicDimension action=get');
  ok(lastCall.data.uid === 'u_x', '透传 uid（查他人）');
  ok(showLoadingCalls === 0, 'getPublicDimension 浏览类不弹 loading');
  ok(r3 && r3.user_id === 'u_x', '解析回传公开维度');

  console.log(`\nquestionnaire 门面单测: ${passed} 通过 / ${failed} 失败`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => { console.error('❌ 异常:', err.message); process.exit(1); });
