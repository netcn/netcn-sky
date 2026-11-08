/* 城市坐标与光污染估算（Bortle 等级为城市级粗估，非精确地图） */
export const DEFAULT_CITY = {
  id: "shanghai", zh: "上海", en: "Shanghai", province: "上海",
  lat: 31.2304, lon: 121.4737, bortle: 8
};

export const CITIES = [
  { id: "shanghai", zh: "上海", en: "Shanghai", province: "上海", lat: 31.2304, lon: 121.4737, bortle: 8 },
  { id: "beijing", zh: "北京", en: "Beijing", province: "北京", lat: 39.9042, lon: 116.4074, bortle: 8 },
  { id: "guangzhou", zh: "广州", en: "Guangzhou", province: "广东", lat: 23.1291, lon: 113.2644, bortle: 8 },
  { id: "shenzhen", zh: "深圳", en: "Shenzhen", province: "广东", lat: 22.5431, lon: 114.0579, bortle: 8 },
  { id: "hangzhou", zh: "杭州", en: "Hangzhou", province: "浙江", lat: 30.2741, lon: 120.1551, bortle: 8 },
  { id: "nanjing", zh: "南京", en: "Nanjing", province: "江苏", lat: 32.0603, lon: 118.7969, bortle: 8 },
  { id: "suzhou", zh: "苏州", en: "Suzhou", province: "江苏", lat: 31.2989, lon: 120.5853, bortle: 8 },
  { id: "chengdu", zh: "成都", en: "Chengdu", province: "四川", lat: 30.5728, lon: 104.0668, bortle: 8 },
  { id: "chongqing", zh: "重庆", en: "Chongqing", province: "重庆", lat: 29.563, lon: 106.5516, bortle: 8 },
  { id: "wuhan", zh: "武汉", en: "Wuhan", province: "湖北", lat: 30.5928, lon: 114.3055, bortle: 8 },
  { id: "xian", zh: "西安", en: "Xi'an", province: "陕西", lat: 34.3416, lon: 108.9398, bortle: 8 },
  { id: "tianjin", zh: "天津", en: "Tianjin", province: "天津", lat: 39.0842, lon: 117.2009, bortle: 8 },
  { id: "changsha", zh: "长沙", en: "Changsha", province: "湖南", lat: 28.2282, lon: 112.9388, bortle: 8 },
  { id: "zhengzhou", zh: "郑州", en: "Zhengzhou", province: "河南", lat: 34.7466, lon: 113.6254, bortle: 8 },
  { id: "hefei", zh: "合肥", en: "Hefei", province: "安徽", lat: 31.8206, lon: 117.2272, bortle: 8 },
  { id: "jinan", zh: "济南", en: "Jinan", province: "山东", lat: 36.6512, lon: 117.1201, bortle: 8 },
  { id: "shijiazhuang", zh: "石家庄", en: "Shijiazhuang", province: "河北", lat: 38.0428, lon: 114.5149, bortle: 8 },
  { id: "taiyuan", zh: "太原", en: "Taiyuan", province: "山西", lat: 37.8706, lon: 112.5489, bortle: 8 },
  { id: "shenyang", zh: "沈阳", en: "Shenyang", province: "辽宁", lat: 41.8057, lon: 123.4315, bortle: 8 },
  { id: "qingdao", zh: "青岛", en: "Qingdao", province: "山东", lat: 36.0671, lon: 120.3826, bortle: 7 },
  { id: "dalian", zh: "大连", en: "Dalian", province: "辽宁", lat: 38.914, lon: 121.6147, bortle: 7 },
  { id: "xiamen", zh: "厦门", en: "Xiamen", province: "福建", lat: 24.4798, lon: 118.0894, bortle: 7 },
  { id: "fuzhou", zh: "福州", en: "Fuzhou", province: "福建", lat: 26.0745, lon: 119.2965, bortle: 7 },
  { id: "kunming", zh: "昆明", en: "Kunming", province: "云南", lat: 25.0389, lon: 102.7183, bortle: 7 },
  { id: "guiyang", zh: "贵阳", en: "Guiyang", province: "贵州", lat: 26.647, lon: 106.6302, bortle: 7 },
  { id: "nanning", zh: "南宁", en: "Nanning", province: "广西", lat: 22.817, lon: 108.3665, bortle: 7 },
  { id: "haikou", zh: "海口", en: "Haikou", province: "海南", lat: 20.044, lon: 110.1999, bortle: 7 },
  { id: "sanya", zh: "三亚", en: "Sanya", province: "海南", lat: 18.2528, lon: 109.5119, bortle: 6 },
  { id: "harbin", zh: "哈尔滨", en: "Harbin", province: "黑龙江", lat: 45.8038, lon: 126.5349, bortle: 7 },
  { id: "changchun", zh: "长春", en: "Changchun", province: "吉林", lat: 43.8171, lon: 125.3235, bortle: 7 },
  { id: "hohhot", zh: "呼和浩特", en: "Hohhot", province: "内蒙古", lat: 40.8424, lon: 111.749, bortle: 7 },
  { id: "lanzhou", zh: "兰州", en: "Lanzhou", province: "甘肃", lat: 36.0611, lon: 103.8343, bortle: 7 },
  { id: "urumqi", zh: "乌鲁木齐", en: "Urumqi", province: "新疆", lat: 43.8256, lon: 87.6168, bortle: 7 },
  { id: "xining", zh: "西宁", en: "Xining", province: "青海", lat: 36.6171, lon: 101.7782, bortle: 6 },
  { id: "yinchuan", zh: "银川", en: "Yinchuan", province: "宁夏", lat: 38.4872, lon: 106.2309, bortle: 6 },
  { id: "ningbo", zh: "宁波", en: "Ningbo", province: "浙江", lat: 29.8683, lon: 121.544, bortle: 7 },
  { id: "wuxi", zh: "无锡", en: "Wuxi", province: "江苏", lat: 31.4912, lon: 120.3119, bortle: 8 },
  { id: "changzhou", zh: "常州", en: "Changzhou", province: "江苏", lat: 31.8107, lon: 119.9741, bortle: 8 },
  { id: "nantong", zh: "南通", en: "Nantong", province: "江苏", lat: 31.9802, lon: 120.8943, bortle: 8 },
  { id: "jiaxing", zh: "嘉兴", en: "Jiaxing", province: "浙江", lat: 30.7522, lon: 120.75, bortle: 7 },
  { id: "shaoxing", zh: "绍兴", en: "Shaoxing", province: "浙江", lat: 30.0303, lon: 120.5802, bortle: 7 },
  { id: "yangzhou", zh: "扬州", en: "Yangzhou", province: "江苏", lat: 32.3942, lon: 119.4129, bortle: 7 },
  { id: "zhenjiang", zh: "镇江", en: "Zhenjiang", province: "江苏", lat: 32.1878, lon: 119.425, bortle: 7 },
  { id: "huzhou", zh: "湖州", en: "Huzhou", province: "浙江", lat: 30.8943, lon: 120.0868, bortle: 7 },
  { id: "jinhua", zh: "金华", en: "Jinhua", province: "浙江", lat: 29.0792, lon: 119.6474, bortle: 7 },
  { id: "lhasa", zh: "拉萨", en: "Lhasa", province: "西藏", lat: 29.652, lon: 91.1721, bortle: 5 },
  { id: "lijiang", zh: "丽江", en: "Lijiang", province: "云南", lat: 26.8721, lon: 100.2299, bortle: 4 },
  { id: "shangri-la", zh: "香格里拉", en: "Shangri-La", province: "云南", lat: 27.8269, lon: 99.7065, bortle: 3 },
  { id: "dunhuang", zh: "敦煌", en: "Dunhuang", province: "甘肃", lat: 40.1421, lon: 94.6619, bortle: 3 },
  { id: "zhongwei", zh: "中卫", en: "Zhongwei", province: "宁夏", lat: 37.5002, lon: 105.1968, bortle: 3 },
  { id: "wulanchabu", zh: "乌兰察布", en: "Ulanqab", province: "内蒙古", lat: 40.9946, lon: 113.133, bortle: 3 },
  { id: "hulunbuir", zh: "呼伦贝尔", en: "Hulunbuir", province: "内蒙古", lat: 49.2122, lon: 119.7658, bortle: 2 },
  { id: "delingha", zh: "德令哈", en: "Delingha", province: "青海", lat: 37.3691, lon: 97.3609, bortle: 2 },
  { id: "mohe", zh: "漠河", en: "Mohe", province: "黑龙江", lat: 52.97, lon: 122.5386, bortle: 2 },
  { id: "ali", zh: "阿里", en: "Ngari", province: "西藏", lat: 32.5033, lon: 80.1054, bortle: 1 }
];

export function cityById(id) { return CITIES.find((c) => c.id === id) || null; }

/* 用经纬度找最近城市（定位失败时用 IP 估计也可复用） */
export function nearestCity(lat, lon) {
  let best = null, bestD = Infinity;
  for (const c of CITIES) {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function cityLabel(c, lang) {
  if (!c) return "";
  return lang === "en" ? c.en : c.zh;
}
