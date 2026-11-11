/* ============================================================
   火烧云 · 页面逻辑
   数据 → 评分 → 渲染；城市默认上海，可切换/定位。
   ============================================================ */
import { loadSky, loadGrid, loadStorms, loadOfficialTracks, matchOfficialTrack, reverseName, interpolator } from "./sources.js";
import { evaluate, glowFactors, scoreGrid } from "./scoring.js";
import { CITIES, DEFAULT_CITY, cityById, nearestCity, cityLabel } from "./cities.js";
import { fmtHM, phaseName } from "./astro.js";
import { updateLiveMap, setMapLoading } from "./live-map.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const round = (v) => (Number.isFinite(v) ? Math.round(v) : "—");
const pct = (v) => (Number.isFinite(v) ? Math.round(v) + "%" : "—");
const STORE_CITY = "sky_city_v1";

const T = {
  zh: {
    loadingTitle: "正在读取今晚的天空…",
    loadingText: "正在汇总六个数值模式与集合预报。",
    evening: "火烧云", morning: "朝霞", star: "星空", moon: "月亮",
    prob: "概率", index: "指数",
    cityTitle: "选择城市", filterPh: "输入城市名，如 上海、敦煌",
    refresh: "刷新", geo: "用我的位置", updated: "更新于", updating: "正在更新…",
    /* 全站只用北京时间：所有数据源（UTC / 挪威 / 美国 / 日本）都已换算到 UTC+8，
       页面明确标注，海外用户不会把 17:03 误当成自己的本地时间。 */
    tzTag: "（北京时间）", tzName: "北京时间（UTC+8）", cachedTag: "（缓存）",
    now: "现在", sunset: "日落", blueHour: "蓝调", moonrise: "月出", sunrise: "日出",
    tlHint: "柱高是云量，颜色随温度变化；紫线是降水，灰罩是空气较差（时间为北京时间）",
    tlCloud: "云量", tlRain: "降水",
    tlLgTemp: "颜色＝当天温度（蓝最凉 → 橙最暖）",
    tlLgCloud: "柱高＝云量，越低越通透",
    tlLgRain: "紫线＝降水概率高",
    tlLgHaze: "灰罩＝PM2.5 / 气溶胶偏高",
    tlLgNight: "深蓝＝夜间时段",
    detail: "为什么是这个结果",
    models: "六个模式怎么看",
    mHint: "分歧越大，置信度越低",
    ensTitle: "集合成员分布",
    days: "未来三天",
    note: "数据与边界",
    confHigh: "高", confMid: "中", confLow: "低",
    good: "看好", mid: "一般", bad: "不看好",
    why: "原因", factor: "因子",
    model: "模式", high: "高云", mid2: "中云", low: "低云", score: "评分", view: "看法",
    totalCloud: "总云量",
    crossCheck: "交叉校验",
    ensNote: (n, k, p) => `${n} 个集合成员中 ${k} 个达到“值得出门”的门槛，对应概率 ${p}%。`,
    ensNone: "集合预报暂不可用，本次只用 6 个数值模式的共识。",
    tableNote: "评分按日落时刻的云层结构、能见度、气溶胶、降水与露点差计算；看法以 60 分为界。",
    srcNote: (t) => `数据：<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> 六个数值模式（ECMWF / CMA / ICON / GFS / JMA / UKMO）、ECMWF 50 个集合成员、空气质量气溶胶；<a href="https://www.met.no/" target="_blank" rel="noopener">挪威气象局 met.no</a> 做总云量交叉校验。更新于 ${t}。预报存在误差，概率仅供参考；光污染为城市级估算，郊区与山区通常更好。所有时间均为北京时间（UTC+8）——各数据源返回的 UTC、当地时或模式本地时都已统一换算。`,
    error: "数据没取到，可能是网络或接口限流。稍等一下再试。",
    retry: "重试",
    bortleNote: "市区光污染较强，银河基本看不到",
    moonUp: "今晚可见", moonDown: "整夜在地平线下",
    week: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    today: "今天", tomorrow: "明天", dayAfter: "后天",
    cloudPh: "搜城市，如 上海 / 敦煌"
  },
  en: {
    loadingTitle: "Reading tonight's sky…",
    loadingText: "Combining six weather models and the ensemble forecast.",
    evening: "Sunset glow", morning: "Sunrise glow", star: "Starry sky", moon: "Moon",
    prob: "chance", index: "score",
    cityTitle: "Choose a city", filterPh: "City name, e.g. Shanghai",
    refresh: "Refresh", geo: "Use my location", updated: "updated", updating: "updating…",
    tzTag: " (China Standard Time)", tzName: "China Standard Time (UTC+8)", cachedTag: " (cached)",
    now: "now", sunset: "Sunset", blueHour: "Blue hour", moonrise: "Moonrise", sunrise: "Sunrise",
    tlHint: "Bar height is cloud cover, colour tracks temperature; violet = rain, grey = poor air (times in CST / UTC+8)",
    tlCloud: "Cloud", tlRain: "Rain",
    tlLgTemp: "Colour = today's temperature (blue coolest → orange warmest)",
    tlLgCloud: "Height = cloud cover; lower is clearer",
    tlLgRain: "Violet dash = likely rain",
    tlLgHaze: "Grey veil = high PM2.5 / aerosol",
    tlLgNight: "Deep blue = night hours",
    detail: "Why this result",
    models: "How the six models see it",
    mHint: "More disagreement, lower confidence",
    ensTitle: "Ensemble spread",
    days: "Next three days",
    note: "Data & limits",
    confHigh: "high", confMid: "medium", confLow: "low",
    good: "good", mid: "fair", bad: "poor",
    why: "Why", factor: "Factor",
    model: "Model", high: "High", mid2: "Mid", low: "Low", score: "Score", view: "View",
    totalCloud: "Total cloud",
    crossCheck: "cross-check",
    ensNote: (n, k, p) => `${k} of ${n} ensemble members clear the “worth going” bar, i.e. ${p}%.`,
    ensNone: "Ensemble data unavailable; using the six-model consensus only.",
    tableNote: "Score uses cloud structure at sunset, visibility, aerosol, rain chance and dew-point spread; 60 is the go/no-go line.",
    srcNote: (t) => `Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> six models (ECMWF / CMA / ICON / GFS / JMA / UKMO), 50 ECMWF ensemble members, air-quality aerosol; <a href="https://www.met.no/" target="_blank" rel="noopener">met.no</a> for a total-cloud cross-check. Updated ${t}. Forecasts are uncertain and probabilities are indicative; light pollution is a city-level estimate. All times are China Standard Time (UTC+8) — UTC, local and model-native times from every source are converted to this one basis.`,
    error: "Could not load the data — network or rate limit. Try again in a moment.",
    retry: "Retry",
    bortleNote: "city light pollution is strong; the Milky Way is not visible",
    moonUp: "visible tonight", moonDown: "below the horizon all night",
    week: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    today: "Today", tomorrow: "Tomorrow", dayAfter: "In 2 days",
    cloudPh: "Search a city, e.g. Shanghai"
  }
};

