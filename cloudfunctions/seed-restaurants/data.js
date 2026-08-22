// cloudfunctions/seed-restaurants/data.js
// 任务：task-010 — 餐厅库种子数据（≥20 家北京探店餐厅）
// 字段严格对齐 docs/database-schema.md 中 restaurants 集合：
//   name, address, cuisine, avg_price, rating, lng, lat, verified
// 说明：
//   - 坐标为餐厅真实经纬度（GCJ-02，与微信地图一致），用于后续「附近场次」距离排序
//   - cuisine 取自受限菜系枚举，供 idx_cuisine 索引与场次筛选使用
//   - avg_price 单位：元/人；rating 取 0–5 两位小数
//   - verified 默认 false，由 task-022 admin 审核后翻 true（种子数据均为待审核）
// 去重键：name + address（同品牌不同门店地址不同，视为不同记录）

const RESTAURANTS = [
  {
    name: '局气（王府井店）',
    address: '北京市东城区王府井大街138号新东安市场5层',
    cuisine: '京菜',
    avg_price: 128,
    rating: 4.6,
    lng: 116.4109,
    lat: 39.9149,
    verified: false,
  },
  {
    name: '四季民福（灯市口店）',
    address: '北京市东城区灯市口大街57号',
    cuisine: '烤鸭',
    avg_price: 198,
    rating: 4.8,
    lng: 116.4165,
    lat: 39.9188,
    verified: false,
  },
  {
    name: '南锣鼓巷 niche 私房菜',
    address: '北京市东城区南锣鼓巷108号',
    cuisine: '创意菜',
    avg_price: 168,
    rating: 4.4,
    lng: 116.4031,
    lat: 39.9372,
    verified: false,
  },
  {
    name: '川办餐厅',
    address: '北京市朝阳区建国门外大街乙24号燕华苑2层',
    cuisine: '川菜',
    avg_price: 138,
    rating: 4.5,
    lng: 116.4593,
    lat: 39.9086,
    verified: false,
  },
  {
    name: '巴奴毛肚火锅（三里屯店）',
    address: '北京市朝阳区三里屯路19号院太古里南区S8-30',
    cuisine: '火锅',
    avg_price: 158,
    rating: 4.7,
    lng: 116.4551,
    lat: 39.9335,
    verified: false,
  },
  {
    name: '海底捞（西单店）',
    address: '北京市西城区西单北大街120号西单商场7层',
    cuisine: '火锅',
    avg_price: 130,
    rating: 4.6,
    lng: 116.3735,
    lat: 39.9135,
    verified: false,
  },
  {
    name: '南京大牌档（朝阳大悦城店）',
    address: '北京市朝阳区朝阳北路101号朝阳大悦城6层',
    cuisine: '淮扬菜',
    avg_price: 95,
    rating: 4.5,
    lng: 116.4865,
    lat: 39.9238,
    verified: false,
  },
  {
    name: '酉西会馆',
    address: '北京市西城区什刹海前海东沿22号',
    cuisine: '私房菜',
    avg_price: 320,
    rating: 4.7,
    lng: 116.3867,
    lat: 39.9389,
    verified: false,
  },
  {
    name: '北平食府（前门店）',
    address: '北京市东城区前门大街鲜鱼口街87号',
    cuisine: '京菜',
    avg_price: 118,
    rating: 4.4,
    lng: 116.3978,
    lat: 39.8985,
    verified: false,
  },
  {
    name: '小大董（国贸店）',
    address: '北京市朝阳区建国门外大街1号国贸商城B1层',
    cuisine: '烤鸭',
    avg_price: 165,
    rating: 4.6,
    lng: 116.4608,
    lat: 39.9085,
    verified: false,
  },
  {
    name: '将太无二（中关村店）',
    address: '北京市海淀区中关村大街15号中关村广场购物中心B1层',
    cuisine: '日料',
    avg_price: 178,
    rating: 4.5,
    lng: 116.3165,
    lat: 39.9836,
    verified: false,
  },
  {
    name: '鮨然 Omakase',
    address: '北京市朝阳区新源南路8号院启皓大厦1层',
    cuisine: '日料',
    avg_price: 880,
    rating: 4.9,
    lng: 116.4556,
    lat: 39.9438,
    verified: false,
  },
  {
    name: 'TIAGO HOME KITCHEN（三里屯店）',
    address: '北京市朝阳区三里屯路19号院太古里南区N4-30',
    cuisine: '西餐',
    avg_price: 220,
    rating: 4.5,
    lng: 116.4543,
    lat: 39.9331,
    verified: false,
  },
  {
    name: '塞尚印象法餐厅',
    address: '北京市东城区东直门外大街48号东方银座C座15层',
    cuisine: '西餐',
    avg_price: 380,
    rating: 4.6,
    lng: 116.4348,
    lat: 39.9412,
    verified: false,
  },
  {
    name: '莆田（王府井店）',
    address: '北京市东城区王府井大街301号新燕莎金街购物广场5层',
    cuisine: '闽菜',
    avg_price: 145,
    rating: 4.4,
    lng: 116.4112,
    lat: 39.9158,
    verified: false,
  },
  {
    name: '广州大厦岭南厅',
    address: '北京市西城区广安门南街42号广州大厦2层',
    cuisine: '粤菜',
    avg_price: 188,
    rating: 4.5,
    lng: 116.3621,
    lat: 39.8941,
    verified: false,
  },
  {
    name: '点都德（西单大悦城店）',
    address: '北京市西城区西单北大街131号大悦城6层',
    cuisine: '粤菜',
    avg_price: 98,
    rating: 4.4,
    lng: 116.3742,
    lat: 39.9138,
    verified: false,
  },
  {
    name: '云海肴（五道口店）',
    address: '北京市海淀区成府路28号优盛大厦1层',
    cuisine: '云南菜',
    avg_price: 105,
    rating: 4.3,
    lng: 116.3378,
    lat: 39.9923,
    verified: false,
  },
  {
    name: '云古镇云南菜（三里屯店）',
    address: '北京市朝阳区工体北路甲2号盈科中心1层',
    cuisine: '云南菜',
    avg_price: 118,
    rating: 4.2,
    lng: 116.4489,
    lat: 39.9365,
    verified: false,
  },
  {
    name: '绿茶餐厅（朝阳大悦城店）',
    address: '北京市朝阳区朝阳北路101号朝阳大悦城6层',
    cuisine: '杭帮菜',
    avg_price: 85,
    rating: 4.3,
    lng: 116.4865,
    lat: 39.9238,
    verified: false,
  },
  {
    name: '外婆家（西单大悦城店）',
    address: '北京市西城区西单北大街131号大悦城6层',
    cuisine: '杭帮菜',
    avg_price: 78,
    rating: 4.2,
    lng: 116.3742,
    lat: 39.9138,
    verified: false,
  },
  {
    name: '湘鄂情（中关村店）',
    address: '北京市海淀区丹棱街3号中国电子大厦B1层',
    cuisine: '湘菜',
    avg_price: 135,
    rating: 4.3,
    lng: 116.3178,
    lat: 39.9842,
    verified: false,
  },
  {
    name: '潇湘阁',
    address: '北京市朝阳区光华路9号世贸天阶北楼2层',
    cuisine: '湘菜',
    avg_price: 122,
    rating: 4.4,
    lng: 116.4578,
    lat: 39.9145,
    verified: false,
  },
  {
    name: '老磁器口豆汁店（天坛店）',
    address: '北京市东城区天坛路89号',
    cuisine: '小吃',
    avg_price: 35,
    rating: 4.1,
    lng: 116.4102,
    lat: 39.8823,
    verified: false,
  },
  {
    name: '护国寺小吃（地安门店）',
    address: '北京市西城区地安门外大街158号',
    cuisine: '小吃',
    avg_price: 32,
    rating: 4.2,
    lng: 116.3889,
    lat: 39.9401,
    verified: false,
  },
  {
    name: '聚宝源（牛街总店）',
    address: '北京市西城区牛街西里商业1号楼5号',
    cuisine: '火锅',
    avg_price: 140,
    rating: 4.7,
    lng: 116.3667,
    lat: 39.8889,
    verified: false,
  },
  {
    name: '东来顺（王府井店）',
    address: '北京市东城区王府井大街138号新东安市场5层',
    cuisine: '火锅',
    avg_price: 158,
    rating: 4.5,
    lng: 116.4109,
    lat: 39.9149,
    verified: false,
  },
];

// 导出前做一次自校验：字段完整、坐标合法、条数达标（开发期 fail-fast）
function validate() {
  const required = ['name', 'address', 'cuisine', 'avg_price', 'rating', 'lng', 'lat', 'verified'];
  if (RESTAURANTS.length < 20) {
    throw new Error(`餐厅种子数据不足 20 家，当前 ${RESTAURANTS.length} 家`);
  }
  RESTAURANTS.forEach((r, i) => {
    required.forEach((k) => {
      if (typeof r[k] === 'undefined' || r[k] === null || r[k] === '') {
        throw new Error(`第 ${i + 1} 条缺字段 ${k}`);
      }
    });
    if (r.lng < 115 || r.lng > 118 || r.lat < 38 || r.lat > 42) {
      throw new Error(`第 ${i + 1} 条坐标越界：${r.name}`);
    }
    if (r.rating < 0 || r.rating > 5) {
      throw new Error(`第 ${i + 1} 条评分越界：${r.name}`);
    }
  });
  return RESTAURANTS.length;
}

module.exports = { RESTAURANTS, validate };
