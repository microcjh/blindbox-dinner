// mock: 模拟 wx-server-sdk（仅覆盖 init-db 用到的能力）
// - createCollection: 第一次成功，第二次抛「已存在」(-502005)
// - collection(name).createIndex: 第一次成功，第二次抛「已存在」(-502007)
// 通过 exportedState 暴露调用记录，供单测断言。

const existingCollections = new Set();
const existingIndexes = new Set(); // `${collection}.${indexName}`

const callLog = {
  createCollection: [],
  createIndex: [],
};

function makeError(errCode, message) {
  const e = new Error(message);
  e.errCode = errCode;
  return e;
}

const cloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'mock-env',
  getWXContext() {
    return { OPENID: 'mock-openid', APPID: 'mock-appid', UNIONID: null };
  },
  database() {
    return {
      createCollection(name) {
        callLog.createCollection.push(name);
        if (existingCollections.has(name)) {
          throw makeError(-502005, `collection "${name}" already exists`);
        }
        existingCollections.add(name);
        return Promise.resolve({ ok: true });
      },
      collection(name) {
        return {
          createIndex({ name: indexName }) {
            const key = `${name}.${indexName}`;
            callLog.createIndex.push(key);
            if (existingIndexes.has(key)) {
              throw makeError(-502007, `index "${indexName}" already exists`);
            }
            existingIndexes.add(key);
            return Promise.resolve({ ok: true });
          },
        };
      },
    };
  },
};

// 测试用的重置方法（不暴露给业务代码）
cloud.__reset = () => {
  existingCollections.clear();
  existingIndexes.clear();
  callLog.createCollection.length = 0;
  callLog.createIndex.length = 0;
};

cloud.__callLog = callLog;

module.exports = cloud;