Object.assign(T.zh, {
  mapTitle: "晚霞地图 · 你周围约 300 公里",
  mapHint: "颜色越暖，指数越高",
  mapReset: "回到我的位置",
  mapStormTitle: "台风位置",
  mapStormCap: "显示该热带气旋最近一次记录的位置；晚霞网格仍在你的城市周围，点『回到我的位置』可切回。",
  mapLoading: "正在计算周围 300 公里的晚霞指数…",
  mapFail: "地图数据没取到，稍后刷新再试。",
  wxTitle: "天气与空气", wxHint: "现在 + 未来三天",
  stTitle: "台风与热带气旋", stHint: "NASA EONET · 近 60 天",
  feels: "体感", humidity: "湿度", wind: "风", vis: "能见度", cloudCover: "云量", rainChance: "降水概率",
  air: "空气质量",
  stormsNone: "当前没有活跃的台风或热带气旋。",
  stormDist: (km) => `距你约 ${km.toLocaleString()} 公里`,
  stormView: "在地图上查看",
  stormSource: "来源：NASA EONET 观测点 + GDACS 汇总的 JTWC/JMA 官方预报。实线是历史路径，蓝紫色虚线为官方预报，橙色虚线为线性外推（仅在没有官方预报时显示）。",
  stormForecast: (h) => `官方预报 · 未来 ${h} 小时`,
  stormExtrapolate: "官方预报暂缺 · 按最近移动线性外推 24 小时",
  stormOfficialSource: "GDACS / JTWC 官方报告",
  stormMove: (d, v) => `向${d}移动 · 约 ${v} 公里/小时`,
  geoTitle: "看你自己所在的位置",
  geoDesc: "允许定位后，页面会换成你附近的观测条件；不授权就继续看上海。",
  geoAllow: "允许定位", geoSkip: "先看上海",
  geoLocating: "正在定位…",
  geoFail: "定位失败，继续使用当前城市。",
  geoOK: (n) => `已定位到 ${n}`,
  myLocation: "我的位置"
});
Object.assign(T.en, {
  mapTitle: "Glow map · about 300 km around you",
  mapHint: "Warmer colours mean a higher index",
  mapReset: "Back to my location",
  mapStormTitle: "Storm position",
  mapStormCap: "Showing the storm’s latest recorded position. The glow grid stays around your city — use “Back to my location” to return.",
  mapLoading: "Computing the glow index for the 300 km around you…",
  mapFail: "Map data unavailable — refresh to try again.",
  wxTitle: "Weather & air", wxHint: "Now + next three days",
  stTitle: "Typhoons & tropical cyclones", stHint: "NASA EONET · last 60 days",
  feels: "Feels like", humidity: "Humidity", wind: "Wind", vis: "Visibility", cloudCover: "Cloud", rainChance: "Rain chance",
  air: "Air quality",
  stormsNone: "No active typhoons or tropical cyclones right now.",
  stormDist: (km) => `about ${km.toLocaleString()} km from you`,
  stormView: "Show on map",
  stormSource: "Source: NASA EONET fixes + GDACS (JTWC/JMA) official forecast. Solid = observed track; violet dashed = official forecast; orange dashed = linear extrapolation shown only when no official forecast exists.",
  stormForecast: (h) => `Official forecast · next ${h} h`,
  stormExtrapolate: "No official forecast · 24 h linear extrapolation",
  stormOfficialSource: "GDACS / JTWC report",
  stormMove: (d, v) => `moving ${d} · about ${v} km/h`,
  geoTitle: "See conditions where you are",
  geoDesc: "Allow location and the page switches to your neighbourhood; otherwise it stays on Shanghai.",
  geoAllow: "Allow location", geoSkip: "Keep Shanghai",
  geoLocating: "Locating…",
  geoFail: "Location failed; staying on the current city.",
  geoOK: (n) => `Located: ${n}`,
  myLocation: "My location"
});

/* 2026 年主要流星雨（国际流星组织预报，静态表；每年更新一次） */
const METEORS = [
  { md: "01-04", zh: "象限仪座流星雨", en: "Quadrantids", zhr: 80 },
  { md: "04-23", zh: "天琴座流星雨", en: "Lyrids", zhr: 18 },
  { md: "05-06", zh: "宝瓶座η流星雨", en: "Eta Aquariids", zhr: 50 },
  { md: "08-13", zh: "英仙座流星雨", en: "Perseids", zhr: 100 },
  { md: "10-22", zh: "猎户座流星雨", en: "Orionids", zhr: 20 },
  { md: "11-18", zh: "狮子座流星雨", en: "Leonids", zhr: 15 },
  { md: "12-14", zh: "双子座流星雨", en: "Geminids", zhr: 150 },
  { md: "12-23", zh: "小熊座流星雨", en: "Ursids", zhr: 10 }
];

const S = {
  city: null, data: null, days: [], loading: true, error: null,
  sel: "evening", refreshing: false,
  grid: null, gridScores: null, storms: null, officialTracks: null,
  mapCenter: null, mapError: false, extrasLoading: false
};

const WX = {
  0: ["晴", "Clear", "☀️"], 1: ["大部晴朗", "Mostly clear", "🌤️"], 2: ["多云", "Partly cloudy", "⛅"], 3: ["阴", "Overcast", "☁️"],
  45: ["雾", "Fog", "🌫️"], 48: ["雾凇", "Rime fog", "🌫️"],
  51: ["毛毛雨", "Light drizzle", "🌦️"], 53: ["毛毛雨", "Drizzle", "🌦️"], 55: ["密毛毛雨", "Dense drizzle", "🌦️"],
  56: ["冻毛毛雨", "Freezing drizzle", "🌧️"], 57: ["冻毛毛雨", "Freezing drizzle", "🌧️"],
  61: ["小雨", "Light rain", "🌧️"], 63: ["中雨", "Rain", "🌧️"], 65: ["大雨", "Heavy rain", "🌧️"],
  66: ["冻雨", "Freezing rain", "🌧️"], 67: ["冻雨", "Freezing rain", "🌧️"],
  71: ["小雪", "Light snow", "🌨️"], 73: ["中雪", "Snow", "🌨️"], 75: ["大雪", "Heavy snow", "🌨️"], 77: ["雪粒", "Snow grains", "🌨️"],
  80: ["阵雨", "Light showers", "🌦️"], 81: ["阵雨", "Showers", "🌦️"], 82: ["强阵雨", "Violent showers", "⛈️"],
  85: ["阵雪", "Snow showers", "🌨️"], 86: ["强阵雪", "Heavy snow showers", "🌨️"],
  95: ["雷阵雨", "Thunderstorm", "⛈️"], 96: ["雷暴伴冰雹", "Thunderstorm with hail", "⛈️"], 99: ["强雷暴伴冰雹", "Severe thunderstorm", "⛈️"]
};
function wxOf(code) { return WX[code] || ["—", "—", "🌡️"]; }

const AQI = [
  { max: 20, zh: "优", en: "Good", color: "#2f9e44" },
  { max: 40, zh: "良", en: "Fair", color: "#74b816" },
  { max: 60, zh: "中等", en: "Moderate", color: "#f59f00" },
  { max: 80, zh: "较差", en: "Poor", color: "#e8590c" },
  { max: 100, zh: "很差", en: "Very poor", color: "#c92a2a" },
  { max: 9999, zh: "极差", en: "Extremely poor", color: "#862e9c" }
];
function aqiOf(v) { return AQI.find((a) => v <= a.max) || AQI[AQI.length - 1]; }

const lang = () => (localStorage.getItem("lang") === "en" ? "en" : "zh");
const t = () => T[lang()];

/* ---------- 城市 ---------- */
function loadCity() {
  try {
    const raw = localStorage.getItem(STORE_CITY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
    }
  } catch (e) {}
  return DEFAULT_CITY;
}
function saveCity(c) {
  try { localStorage.setItem(STORE_CITY, JSON.stringify(c)); } catch (e) {}
}
function setCity(c, reload = true) {
  S.city = c;
  saveCity(c);
  markGeoAsked();
  hideGeoPrompt();
  if (reload) loadData();
  else render();
}
function nameOf(c) { return c.label || cityLabel(c, lang()); }

/* ---------- 数据 ---------- */
async function loadData(force = false) {
  window.__skyReady = false;
  window.__skyExtrasReady = false;
  S.loading = !S.data;
  S.refreshing = !!S.data;
  S.error = null;
  S.grid = null; S.gridScores = null; S.storms = null; S.officialTracks = null; S.mapCenter = null; S.mapError = false;
  render();
  try {
    const data = await loadSky(S.city.lat, S.city.lon, { force });
    S.data = data;
    const now = new Date();
    S.days = [0, 1, 2].map((i) => evaluate(data, S.city, new Date(now.getTime() + i * 86400000)));
    S.loading = false;
    S.refreshing = false;
    window.__skyReady = true;
    render();
    loadExtras(force);
  } catch (e) {
    S.loading = false;
    S.refreshing = false;
    S.error = e;
    S.mapError = true;
    window.__skyReady = true;
    window.__skyExtrasReady = true;
    render();
  }
}

