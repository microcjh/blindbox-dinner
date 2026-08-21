module.exports = {
    init() {},
    DYNAMIC_CURRENT_ENV: 'mock-env',
    getWXContext() { return { OPENID: 'mock-openid', APPID: 'mock-appid', UNIONID: null }; }
  };