/* 地图网格 + 台风：不阻塞首屏评分 */
async function loadExtras(force = false) {
  const ev = S.days[0];
  if (!ev) return;
  S.extrasLoading = true;
  renderMapSection();
  const [g, s, o] = await Promise.allSettled([
    loadGrid(S.city.lat, S.city.lon, { force }),
    loadStorms({ force }),
    loadOfficialTracks({ force, lat: S.city.lat, lon: S.city.lon })
  ]);
  if (g.status === "fulfilled") {
    S.grid = g.value;
    const raw = scoreGrid(g.value, ev.sun.sunset, ev.evening ? ev.evening.ctx.aod : 0.2);
    /* 偏差校正：网格是 ECMWF 确定性，首页主分是集合中位数。
       不加这一步会出现「卡片 65、地图上上海 38」的自相矛盾。 */
    const ecModel = ev.evening && ev.evening.models
      ? ev.evening.models.find((m) => m.id === "ecmwf_ifs025") : null;
    /* 偏差限幅 ±25：模型分歧极大时（今天 ECMWF 20、集合 68）
       不设上限会把整张图推到 100 分。 */
    const offset = (ev.evening && ev.evening.ensMedian != null && ecModel)
      ? Math.max(-25, Math.min(25, ev.evening.ensMedian - ecModel.score)) : 0;
    /* 上限锁在中心点评分 +30：区域网格只用来表达「哪里相对更好」，
       不能让北边某个格点显示 95 分、而卡片上上海只有 25%，
       那会直接误导。11-10 这类真正的好晚霞（中心 76）不受影响。 */
    const cap = Math.min(100, (ev.evening ? ev.evening.score : 50) + 30);
    S.gridScores = raw.map((p) => ({
      ...p,
      score: Math.max(0, Math.min(cap, p.score + offset))
    }));
    S.mapError = false;
  } else {
    console.warn("grid", g.reason);
    S.mapError = true;
  }
  const tracks = o.status === "fulfilled" ? (o.value.list || []) : [];
  S.officialTracks = tracks;
  const base = s.status === "fulfilled" ? s.value.list.slice() : [];
  const used = new Set();
  for (const st of base) {
    const m = matchOfficialTrack(st, tracks);
    if (m) { st.official = m; used.add(m.id); }
  }
  // EONET 未收录、但 GDACS 有官方预报的现役气旋也补进列表
  for (const t of tracks) {
    if (used.has(t.id) || !t.future || t.future.length < 2) continue;
    const last = t.past[t.past.length - 1] || t.points[t.points.length - 1];
    base.push({
      id: "gdacs-" + t.id,
      title: (t.eventname || t.name || "TC").replace(/-\d{2}$/, ""),
      lat: last.lat, lon: last.lon,
      date: new Date(last.t).toISOString(),
      track: t.past.map((p) => ({ lat: p.lat, lon: p.lon, date: new Date(p.t).toISOString() })),
      official: t,
      link: t.url,
      gdacsOnly: true
    });
  }
  S.storms = base;
  S.extrasLoading = false;
  window.__skyExtrasReady = true;
  renderMapSection();
  renderStorms();
}

/* ---------- 渲染：首屏 ---------- */
function renderHero() {
  const ev = S.days[0];
  $("#cityName").textContent = nameOf(S.city);
  if (!ev) {
    $("#verdictTitle").textContent = t().loadingTitle;
    $("#verdictText").textContent = S.error ? t().error : t().loadingText;
    $("#dateLabel").textContent = "—";
    $("#updateTime").textContent = "—";
    return;
  }
  $("#dateLabel").textContent = dateLabel(ev);
  const v = verdict(ev);
  $("#verdictTitle").textContent = v.title;
  $("#verdictText").textContent = v.text;
  const upd = S.data && S.data.updated ? new Date(S.data.updated) : null;
  $("#updateTime").textContent = upd
    ? `${t().updated} ${fmtHM(upd, 8)}${t().tzTag}${S.data.cached ? t().cachedTag : ""}`
    : "—";
  const rb = $("#refreshBtn");
  if (rb) { rb.textContent = S.refreshing ? t().updating : t().refresh; rb.disabled = S.refreshing; }
  const gb = $("#geoBtn");
  if (gb) gb.textContent = t().geo;
}

function dateLabel(ev) {
  const [y, m, d] = ev.ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const w = t().week[dt.getUTCDay()];
  return lang() === "en" ? `${m}/${d} · ${w}` : `${m} 月 ${d} 日 · ${w}`;
}

function verdict(ev) {
  const L = t();
  const e = ev.evening, m0 = ev.morning, st = ev.star, mo = ev.moon;
  const sunset = fmtHM(ev.sun.sunset);
  let title;
  if (e && e.prob >= 65) title = lang() === "en" ? "Worth going out tonight" : "今晚值得出门";
  else if (e && e.prob >= 40) title = lang() === "en" ? "Worth a gamble tonight" : "今晚可以赌一把";
  else if (st && st.score >= 65) title = lang() === "en" ? "Glow is meh, but the stars are good" : "晚霞一般，但星空不错";
  else if (mo && mo.score >= 65) title = lang() === "en" ? "Glow is meh, but the Moon is worth a look" : "晚霞一般，但月亮值得看";
  else if (m0 && m0.prob >= 55) title = lang() === "en" ? "Tonight is meh — tomorrow morning looks better" : "今晚一般，明早更有戏";
  else title = lang() === "en" ? "Not much of a show tonight" : "今晚希望不大";

  const parts = [];
  if (e) {
    parts.push(lang() === "en"
      ? `Sunset ${sunset}, ${e.prob}% chance of a fire-cloud glow (model agreement: ${L["conf" + cap(e.confidence)]}).`
      : `日落 ${sunset}，火烧云概率 ${e.prob}%（模式一致性${L["conf" + cap(e.confidence)]}）。`);
    parts.push(cloudSentence(e));
  }
  if (st) {
    parts.push(lang() === "en"
      ? `Star score ${round(st.score)}${st.score < 50 ? ` — ${L.bortleNote}` : ""}; moon ${phaseName(mo.phase)[lang() === "en" ? "en" : "zh"].toLowerCase()}, ${mo.visible ? L.moonUp : L.moonDown}.`
      : `星空指数 ${round(st.score)}${st.score < 50 ? `，${L.bortleNote}` : ""}；月亮${phaseName(mo.phase).zh}，${mo.visible ? L.moonUp : L.moonDown}。`);
  }
  // 今晚没戏时，把希望指向未来两天，避免页面只剩一句“没戏”
  if (e && e.prob < 30) {
    const later = S.days.slice(1).filter((d) => d.evening).sort((a, b) => b.evening.prob - a.evening.prob)[0];
    if (later && later.evening.prob >= 30) {
      const [yy, mm, dd] = later.ymd.split("-").map(Number);
      parts.push(lang() === "en"
        ? ` Better luck on ${mm}/${dd}: ${later.evening.prob}%.`
        : `可以留意 ${mm} 月 ${dd} 日：火烧云概率 ${later.evening.prob}%。`);
    }
  }
  return { title, text: parts.join("") };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function cloudSentence(e) {
  const c = e.cloud || {};
  const h = c.high, mid = c.mid, low = c.low;
  const en = lang() === "en";
  if (!Number.isFinite(h)) return "";
  if (h < 10 && mid < 12) return en ? "Too little high or mid cloud — nothing for the sun to light up." : "高云和中云都太少，天上没有可以烧的云。";
  if (h > 85) return en ? "High cloud is too thick for sunlight to get through." : "高云太厚，阳光透不下来。";
  if (low > 70) return en ? "Low cloud is thick — the horizon is likely blocked." : "低云很厚，地平线大概率被挡住。";
  if (e.ctx && e.ctx.precip > 60) return en ? "Rain is likely around sunset, which usually flattens the cloud deck." : "日落前后有降水，云层会压得很低。";
  if (mid > 85) return en ? "Mid-level cloud is nearly overcast — the sun is likely hidden." : "中云接近满云，太阳大概率被挡住。";
  return en
    ? `High ${round(h)}%, mid ${round(mid)}%, low ${round(low)}% — a workable cloud structure.`
    : `高云 ${round(h)}%、中云 ${round(mid)}%、低云 ${round(low)}%，云的结构还算合适。`;
}

/* ---------- 渲染：四张卡 ---------- */
function renderCards() {
  const box = $("#cards");
  if (S.loading) {
    box.innerHTML = Array.from({ length: 4 }).map(() => `<div class="sky-card"><div class="sky-skeleton" style="height:12px;width:40%;margin-bottom:12px"></div><div class="sky-skeleton" style="height:34px;width:60%;margin-bottom:10px"></div><div class="sky-skeleton" style="height:10px;width:80%"></div></div>`).join("");
    return;
  }
  if (S.error || !S.days[0]) {
    box.innerHTML = `<div class="sky-error" style="grid-column:1/-1">${t().error} <button class="sky-link" id="retryBtn">${t().retry}</button></div>`;
    const b = $("#retryBtn"); if (b) b.onclick = () => loadData(true);
    return;
  }
  const ev = S.days[0];
  const items = [
    { key: "evening", label: t().evening, value: ev.evening.prob, unit: "%", sub: `${t().index} ${round(ev.evening.score)} · ${confText(ev.evening.confidence)}`, meter: ev.evening.prob, tone: tone(ev.evening.prob, 60, 35) },
    { key: "morning", label: t().morning, value: ev.morning.prob, unit: "%", sub: `${t().index} ${round(ev.morning.score)} · ${confText(ev.morning.confidence)}`, meter: ev.morning.prob, tone: tone(ev.morning.prob, 60, 35) },
    { key: "star", label: t().star, value: round(ev.star.score), unit: "", sub: `${lang() === "en" ? "cloud" : "云量"} ${round(ev.star.cloud)}% · ${lang() === "en" ? "moon" : "月光"} ${round(ev.star.moon.illum * 100)}%`, meter: ev.star.score, tone: tone(ev.star.score, 65, 40) },
    { key: "moon", label: t().moon, value: round(ev.moon.score), unit: "", sub: `${phaseName(ev.moon.phase)[lang() === "en" ? "en" : "zh"]} · ${ev.moon.visible ? t().moonUp : t().moonDown}`, meter: ev.moon.score, tone: tone(ev.moon.score, 65, 40) }
  ];
  box.innerHTML = items.map((it) => `
    <button class="sky-card ${S.sel === it.key ? "on" : ""}" data-card="${it.key}" type="button">
      <div class="sky-card-label"><span class="sky-pill ${it.tone}">${it.label}</span></div>
      <div class="sky-card-value">${it.value}<small>${it.unit || ""}</small></div>
      <div class="sky-card-sub">${it.sub}</div>
      <div class="sky-card-meter"><i style="width:${Math.max(2, it.meter)}%;background:var(--sky-${it.tone === "good" ? "good" : it.tone === "mid" ? "mid" : "bad"})"></i></div>
    </button>`).join("");
  $$("[data-card]", box).forEach((b) => b.onclick = () => { S.sel = b.dataset.card; renderCards(); renderDetail(); });
}
function tone(v, good, mid) { return v >= good ? "good" : v >= mid ? "mid" : "bad"; }
function confText(c) {
  return lang() === "en" ? `${t()["conf" + cap(c)]} model agreement` : `模式一致性${t()["conf" + cap(c)]}`;
}

/* ---------- 渲染：时间轴 ----------
   柱高 = 云量（越低越通透，沿用原有信息）；颜色 = 逐小时温度（冷蓝 → 暖橙）；
   降水概率高的时段加紫线，PM2.5 偏高时加灰雾罩，日落/日出加暖色高亮。
   底部一条温度渐变带让整块随时间「变色」，并配图例说明。 */
/* 色带按「当天温差」铺满：即使全天只差 3℃，也能看出冷暖节奏。
   蓝(222°) = 当天最凉，经过青绿/黄，橙红(8°) = 当天最暖。
   真实温度仍显示在刻度与悬浮提示里，语义不丢。 */
const HUE_COLD = 222, HUE_WARM = 8;
function tempCss(k, light, alpha) {
  const h = Math.round(HUE_COLD + (HUE_WARM - HUE_COLD) * Math.max(0, Math.min(1, k)));
  const s = light ? 58 : 56;
  const l = light ? 62 : 58;
  return `hsla(${h},${s}%,${l}%,${alpha})`;
}

function renderTimeline() {
  const box = $("#timeline");
  $("#tlHint").textContent = t().tlHint;
  if (!S.days[0] || !S.data) { box.innerHTML = `<div class="sky-skeleton" style="height:140px"></div>`; return; }
  const ev = S.days[0];
  const dayStart = ev.date.getTime();
  const start = dayStart + 12 * 3600e3;
  const ctx = S.data.ctx || {};
  const air = S.data.air;
  const interps = S.data.models.map((m) => interpolator(S.data.times, m.cloud.total));
  const precipAt = interpolator(ctx.times, ctx.precip);
  const tempAt = interpolator(ctx.times, ctx.temp);
  const pmAt = air ? interpolator(air.times, air.pm25) : () => null;
  const aodAt = air ? interpolator(air.times, air.aod) : () => null;
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const hours = [];
  for (let i = 0; i < 24; i++) {
    const at = new Date(start + i * 3600e3);
    const vals = interps.map((f) => f(at)).filter((v) => v != null);
    const cloud = vals.length ? vals.sort((a, b) => a - b)[vals.length >> 1] : 0;
    const precip = precipAt(at) || 0;
    const temp = tempAt(at);
    const pm = pmAt(at);
    const aod = aodAt(at);
    // 夜间：今日日落后 → 次日日出前（时间轴为今日 12:00 至次日 12:00）
    const sunset = ev.sun.sunset ? ev.sun.sunset.getTime() : null;
    const sunrise = ev.sunTomorrow && ev.sunTomorrow.sunrise ? ev.sunTomorrow.sunrise.getTime() : null;
    const night = sunset != null && sunrise != null
      ? at.getTime() >= sunset && at.getTime() < sunrise
      : false;
    hours.push({ at, cloud, precip, temp, pm, rain: precip >= 55,
      haze: (pm != null && pm >= 75) || (aod != null && aod >= 0.55), night,
      nearSun: [ev.sun.sunset, ev.sun.sunrise].some((d) => d && Math.abs(d - at) < 45 * 60000) });
  }
  const temps = hours.map((x) => x.temp).filter((v) => v != null && Number.isFinite(v));
  const tMin = temps.length ? Math.min(...temps) : 0;
  const tMax = temps.length ? Math.max(...temps) : 1;
  const tSpan = Math.max(1.2, tMax - tMin); // 温差过小时仍保留一点色彩跨度
  const kOf = (c) => c == null ? 0.5 : (c - tMin) / tSpan;

  const bars = [], bandStops = [], nightStops = [];
  hours.forEach((m, i) => {
    const k = kOf(m.temp);
    const col = tempCss(k, !dark, 1);
    const band = tempCss(k, !dark, dark ? 0.34 : 0.28);
    bandStops.push(`${band} ${(i / 24 * 100).toFixed(2)}%, ${band} ${((i + 1) / 24 * 100).toFixed(2)}%`);
    nightStops.push(`${m.night ? "rgba(24,34,74,.30)" : "rgba(24,34,74,0)"} ${(i / 24 * 100).toFixed(2)}%, ${m.night ? "rgba(24,34,74,.30)" : "rgba(24,34,74,0)"} ${((i + 1) / 24 * 100).toFixed(2)}%`);
    const h = Math.max(3, Math.min(100, m.cloud));
    const tip = `${fmtHM(m.at)} · ${t().tlCloud} ${round(m.cloud)}%`
      + (m.temp != null ? ` · ${round(m.temp)}°C` : "")
      + (m.precip > 0 ? ` · ${t().tlRain} ${round(m.precip)}%` : "")
      + (m.pm != null ? ` · PM2.5 ${round(m.pm)}` : "");
    bars.push(`<div class="sky-bar ${m.nearSun ? "sun" : ""} ${m.rain ? "rain" : ""} ${m.haze ? "haze" : ""} ${m.night ? "night" : ""}" title="${tip}"><i style="height:${h}%;background:${col};opacity:${(0.46 + m.cloud / 100 * 0.52).toFixed(2)}"></i></div>`);
  });
  // 温度渐变底带（24 段，随时间变色）
  const band = `<div class="sky-temp-band" style="background:linear-gradient(90deg,${bandStops.join(",")})"></div>`
    + `<div class="sky-night-band" style="background:linear-gradient(90deg,${nightStops.join(",")})"></div>`;
  // 底部温度数值标注（每 6 小时一个）
  const tMarks = [0, 6, 12, 18].map((i) => {
    const m = hours[i];
    return `<span style="left:${(i / 24 * 100 + 2).toFixed(2)}%">${m.temp == null ? "—" : round(m.temp) + "°"}</span>`;
  }).join("");
  const ticks = [];
  const push = (date, label) => {
    if (!date) return;
    const k = (date.getTime() - start) / (24 * 3600e3);
    if (k < -0.01 || k > 1.01) return;
    ticks.push({ k, date, label });
  };
  push(ev.sun.sunset, t().sunset);
  push(ev.sun.civilDusk, t().blueHour);
  const moonT = S.days[0].moon;
  if (moonT && moonT.rise) push(moonT.rise, t().moonrise);
  push(ev.sunTomorrow.sunrise, t().sunrise);
  const uniq = [];
  for (const tk of ticks.sort((a, b) => a.k - b.k)) {
    if (!uniq.some((u) => Math.abs(u.k - tk.k) < 0.012)) uniq.push(tk);
  }
  const axis = uniq.map((tk, i) => `<div class="sky-tick ${i % 2 ? "alt" : ""} ${i === 0 ? "first" : ""} ${i === uniq.length - 1 ? "last" : ""}" style="left:${(tk.k * 100).toFixed(2)}%"><b>${fmtHM(tk.date)}</b>${tk.label}</div>`).join("");
  const now = Date.now();
  const nowK = (now - start) / (24 * 3600e3);
  const nowLine = nowK >= 0 && nowK <= 1 ? `<div class="sky-now" style="left:${(nowK * 100).toFixed(2)}%"><span>${t().now}</span></div>` : "";
  const legend = `<div class="sky-tl-legend">
    <span><i class="lg-temp"></i>${t().tlLgTemp}</span>
    <span><i class="lg-cloud"></i>${t().tlLgCloud}</span>
    <span><i class="lg-rain"></i>${t().tlLgRain}</span>
    <span><i class="lg-haze"></i>${t().tlLgHaze}</span>
    <span><i class="lg-night"></i>${t().tlLgNight}</span>
  </div>`;
  box.innerHTML = `<div class="sky-bars-wrap">${band}<div class="sky-bars">${bars.join("")}</div>${nowLine}<div class="sky-temp-marks">${tMarks}</div></div><div class="sky-axis">${axis}</div>${legend}`;
}

/* ---------- 渲染：因子解释 ---------- */
const FACTORS = {
  evening: [
    ["high", 30], ["mid", 18], ["low", 22], ["vis", 10], ["aod", 8], ["precip", 7], ["dew", 5]
  ],
  morning: [
    ["high", 30], ["mid", 18], ["low", 22], ["vis", 10], ["aod", 8], ["precip", 7], ["dew", 5]
  ],
  star: [["cloud", 45], ["moon", 25], ["vis", 12], ["dew", 8], ["light", 10]],
  moon: [["illum", 35], ["alt", 30], ["cloud", 35]]
};
const FNAME = {
  zh: { high: "高云", mid: "中云", low: "低云", vis: "能见度", aod: "气溶胶", precip: "降水概率", dew: "露点差", cloud: "云量", moon: "月光干扰", light: "光污染", illum: "月相亮度", alt: "月亮高度" },
  en: { high: "High cloud", mid: "Mid cloud", low: "Low cloud", vis: "Visibility", aod: "Aerosol", precip: "Rain chance", dew: "Dew spread", cloud: "Cloud", moon: "Moonlight", light: "Light pollution", illum: "Illumination", alt: "Moon altitude" }
};

function renderDetail() {
  const ev = S.days[0];
  const tabs = $("#detailTabs");
  const keys = ["evening", "morning", "star", "moon"];
  tabs.innerHTML = keys.map((k) => `<button role="tab" class="${S.sel === k ? "on" : ""}" data-tab="${k}">${t()[k]}</button>`).join("");
  $$("[data-tab]", tabs).forEach((b) => b.onclick = () => { S.sel = b.dataset.tab; renderCards(); renderDetail(); });
  const body = $("#detailBody");
  if (!ev) { body.innerHTML = `<div class="sky-skeleton" style="height:120px"></div>`; return; }
  const isGlow = S.sel === "evening" || S.sel === "morning";
  const node = isGlow ? ev[S.sel] : ev[S.sel];
  if (!node) { body.innerHTML = "<p class='sky-hint'>—</p>"; return; }
  const factors = FACTORS[S.sel];
  const scores = node.factors || {};
  const raw = isGlow && node.cloud
    ? { high: node.cloud.high, mid: node.cloud.mid, low: node.cloud.low,
        vis: node.ctx.visibility, aod: node.ctx.aod, precip: node.ctx.precip, dewDep: node.ctx.dewDep }
    : {};
  const rows = factors.map(([k, w]) => {
    const s = scores[k] || 0;
    const val = rawText(k, raw, node, ev);
    return `<div class="sky-factor">
      <div class="sky-factor-name">${FNAME[lang()][k]}<em>${w}%</em></div>
      <div class="sky-track"><i class="sky-fill" style="width:${Math.max(2, s).toFixed(0)}%;background:var(--sky-bar-${s >= 70 ? "good" : s >= 45 ? "mid" : "bad"})"></i></div>
      <div class="sky-factor-val">${val}</div>
    </div>`;
  }).join("");
  const bestHM = node.when ? fmtHM(node.when, 8) : null;
  const winHM = node.window ? `${fmtHM(node.window.start, 8)}–${fmtHM(node.window.end, 8)}` : null;
  const above = node.models ? node.models.filter((m) => m.score >= 60).length : 0;
  const head = isGlow
    ? (lang() === "en"
      ? `<b>${node.prob}%</b> chance · typical ${round(node.score)}${bestHM ? ` · best ${bestHM}` : ""}${winHM ? ` · window ${winHM}` : ""} · ${above}/${node.models.length} models ≥60`
      : `<b>${node.prob}%</b> 概率 · 典型 ${round(node.score)}${bestHM ? ` · 最佳 ${bestHM}` : ""}${winHM ? ` · 可看 ${winHM}` : ""} · ${above}/${node.models.length} 个模式 ≥60 分`)
    : `<b>${round(node.score)}</b> ${t().index}`;
  body.innerHTML = `<div class="sky-detail-head">${head}</div>${rows}<ul class="sky-explain">${whyList(ev, S.sel).map((x) => `<li>${x}</li>`).join("")}</ul>`;
}
function rawText(k, raw, node, ev) {
  const en = lang() === "en";
  if (k === "high" || k === "mid" || k === "low") return raw[k] != null ? round(raw[k]) + "%" : "—";
  if (k === "vis") return raw.vis != null ? raw.vis.toFixed(0) + " km" : "—";
  if (k === "aod") return raw.aod != null ? "AOD " + raw.aod.toFixed(2) : "—";
  if (k === "precip") return raw.precip != null ? round(raw.precip) + "%" : "—";
  if (k === "dew") return raw.dewDep != null ? raw.dewDep.toFixed(1) + (en ? "℃" : "℃") : "—";
  if (k === "cloud") return node.cloud != null ? round(node.cloud) + "%" : "—";
  if (k === "moon") return node.moon ? round(node.moon.illum * 100) + "%" : "—";
  if (k === "light") return "Bortle " + (ev && ev.bortle != null ? ev.bortle : "—");
  if (k === "illum") return round(node.illum * 100) + "%";
  if (k === "alt") return round(node.alt) + "°";
  return "—";
}
function whyList(ev, sel) {
  const en = lang() === "en";
  const out = [];
  if (sel === "evening" || sel === "morning") {
    const n = ev[sel], c = n.cloud, x = n.ctx;
    if (c.high < 10) out.push(en ? "No high cloud: there is no canvas for a fire-cloud glow." : "高云不足 10%，天上没有可以烧的云。");
    else if (c.high > 85) out.push(en ? "High cloud is over 85%: too thick for light to pass." : "高云超过 85%，太厚，阳光透不下来。");
    else out.push(en ? `High cloud ${round(c.high)}% — in the sweet spot for catching light.` : `高云 ${round(c.high)}%，正处在“能被点亮”的区间。`);
    if (c.low > 50) out.push(en ? `Low cloud ${round(c.low)}%: the horizon is likely blocked.` : `低云 ${round(c.low)}%，西边/东边地平线大概率被挡住。`);
    else out.push(en ? `Low cloud only ${round(c.low)}%: the horizon stays open.` : `低云只有 ${round(c.low)}%，地平线比较通透。`);
    if (x.aod > 0.6) out.push(en ? `Aerosol AOD ${x.aod.toFixed(2)}: colours will look grey and muddy.` : `气溶胶 AOD ${x.aod.toFixed(2)}，颜色会发灰。`);
    else if (x.aod < 0.08) out.push(en ? `Aerosol AOD ${x.aod.toFixed(2)}: very clean air, colours may be pale.` : `气溶胶 AOD ${x.aod.toFixed(2)}，空气很干净，颜色可能偏淡。`);
    else out.push(en ? `Aerosol AOD ${x.aod.toFixed(2)}: enough particles to add warmth.` : `气溶胶 AOD ${x.aod.toFixed(2)}，颗粒物适中，容易出暖色。`);
    out.push(en ? `Model spread is ${round(n.spread)} points — agreement ${t()["conf" + cap(n.confidence)]}.` : `模式之间的分歧为 ${round(n.spread)} 分，一致性${t()["conf" + cap(n.confidence)]}。`);
  } else if (sel === "star") {
    out.push(en ? `Average cloud ${round(ev.star.cloud)}%.` : `夜间平均云量 ${round(ev.star.cloud)}%。`);
    out.push(en ? `Moon ${round(ev.star.moon.illum * 100)}% illuminated, ${round(ev.star.moon.alt)}° high.` : `月亮被照亮 ${round(ev.star.moon.illum * 100)}%，高度 ${round(ev.star.moon.alt)}°。`);
    out.push(`Bortle ${ev.bortle}：${en ? (ev.bortle >= 6 ? "city sky, only bright stars and planets." : "reasonably dark sky.") : (ev.bortle >= 6 ? "市区天空，只能看到亮星和行星。" : "天空较暗，银河有机会。")}`);
  } else {
    out.push(en ? `Phase: ${phaseName(ev.moon.phase).en}, ${round(ev.moon.illum * 100)}% illuminated.` : `月相：${phaseName(ev.moon.phase).zh}，亮度 ${round(ev.moon.illum * 100)}%。`);
    out.push(en ? `Max altitude tonight ${round(ev.moon.alt)}°.` : `今晚最高高度 ${round(ev.moon.alt)}°。`);
    out.push(ev.moon.visible ? (en ? "The Moon is above the horizon tonight." : "今晚月亮在地平线以上，能看到。") : (en ? "The Moon stays below the horizon tonight." : "今晚月亮整夜在地平线以下，看不到。"));
  }
  return out;
}

/* ---------- 渲染：模式表 ---------- */
function renderModels() {
  const box = $("#modelTable");
  $("#mHint").textContent = t().mHint;
  const ev = S.days[0];
  if (!ev) { box.innerHTML = `<div class="sky-skeleton" style="height:180px"></div>`; return; }
  const e = ev.evening;
  const rows = e.models.map((m) => {
    const tone = m.score >= 60 ? "good" : m.score >= 40 ? "mid" : "bad";
    return `<tr>
      <td>${m.label}<span class="sky-org">${lang() === "en" ? m.label : m.zh}</span></td>
      <td>${round(m.cloud.high)}%</td><td>${round(m.cloud.mid)}%</td><td>${round(m.cloud.low)}%</td>
      <td>${round(m.score)}</td>
      <td><span class="sky-pill ${tone}">${t()[tone]}</span></td>
    </tr>`;
  }).join("");
  let metRow = "";
  if (S.data.metno) {
    const f = interpolator(S.data.metno.times, S.data.metno.cloud);
    const v = f(ev.sun.sunset);
    if (v != null) metRow = `<tr><td>met.no<span class="sky-org">${lang() === "en" ? "Norway" : "挪威气象局"}</span></td><td colspan="3" style="color:var(--ui-ink3)">${lang() === "en" ? "total cloud" : "总云量"} ${round(v)}%</td><td>—</td><td><span class="sky-pill mid">${t().crossCheck}</span></td></tr>`;
  }
  box.innerHTML = `<div class="sky-table-wrap"><table class="sky-table">
    <thead><tr><th>${t().model}</th><th>${t().high}</th><th>${t().mid2}</th><th>${t().low}</th><th>${t().score}</th><th>${t().view}</th></tr></thead>
    <tbody>${rows}${metRow}</tbody></table></div>
    <p class="sky-ens-note">${t().tableNote}</p>`;
}

/* ---------- 渲染：集合分布 ---------- */
function renderEnsemble() {
  const box = $("#ensembleBox");
  const ev = S.days[0];
  if (!ev || !S.data || !S.data.ensemble || !ev.evening) {
    box.innerHTML = `<div class="sky-ensemble"><p class="sky-ens-note">${t().ensNone}</p></div>`;
    return;
  }
  const e = ev.evening;
  const c = { visibility: e.ctx.visibility, aod: e.ctx.aod, precip: e.ctx.precip, dewDep: e.ctx.dewDep };
  const at = (arr) => interpolator(S.data.ensemble.times, arr)(ev.sun.sunset);
  const vals = [];
  for (const mem of S.data.ensemble.members) {
    const low = at(mem.low), mid = at(mem.mid), high = at(mem.high);
    if (low == null && mid == null && high == null) continue;
    vals.push(glowFactors({ low, mid, high }, c).total);
  }
  if (!vals.length) { box.innerHTML = `<div class="sky-ensemble"><p class="sky-ens-note">${t().ensNone}</p></div>`; return; }
  vals.sort((a, b) => a - b);
  const n = vals.length;
  const k = vals.filter((v) => v >= 60).length;
  const p = Math.round(k / n * 100);
  const dots = vals.map((v, i) => `<i class="${v >= 60 ? "on" : ""}" style="left:${((i + 0.5) / n * 100).toFixed(2)}%;bottom:${Math.max(0, Math.min(100, v)).toFixed(1)}%"></i>`).join("");
  box.innerHTML = `<div class="sky-ensemble">
    <div class="sky-ens-head"><span>${t().ensTitle}</span><span>${n} ${lang() === "en" ? "members · each dot is one member" : "个成员 · 每个点是一个成员"}</span></div>
    <div class="sky-ens-plot"><div class="sky-ens-threshold"><span>60</span></div>${dots}</div>
    <p class="sky-ens-note">${t().ensNote(n, k, p)}</p>
  </div>`;
}

/* ---------- 渲染：未来三天 ---------- */
function renderDays() {
  const box = $("#days");
  if (!S.days.length) { box.innerHTML = `<div class="sky-skeleton" style="height:120px"></div>`; return; }
  box.innerHTML = S.days.map((ev, i) => {
    const label = i === 0 ? t().today : i === 1 ? t().tomorrow : t().dayAfter;
    const [y, m, d] = ev.ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const w = t().week[dt.getUTCDay()];
    return `<div class="sky-day">
      <h3>${label}<span>${m}/${d} · ${w}</span></h3>
      <div class="sky-day-row"><span>${t().evening}</span><b>${ev.evening ? ev.evening.prob + "%" : "—"}</b></div>
      <div class="sky-day-row"><span>${t().morning}</span><b>${ev.morning ? ev.morning.prob + "%" : "—"}</b></div>
      <div class="sky-day-row"><span>${t().star}</span><b>${round(ev.star.score)}</b></div>
      <div class="sky-day-row"><span>${t().moon}</span><b>${round(ev.moon.score)}</b></div>
    </div>`;
  }).join("");
}

/* ---------- 渲染：近期流星雨 ---------- */
function renderEvents() {
  const el = $("#skyEvents");
  const ev = S.days[0];
  if (!ev) { el.textContent = ""; return; }
  const [ty, tm, td] = ev.ymd.split("-").map(Number);
  const todayKey = tm * 100 + td;
  const list = METEORS.map((m) => {
    const [mm, dd] = m.md.split("-").map(Number);
    const nextYear = mm * 100 + dd < todayKey;
    const y = nextYear ? ty + 1 : ty;
    const days = Math.round((Date.UTC(y, mm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000);
    return { ...m, mm, dd, y, days };
  }).sort((a, b) => a.days - b.days).slice(0, 2);
  const en = lang() === "en";
  const parts = list.map((m) => {
    const date = en ? `${m.mm}/${m.dd}` : `${m.mm} 月 ${m.dd} 日`;
    const when = m.days === 0 ? (en ? "tonight" : "就在今晚") : (en ? `in ${m.days} days` : `还有 ${m.days} 天`);
    return `<b>${date}</b> ${en ? m.en : m.zh}${en ? "" : "极大"}（ZHR ${m.zhr}，${when}）`;
  });
  el.innerHTML = `🌠 ${en ? "Next up" : "近期天象"}：${parts.join('<span class="sep">·</span>')}`;
}

/* ---------- 渲染：晚霞地图 ---------- */
async function renderMapSection() {
  const el = $("#skyMap");
  if (!el) return;
  $("#mapTitle").textContent = S.mapCenter ? t().mapStormTitle : t().mapTitle;
  $("#mapHint").innerHTML = S.mapCenter
    ? `<button class="sky-link" id="mapReset" type="button">${t().mapReset}</button>`
    : t().mapHint;
  const rb = $("#mapReset");
  if (rb) rb.onclick = () => { S.mapCenter = null; renderMapSection(); };

  if (!S.gridScores || !S.gridScores.length) {
    setMapLoading(S.mapError ? t().mapFail : t().mapLoading);
    return;
  }
  setMapLoading(null);
  updateLiveMap({
    city: S.city,
    cityLabel: nameOf(S.city),
    cities: CITIES,
    points: S.gridScores,
    storms: S.storms || [],
    lang: lang(),
    focus: S.mapCenter
  });
}

/* ---------- 渲染：天气与空气 ---------- */
function renderWeather() {
  const box = $("#weather");
  if (!S.data) { box.innerHTML = `<div class="sky-skeleton" style="height:160px"></div>`; return; }
  const cur = S.data.ctx.current;
  const dd = S.data.ctx.dailyDetail;
  const aq = S.data.air && S.data.air.current;
  if (!cur && !dd) { box.innerHTML = `<p class="sky-hint">—</p>`; return; }
  const en = lang() === "en";
  const code = cur ? cur.weather_code : (dd ? dd.weather_code[0] : 0);
  const wx = wxOf(code);
  const temp = cur ? Math.round(cur.temperature_2m) : "—";
  const feels = cur ? Math.round(cur.apparent_temperature) : "—";
  const facts = [];
  if (cur) {
    facts.push(`${t().feels} ${feels}°`);
    facts.push(`${t().humidity} ${Math.round(cur.relative_humidity_2m)}%`);
    facts.push(`${t().wind} ${windName(cur.wind_direction_10m, en)} ${Math.round(cur.wind_speed_10m)} km/h`);
    facts.push(`${t().cloudCover} ${Math.round(cur.cloud_cover)}%`);
    const vis = interpolator(S.data.ctx.times, S.data.ctx.visibility)(Date.now());
    if (vis != null) facts.push(`${t().vis} ${vis.toFixed(0)} km`);
  }
  let aqHtml = "";
  if (aq && Number.isFinite(aq.european_aqi)) {
    const band = aqiOf(aq.european_aqi);
    aqHtml = `<div class="sky-aq" style="--c:${band.color}">
      <div class="sky-aq-score"><b>${Math.round(aq.european_aqi)}</b><span>${en ? band.en : band.zh}</span></div>
      <div class="sky-aq-meta">
        <span>PM2.5 <b>${round(aq.pm2_5)}</b></span><span>PM10 <b>${round(aq.pm10)}</b></span>
        <span>O₃ <b>${round(aq.ozone)}</b></span><span>NO₂ <b>${round(aq.nitrogen_dioxide)}</b></span>
      </div>
      <div class="sky-aq-label">${t().air} · AQI</div>
    </div>`;
  }
  let daysHtml = "";
  if (dd && dd.time) {
    daysHtml = dd.time.slice(0, 3).map((d, i) => {
      const w = wxOf(dd.weather_code[i]);
      const label = i === 0 ? t().today : i === 1 ? t().tomorrow : t().dayAfter;
      return `<div class="sky-wx-day">
        <span>${label}</span>
        <b>${w[2]} ${Math.round(dd.temperature_2m_max[i])}° / ${Math.round(dd.temperature_2m_min[i])}°</b>
        <em>${Math.round(dd.precipitation_probability_max[i] || 0)}%</em>
      </div>`;
    }).join("");
  }
  box.innerHTML = `<div class="sky-wx-top">
      <div class="sky-wx-icon">${wx[2]}</div>
      <div class="sky-wx-temp"><b>${temp}°</b><span>${en ? wx[1] : wx[0]}</span></div>
      <div class="sky-wx-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</div>
    </div>
    ${aqHtml}
    ${daysHtml ? `<div class="sky-wx-days">${daysHtml}</div>` : ""}`;
}
function windName(deg, en) {
  const dirsZh = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const dirsEn = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  if (!Number.isFinite(deg)) return "—";
  const i = Math.round(deg / 45) % 8;
  return en ? dirsEn[i] : dirsZh[i] + "风";
}

/* ---------- 渲染：台风 ---------- */
function stormMotion(s) {
  const t = (s.track || []).filter((p) => p && p.date);
  if (t.length < 2) return null;
  const a = t[Math.max(0, t.length - 5)];
  const b = t[t.length - 1];
  const hrs = (new Date(b.date) - new Date(a.date)) / 3600000;
  if (!(hrs > 0)) return null;
  const km = distKm(a.lat, a.lon, b.lat, b.lon);
  const dx = (b.lon - a.lon) * Math.cos((b.lat * Math.PI) / 180);
  const dy = b.lat - a.lat;
  const brg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  const i = Math.round(brg / 45) % 8;
  return {
    kmh: Math.round(km / hrs),
    zh: ["北", "东北", "东", "东南", "南", "西南", "西", "西北"][i],
    en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][i]
  };
}

function renderStorms() {
  const box = $("#storms");
  if (!box) return;
  $("#stTitle").textContent = t().stTitle;
  $("#stHint").textContent = t().stHint;
  if (S.storms === null) { box.innerHTML = `<div class="sky-skeleton" style="height:80px"></div>`; return; }
  if (!S.storms.length) { box.innerHTML = `<p class="sky-hint">${t().stormsNone}</p>`; return; }
  const en = lang() === "en";
  const list = S.storms.slice().sort((a, b) => distKm(S.city.lat, S.city.lon, a.lat, a.lon) - distKm(S.city.lat, S.city.lon, b.lat, b.lon));
  box.innerHTML = `<div class="sky-storm-list">${list.map((s) => {
    const d = distKm(S.city.lat, S.city.lon, s.lat, s.lon);
    const date = (s.date || "").slice(5, 10).replace("-", "/");
    const mo = stormMotion(s);
    const off = s.official;
    const hasFc = off && off.future && off.future.length >= 2;
    const badge = hasFc
      ? `<div class="sky-storm-fc"><span class="sky-fc-tag">${en ? "OFFICIAL" : "官方预报"}</span>${t().stormForecast(off.forecastHours)}</div>`
      : `<div class="sky-storm-fc muted">${t().stormExtrapolate}</div>`;
    return `<article class="sky-storm">
      <div class="sky-storm-name">🌀 ${s.title}${s.gdacsOnly ? `<span class="sky-fc-mini">${t().stormOfficialSource}</span>` : ""}</div>
      <div class="sky-storm-meta">${en ? "lat" : "北纬"} ${Math.abs(s.lat).toFixed(1)}° · ${en ? "lon" : "东经"} ${Math.abs(s.lon).toFixed(1)}° · ${t().stormDist(Math.round(d))}${date ? ` · ${date}` : ""}</div>
      ${mo ? `<div class="sky-storm-move">${t().stormMove(en ? mo.en : mo.zh, mo.kmh)}</div>` : ""}
      ${badge}
      <button class="sky-link" type="button" data-storm="${s.id}">${t().stormView}</button>
    </article>`;
  }).join("")}</div><p class="sky-storm-src">${t().stormSource}</p>`;
  box.querySelectorAll("[data-storm]").forEach((b) => b.onclick = () => {
    const s = S.storms.find((x) => x.id === b.dataset.storm);
    if (!s) return;
    S.mapCenter = { lat: s.lat, lon: s.lon, track: s.track || [], official: s.official || null };
    renderMapSection();
    $("#skyMap").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------- 定位与提示 ---------- */
function hideGeoPrompt() {
  const el = $("#geoPrompt");
  if (el) el.hidden = true;
}
function showGeoPromptIfNeeded() {
  let saved = null, asked = null;
  try { saved = localStorage.getItem(STORE_CITY); } catch (e) {}
  try { asked = localStorage.getItem("sky_geo_asked"); } catch (e) {}
  const el = $("#geoPrompt");
  if (el) el.hidden = !!(saved || asked);
}
function markGeoAsked() {
  try { localStorage.setItem("sky_geo_asked", "1"); } catch (e) {}
}
function locate() {
  if (!navigator.geolocation) { toast(t().geoFail); return; }
  const btn = $("#geoBtn");
  const old = btn.textContent;
  btn.textContent = t().geoLocating;
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    const near = nearestCity(latitude, longitude) || DEFAULT_CITY;
    const rev = await reverseName(latitude, longitude, lang());
    const name = rev && rev.label ? rev.label : t().myLocation;
    btn.textContent = t().geo;
    markGeoAsked();
    hideGeoPrompt();
    setCity({ id: "geo", zh: name, en: name, label: name, province: "", lat: latitude, lon: longitude, bortle: near.bortle });
    toast(t().geoOK(name));
  }, () => {
    btn.textContent = old || t().geo;
    toast(t().geoFail);
  }, { timeout: 10000, maximumAge: 600000 });
}
let toastTimer = null;
function toast(msg, ms = 3200) {
  let el = document.getElementById("skyToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "skyToast";
    el.className = "sky-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), ms);
}

/* ---------- 渲染：说明 ---------- */
function renderNote() {
  const upd = S.data && S.data.updated ? fmtHM(new Date(S.data.updated), 8) : "—";
  $("#sourceNote").innerHTML = t().srcNote(upd);
}

/* ---------- 城市选择 ---------- */
function openCity() {
  const d = $("#cityDialog");
  if (d.open) return;
  $("#cityFilter").value = "";
  renderCityList("");
  if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  setTimeout(() => $("#cityFilter").focus(), 30);
}
function closeCity() {
  const d = $("#cityDialog");
  if (d.close) d.close(); else d.removeAttribute("open");
}
function renderCityList(q) {
  q = (q || "").trim().toLowerCase();
  const list = CITIES.filter((c) => !q || c.zh.includes(q) || c.en.toLowerCase().includes(q) || c.province.includes(q));
  const box = $("#cityList");
  box.innerHTML = list.length ? list.map((c) => `<button class="sky-city-item ${c.id === S.city.id ? "on" : ""}" data-city="${c.id}" type="button">${cityLabel(c, lang())}<small>${lang() === "en" ? c.province : c.province}</small></button>`).join("")
    : `<p class="sky-hint">${lang() === "en" ? "No city found." : "没找到这个城市。"}</p>`;
  $$("[data-city]", box).forEach((b) => b.onclick = () => {
    const c = cityById(b.dataset.city);
    if (c) { closeCity(); setCity(c); }
  });
}

/* ---------- 顶栏城市联想 ---------- */
function renderCitySuggest(q) {
  q = (q || "").trim().toLowerCase();
  const box = $("#citySuggest");
  if (!q) { box.hidden = true; box.innerHTML = ""; return; }
  const hits = CITIES.filter((c) => c.zh.includes(q) || c.en.toLowerCase().includes(q)).slice(0, 8);
  if (!hits.length) { box.hidden = true; return; }
  box.innerHTML = hits.map((c) => `<div data-city="${c.id}">${cityLabel(c, lang())}<span class="sug-prov">${c.province}</span></div>`).join("");
  box.hidden = false;
  $$("[data-city]", box).forEach((el) => el.onclick = () => {
    const c = cityById(el.dataset.city);
    if (c) { $("#citySearch").value = ""; box.hidden = true; setCity(c); }
  });
}

/* ---------- 事件 ---------- */
function bind() {
  $("#cityBtn").onclick = openCity;
  $("#cityClose").onclick = closeCity;
  $("#cityFilter").addEventListener("input", (e) => renderCityList(e.target.value));
  $("#cityDialog").addEventListener("click", (e) => { if (e.target.id === "cityDialog") closeCity(); });
  $("#refreshBtn").onclick = () => loadData(true);
  $("#geoBtn").onclick = () => locate();
  const ga = $("#geoAllow");
  if (ga) ga.onclick = () => { markGeoAsked(); locate(); };
  const gs = $("#geoSkip");
  if (gs) gs.onclick = () => { markGeoAsked(); hideGeoPrompt(); };
  $("#citySearch").addEventListener("input", (e) => renderCitySuggest(e.target.value));
  $("#citySearch").addEventListener("focus", (e) => renderCitySuggest(e.target.value));
  $("#citySearch").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#citySuggest").hidden = true; } });
  document.addEventListener("click", (e) => { if (!e.target.closest(".nc-search")) $("#citySuggest").hidden = true; });
  document.addEventListener("ncn:lang", () => { render(); $("#citySearch").placeholder = t().cloudPh; });
  document.addEventListener("ncn:theme", () => {});
}

/* ---------- 总渲染 ---------- */
function renderStaticLabels() {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set("wxTitle", t().wxTitle);
  set("wxHint", t().wxHint);
  set("geoTitle", t().geoTitle);
  set("geoDesc", t().geoDesc);
  set("geoAllow", t().geoAllow);
  set("geoSkip", t().geoSkip);
  const q = $("#citySearch");
  if (q) q.placeholder = t().cloudPh;
  // 首页城市入口与标题：data-zh / data-en 静态双语
  const key = lang() === "en" ? "data-en" : "data-zh";
  document.querySelectorAll("[data-zh][data-en]").forEach((el) => {
    const v = el.getAttribute(key);
    if (v != null && el.tagName !== "META") el.textContent = v;
  });
  /* 地图图层 / 图例：live-map.js 的 T 字典是模块内私有，这里用同一份标签
     渲染 [data-lt]，避免切 EN 后地图控件仍是中文。 */
  const LT = {
    zh: { sat: "卫星", street: "街道", dark: "深色", glow: "晚霞", radar: "雷达",
      cloud: "云量", storms: "台风", glowTitle: "晚霞指数", radarTitle: "雷达降水",
      src: "底图 Esri · 雷达 RainViewer · 晚霞 Open-Meteo（ECMWF / CMA / ICON）",
      hint: "颜色越暖，指数越高", base: "底图", cloudCtl: "云量预报 · 白色越实云越厚",
      playCloud: "回放未来 24 小时", playRadar: "回放近 2 小时" },
    en: { sat: "Satellite", street: "Street", dark: "Dark", glow: "Glow", radar: "Radar",
      cloud: "Cloud", storms: "Storms", glowTitle: "Glow index", radarTitle: "Radar",
      src: "Basemap Esri · Radar RainViewer · Glow Open-Meteo (ECMWF / CMA / ICON)",
      hint: "Warmer colours mean a higher index", base: "Basemap",
      cloudCtl: "Cloud forecast · whiter means thicker cloud",
      playCloud: "Replay next 24h", playRadar: "Replay last 2h" }
  };
  const ltm = lang() === "en" ? LT.en : LT.zh;
  document.querySelectorAll("[data-lt]").forEach((el) => {
    const k = el.getAttribute("data-lt");
    if (ltm[k] != null && el.tagName !== "INPUT") el.textContent = ltm[k];
  });
  const seg = document.querySelector(".sky-seg");
  if (seg) seg.setAttribute("aria-label", ltm.base);
  const cc = document.getElementById("mapCloudCtl");
  if (cc) cc.title = ltm.cloudCtl;
  const cp = document.getElementById("mapCloudPlay");
  if (cp) cp.setAttribute("aria-label", ltm.playCloud);
  const rp = document.getElementById("mapRadarPlay");
  if (rp) rp.setAttribute("aria-label", ltm.playRadar);
}

function render() {
  renderStaticLabels();
  renderHero();
  renderCards();
  renderTimeline();
  renderDetail();
  renderModels();
  renderEnsemble();
  renderWeather();
  renderStorms();
  renderDays();
  renderEvents();
  renderNote();
  renderMapSection();
}

/* ---------- 启动 ---------- */
function cityFromQuery() {
  try {
    const id = new URLSearchParams(location.search).get("city");
    if (!id) return null;
    return CITIES.find((c) => c.id === id) || null;
  } catch (e) { return null; }
}
const qCity = cityFromQuery();
S.city = qCity || loadCity();
if (qCity) saveCity(qCity);
window.__sky = S;
$("#citySearch").placeholder = t().cloudPh;
bind();
showGeoPromptIfNeeded();
render();
loadData();
