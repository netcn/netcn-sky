/* ============================================================
   数据源汇总
   ① Open-Meteo 多模式（6 个独立数值模式：ECMWF / CMA / ICON / GFS / JMA / UKMO）
   ② Open-Meteo 集合预报（ECMWF ENS 50 个成员）→ 概率
   ③ Open-Meteo 空气质量（气溶胶光学厚度 / PM2.5）→ 晚霞色彩
   ④ 挪威气象局 met.no（总云量交叉校验）
   全部免密钥、支持浏览器直连；20 分钟本地缓存。
   ============================================================ */
import { parseLocal } from "./astro.js?v=20";

const API = "https://api.open-meteo.com/v1/forecast";
const ENS = "https://ensemble-api.open-meteo.com/v1/ensemble";
const AQ = "https://air-quality-api.open-meteo.com/v1/air-quality";
const METNO = "https://api.met.no/weatherapi/locationforecast/2.0/compact";

export const MODELS = [
  { id: "ecmwf_ifs025", label: "ECMWF", org: "欧洲中期天气预报中心", zh: "欧洲中心", weight: 1.15 },
  { id: "cma_grapes_global", label: "CMA", org: "中国气象局", zh: "中国气象局", weight: 1.1 },
  { id: "icon_seamless", label: "ICON", org: "德国气象局", zh: "德国气象局", weight: 1.0 },
  { id: "gfs_seamless", label: "GFS", org: "美国 NOAA", zh: "美国 NOAA", weight: 0.95 },
  { id: "jma_seamless", label: "JMA", org: "日本气象厅", zh: "日本气象厅", weight: 0.95 },
  { id: "ukmo_seamless", label: "UKMO", org: "英国气象局", zh: "英国气象局", weight: 0.95 }
];

const CACHE_PREFIX = "sky_cache_v3_";
const TTL = 30 * 60 * 1000;
/* 数据源被限流（Open-Meteo 免费额度 5000 次/小时/IP，移动网络 NAT 下很容易被邻居打满）
   时，宁可显示一份「过期但真实」的缓存，也不要给用户一个「数据读取失败」。
   STALE_MAX 之内允许兜底，并在界面上标注缓存时间。 */
const STALE_MAX = 6 * 60 * 60 * 1000;

function cacheKey(lat, lon) {
  return CACHE_PREFIX + lat.toFixed(2) + "_" + lon.toFixed(2);
}

/* 额度熔断：Open-Meteo 免费额度是「每 IP 每天 10000 次」，移动网络 NAT 下
   很容易被同网段用户打满。一旦收到 429，10 分钟内不再发任何请求——
   页面直接用本地缓存渲染，既不给用户看空白，也不再继续消耗额度。 */
const BREAK_KEY = "sky_quota_block";
const BREAK_MS = 10 * 60 * 1000;
function quotaBlocked() {
  try { return Date.now() - (+localStorage.getItem(BREAK_KEY) || 0) < BREAK_MS; } catch (e) { return false; }
}
function markBlocked() {
  try { localStorage.setItem(BREAK_KEY, String(Date.now())); } catch (e) {}
}

async function getJSON(url, ms = 20000) {
  if (quotaBlocked()) throw new Error("HTTP 429 (cooling down)");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-cache" });
    if (res.status === 429) { markBlocked(); throw new Error("HTTP 429"); }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function nums(a) { return Array.isArray(a) ? a.map((v) => (v === null ? null : Number(v))) : []; }

/* 时间轴统一存成 epoch 毫秒：既能直接比较，也能安全 JSON 缓存 */
function timeAxis(arr) {
  return (arr || []).map((s) => parseLocal(s)).filter(Boolean).map((d) => d.getTime());
}

/* ---------- ① 多模式云量 ---------- */
async function fetchModels(lat, lon) {
  const ids = MODELS.map((m) => m.id).join(",");
  const url = `${API}?latitude=${lat}&longitude=${lon}`
    + `&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high`
    + `&timezone=Asia%2FShanghai&forecast_days=3&models=${ids}`;
  const d = await getJSON(url);
  const h = d.hourly || {};
  const times = timeAxis(h.time);
  const models = [];
  for (const m of MODELS) {
    const low = nums(h["cloud_cover_low_" + m.id]);
    if (!low.length || low.every((v) => v === null)) continue;
    models.push({
      ...m,
      cloud: {
        total: nums(h["cloud_cover_" + m.id]),
        low,
        mid: nums(h["cloud_cover_mid_" + m.id]),
        high: nums(h["cloud_cover_high_" + m.id])
      }
    });
  }
  if (!models.length) throw new Error("多模式云量不可用");
  return { times, models };
}

/* ---------- ② 集合预报 ---------- */
async function fetchEnsemble(lat, lon) {
  // ECMWF ENS 是少数提供低/中/高云分层的集合系统（50 个成员）
  const url = `${ENS}?latitude=${lat}&longitude=${lon}`
    + `&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high`
    + `&timezone=Asia%2FShanghai&forecast_days=2&models=ecmwf_ifs025`;
  const d = await getJSON(url, 30000);
  const h = d.hourly || {};
  const times = timeAxis(h.time);
  const members = [];
  for (let i = 1; i <= 52; i++) {
    const n = String(i).padStart(2, "0");
    const low = nums(h["cloud_cover_low_member" + n]);
    if (!low.length || low.every((v) => v === null)) continue;
    members.push({
      low,
      mid: nums(h["cloud_cover_mid_member" + n]),
      high: nums(h["cloud_cover_high_member" + n]),
      total: nums(h["cloud_cover_member" + n])
    });
  }
  return { times, members };
}

/* ---------- ③ 共享大气背景 ---------- */
async function fetchContext(lat, lon) {
  const url = `${API}?latitude=${lat}&longitude=${lon}`
    + `&hourly=precipitation_probability,visibility,dew_point_2m,temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
    + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset`
    + `&timezone=Asia%2FShanghai&forecast_days=3`;
  const d = await getJSON(url);
  const h = d.hourly || {};
  return {
    current: d.current || null,
    dailyDetail: d.daily || null,
    times: timeAxis(h.time),
    precip: nums(h.precipitation_probability),
    // Open-Meteo 的能见度单位是米，统一换算成公里
    visibility: nums(h.visibility).map((v) => (v === null ? null : v / 1000)),
    dew: nums(h.dew_point_2m),
    temp: nums(h.temperature_2m),
    rh: nums(h.relative_humidity_2m),
    wind: nums(h.wind_speed_10m),
    code: nums(h.weather_code),
    daily: d.daily || {}
  };
}

/* ---------- ④ 空气质量 ---------- */
async function fetchAir(lat, lon) {
  const url = `${AQ}?latitude=${lat}&longitude=${lon}`
    + `&hourly=pm2_5,pm10,aerosol_optical_depth,dust`
    + `&current=european_aqi,us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide`
    + `&timezone=Asia%2FShanghai&forecast_days=3`;
  const d = await getJSON(url, 20000);
  const h = d.hourly || {};
  return {
    current: d.current || null,
    times: timeAxis(h.time),
    aod: nums(h.aerosol_optical_depth),
    pm25: nums(h.pm2_5),
    pm10: nums(h.pm10),
    dust: nums(h.dust)
  };
}

/* ---------- ⑤ met.no 总云量交叉校验 ---------- */
async function fetchMetno(lat, lon) {
  const d = await getJSON(`${METNO}?lat=${lat}&lon=${lon}`, 15000);
  const ts = (d.properties && d.properties.timeseries) || [];
  const times = [], cloud = [];
  for (const row of ts) {
    const t = new Date(row.time);
    const v = row.data && row.data.instant && row.data.instant.details
      && row.data.instant.details.cloud_area_fraction;
    if (Number.isFinite(v)) { times.push(t.getTime()); cloud.push(v); }
  }
  if (!times.length) throw new Error("met.no 无云量");
  return { times, cloud };
}

/* ---------- 对外 ---------- */
export async function loadSky(lat, lon, opts = {}) {
  const key = cacheKey(lat, lon);
  let cachedRaw = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) cachedRaw = JSON.parse(raw);
  } catch (e) { cachedRaw = null; }
  if (!opts.force && cachedRaw && cachedRaw.t && Date.now() - cachedRaw.t < TTL
    && cachedRaw.d && cachedRaw.d.models) {
    return { ...cachedRaw.d, cached: true, updated: cachedRaw.t };
  }

  const jobs = {
    core: Promise.all([fetchModels(lat, lon), fetchContext(lat, lon)]),
    ensemble: fetchEnsemble(lat, lon),
    air: fetchAir(lat, lon),
    metno: fetchMetno(lat, lon)
  };
  const settled = await Promise.allSettled([jobs.core, jobs.ensemble, jobs.air, jobs.metno]);
  const [coreR, ensR, airR, metR] = settled;
  if (coreR.status === "rejected") {
    /* 核心数据没拿到：优先用未过期的本地缓存（可能是几分钟前的），再退到陈旧缓存。
       限流时用户看到的应该是「几分钟前的真实预报」，而不是一块空白。 */
    if (cachedRaw && cachedRaw.d && cachedRaw.d.models
      && Date.now() - cachedRaw.t < STALE_MAX) {
      return { ...cachedRaw.d, cached: true, stale: true, updated: cachedRaw.t, error: coreR.reason };
    }
    throw coreR.reason;
  }

  const [{ times, models }, ctx] = coreR.value;
  const ensemble = ensR.status === "fulfilled" ? ensR.value : null;
  const air = airR.status === "fulfilled" ? airR.value : null;
  const metno = metR.status === "fulfilled" ? metR.value : null;

  const data = {
    times, models, ctx, ensemble, air, metno,
    updated: Date.now(),
    status: {
      models: models.length,
      ensemble: ensemble ? ensemble.members.length : 0,
      metno: !!metno,
      air: !!air
    }
  };
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
  } catch (e) {
    /* 配额满时忽略，不影响主流程 */
  }
  return { ...data, cached: false };
}

/* ---------- ⑥ 区域网格（晚霞地图） ---------- */
/* 网格：7×7 / 0.5°（约 55km，覆盖 ±1.5°≈330km），配合插值与模糊消除方格感。
   云量改用 ECMWF 集合（51 成员）——与首页主评分同一口径，
   否则会出现「卡片 65、地图上上海 38」这种自相矛盾。
   缓存前缀升到 v3，避免读到旧的 5×5 确定性结果。 */
const GRID_N = 9;      // 桌面：9×9 = 81 点，覆盖 ±2.2°（约 500 公里）
const GRID_N_MOBILE = 7; // 手机：7×7 = 49 点，省 40% 额度，小屏也看不出差别
const GRID_STEP = 0.55; // 度；按纬度修正经度间距，约 54–60 公里
const GRID_MODELS = ["ecmwf_ifs025", "cma_grapes_global", "icon_seamless"];
/* 网格只服务地图图层，变化慢、体积大：缓存 90 分钟，并允许陈旧兜底。
   Open-Meteo 免费额度按「请求数 × 坐标数」计，9×9=81 点一次就吃 81 个额度，
   所以这里必须懒加载 + 长缓存，否则移动网络 NAT 下很容易把共用 IP 打爆。 */
const GRID_TTL = 90 * 60 * 1000;
const GRID_PREFIX = "sky_grid_v5_";

export async function loadGrid(lat, lon, opts = {}) {
  const n = (typeof window !== "undefined" && window.innerWidth < 700) ? GRID_N_MOBILE : GRID_N;
  const key = GRID_PREFIX + n + "_" + lat.toFixed(2) + "_" + lon.toFixed(2);
  let cachedRaw = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) cachedRaw = JSON.parse(raw);
  } catch (e) { cachedRaw = null; }
  if (!opts.force && cachedRaw && cachedRaw.t && Date.now() - cachedRaw.t < GRID_TTL
    && cachedRaw.d && cachedRaw.d.points) {
    return { ...cachedRaw.d, cached: true };
  }
  const cos = Math.max(0.3, Math.cos(lat * Math.PI / 180));
  const pts = [];
  const half = (n - 1) / 2;
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      pts.push({
        lat: +(lat + j * GRID_STEP).toFixed(3),
        lon: +(lon + (i * GRID_STEP) / cos).toFixed(3)
      });
    }
  }
  /* 云量用 ECMWF 确定性单模型：81 点 × 51 成员的集合请求会触发
     Open-Meteo 的限流（实测 429），不可行。
     地图的空间形态来自确定性高分辨率网格，整体水平由 app.js 用
     「集合中位数 − ECMWF 确定性」的偏差做校正，保证与首页同口径。

     两个前提是实测出来的：
     ① 额度按「坐标数」计，所以云量和地面要素必须合并成一个请求
        （拆成两个等于开销翻倍：49 点 × 2 = 98 额度/次）；
     ② 单次 URL 的坐标数有上限，81 点会直接返回 414，
        所以按 CHUNK 分批，每批一个请求。 */
  const HOURLY = "cloud_cover_low,cloud_cover_mid,cloud_cover_high,"
    + "visibility,precipitation_probability,dew_point_2m,temperature_2m";
  const CHUNK = 49;
  const chunks = [];
  for (let i = 0; i < pts.length; i += CHUNK) chunks.push(pts.slice(i, i + CHUNK));
  let arr;
  try {
    const parts = await Promise.all(chunks.map(async (chunk) => {
      const q = `latitude=${chunk.map((p) => p.lat).join(",")}&longitude=${chunk.map((p) => p.lon).join(",")}`
        + `&timezone=Asia%2FShanghai&forecast_days=1&hourly=${HOURLY}&models=ecmwf_ifs025`;
      const raw = await getJSON(`${API}?${q}`, 45000);
      return Array.isArray(raw) ? raw : [raw];
    }));
    arr = parts.flat();
  } catch (err) {
    /* 网格只影响地图着色，没必要让整块地图报错：有旧缓存就先用旧的。 */
    if (cachedRaw && cachedRaw.d && cachedRaw.d.points
      && Date.now() - cachedRaw.t < STALE_MAX) {
      return { ...cachedRaw.d, cached: true, stale: true, error: err };
    }
    throw err;
  }
  const points = pts.map((p, idx) => {
    const h = (arr[idx] && arr[idx].hourly) || {};
    const pick = (k) => nums(h[k + "_ecmwf_ifs025"] || h[k] || []);
    const models = [{
      id: "ecmwf_ifs025",
      low: pick("cloud_cover_low"),
      mid: pick("cloud_cover_mid"),
      high: pick("cloud_cover_high")
    }].filter((m) => m.low.some((x) => x != null));
    return {
      lat: p.lat,
      lon: p.lon,
      times: timeAxis(h.time),
      members: [],
      models,
      ctx: {
        times: timeAxis(h.time),
        visibility: nums(h.visibility).map((v) => (v == null ? null : v / 1000)),
        precip: nums(h.precipitation_probability),
        dew: nums(h.dew_point_2m),
        temp: nums(h.temperature_2m)
      }
    };
  });
  const data = { center: { lat, lon }, points, updated: Date.now() };
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
  return { ...data, cached: false };
}

/* ---------- ⑦ 活跃热带气旋（NASA EONET） ---------- */
const STORM_TTL = 30 * 60 * 1000;
const STORM_KEY = "sky_storms_v2";

export async function loadStorms(opts = {}) {
  if (!opts.force) {
    try {
      const raw = localStorage.getItem(STORM_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.t && Date.now() - c.t < STORM_TTL && c.d) return { ...c.d, cached: true };
      }
    } catch (e) {}
  }
  const d = await getJSON("https://eonet.gsfc.nasa.gov/api/v3/events?category=severeStorms&status=open&days=60", 20000);
  const list = (d.events || []).map((e) => {
    const geom = (e.geometry || []).filter((g) => g && Array.isArray(g.coordinates));
    const g = geom[geom.length - 1];
    if (!g) return null;
    if (!/typhoon|tropical cyclone|hurricane|cyclone/i.test(e.title || "")) return null;
    const track = geom.map((p) => ({
      lat: p.coordinates[1],
      lon: p.coordinates[0],
      date: p.date,
      mag: Number.isFinite(p.magnitudeValue) ? p.magnitudeValue : null
    }));
    return {
      id: e.id,
      title: e.title,
      lat: g.coordinates[1],
      lon: g.coordinates[0],
      date: g.date,
      mag: Number.isFinite(g.magnitudeValue) ? g.magnitudeValue : null,
      track,
      link: (e.sources && e.sources[0] && e.sources[0].url) || "https://eonet.gsfc.nasa.gov/"
    };
  }).filter(Boolean);
  const data = { list, updated: Date.now() };
  try { localStorage.setItem(STORM_KEY, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
  return { ...data, cached: false };
}

/* ---------- ⑧ 反查地名 ---------- */
export async function reverseName(lat, lon, lang = "zh") {
  try {
    const loc = lang === "en" ? "en" : "zh-Hans";
    const d = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${loc}`, 12000);
    const city = (d.city || d.principalSubdivision || "").trim();
    const district = (d.locality || "").trim();
    if (!city && !district) return null;
    const label = city && district && district !== city ? `${city} · ${district}` : (city || district);
    return { city, district, label };
  } catch (e) {
    return null;
  }
}

/* 线性插值：给定源时间轴和值，返回 at(instant) */
export function interpolator(times, values) {
  if (!times || !times.length || !values || !values.length) return () => null;
  return function at(date) {
    if (!date) return null;
    const t = date instanceof Date ? date.getTime() : +date;
    if (t <= +times[0]) return values[0];
    const last = times.length - 1;
    if (t >= +times[last]) return values[last];
    let lo = 0, hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (+times[mid] <= t) lo = mid; else hi = mid;
    }
    const t0 = +times[lo], t1 = +times[hi];
    const v0 = values[lo], v1 = values[hi];
    if (v0 === null || v0 === undefined) return v1;
    if (v1 === null || v1 === undefined) return v0;
    if (t1 === t0) return v0;
    return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
  };
}

/* ---------- ⑨ 官方台风预报路径（GDACS / JTWC-JMA 汇总） ----------
   GDACS 的 getgeometry 把一条路径拆成多个 2 点 LineString，以及一组
   PointRadii 风圈（Point_Polygon_Point_N，N 按时间递增）。风圈属性里
   polygonlabel / key 给出 UTC 时刻；Poly_Cones 是官方误差锥。
   这里把风圈中心按时间串成历史段 + 预报段，供地图直接绘制。 */
const GDACS_LIST = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=Green;Orange;Red";
const GDACS_GEO = "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry";
const GDACS_KEY = "sky_official_tracks_v1";
const GDACS_TTL = 30 * 60 * 1000;

/* key = "MMDDHHmm"（UTC），补上年份；跨年时按当前月份修正 */
function gdacsTime(key, label, now) {
  let mo, dd, hh, mi;
  if (/^\d{8}$/.test(key || "")) {
    mo = +key.slice(0, 2); dd = +key.slice(2, 4); hh = +key.slice(4, 6); mi = +key.slice(6, 8);
  } else {
    const m = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(label || "");
    if (!m) return null;
    dd = +m[1]; mo = +m[2]; hh = +m[3]; mi = +m[4];
  }
  let year = now.getUTCFullYear();
  // 若解析出的月份比当前晚 6 个月以上，视为去年（跨年事件）
  if (mo > now.getUTCMonth() + 1 + 6) year -= 1;
  const t = Date.UTC(year, mo - 1, dd, hh, mi);
  return Number.isFinite(t) ? t : null;
}

/* 递归找出 GeoJSON coordinates 里第一个「点的数组」，兼容 Polygon / MultiPolygon */
function firstRing(c) {
  if (!Array.isArray(c)) return null;
  if (c.length && Array.isArray(c[0]) && c[0].length >= 2 && Number.isFinite(c[0][0]) && Number.isFinite(c[0][1])) return c;
  for (const x of c) { const r = firstRing(x); if (r) return r; }
  return null;
}

function ringCenter(geom) {
  const c = geom && geom.coordinates;
  if (!Array.isArray(c)) return null;
  const ring = firstRing(c) || c;
  const pts = ring.filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!pts.length) return null;
  let lon = 0, lat = 0;
  for (const p of pts) { lon += p[0]; lat += p[1]; }
  return { lon: lon / pts.length, lat: lat / pts.length };
}

function parseOfficialEvent(ev, now) {
  const feats = ev.features || [];
  const pts = [];
  let cone = null, eventName = "", url = "", alert = "", modified = null;
  for (const f of feats) {
    const p = f.properties || {};
    const g = f.geometry || {};
    if (!eventName && p.eventname) eventName = p.eventname;
    if (!url && p.url && p.url.report) url = p.url.report;
    if (!alert && p.alertlevel) alert = p.alertlevel;
    if (!modified && p.datemodified) modified = p.datemodified;
    const cls = String(p.Class || "");
    if (cls.indexOf("Point_Polygon_Point_") === 0) {
      const c = ringCenter(g);
      const t = gdacsTime(p.key, p.polygonlabel, now);
      if (c && t != null) pts.push({ lat: c.lat, lon: c.lon, t, label: p.polygonlabel || "", idx: +cls.split("_").pop() });
    } else if (cls === "Poly_Cones") {
      const ring = firstRing(g.coordinates);
      if (ring && ring.length >= 3) {
        // 抽稀到 <= 90 点，避免 SVG 过重
        const step = Math.max(1, Math.floor(ring.length / 90));
        cone = ring.filter((_, i) => i % step === 0).map((x) => [x[1], x[0]]);
      }
    }
  }
  pts.sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const past = pts.filter((p) => p.t <= now.getTime());
  const future = pts.filter((p) => p.t > now.getTime());
  const last = past[past.length - 1] || pts[0];
  return {
    name: eventName || "TC",
    alert,
    url: url || "https://www.gdacs.org/",
    modified,
    points: pts,
    past,
    future,
    cone,
    lat: last.lat,
    lon: last.lon,
    forecastHours: future.length ? Math.round((future[future.length - 1].t - now.getTime()) / 3600000) : 0
  };
}

export async function loadOfficialTracks(opts = {}) {
  const refLat = Number.isFinite(opts.lat) ? opts.lat : 31.2304;
  const refLon = Number.isFinite(opts.lon) ? opts.lon : 121.4737;
  if (!opts.force) {
    try {
      const raw = localStorage.getItem(GDACS_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.t && Date.now() - c.t < GDACS_TTL && c.d) return { ...c.d, cached: true };
      }
    } catch (e) {}
  }
  const list = await getJSON(GDACS_LIST, 25000);
  const now = new Date();
  const current = (list.features || []).filter((f) => String(f.properties.iscurrent).toLowerCase() === "true");
  // 按离当前城市的距离取最近的 4 个（覆盖西北太平洋气旋），避免一次拉太多几何数据
  const near = current.map((f) => {
    const c = (f.geometry && f.geometry.coordinates) || [0, 0];
    const d = Math.hypot(c[1] - refLat, (c[0] - refLon) * Math.cos(refLat * Math.PI / 180));
    return { f, d };
  }).sort((a, b) => a.d - b.d).slice(0, 4);
  const chosen = near.map(({ f }) => ({
    id: f.properties.eventid,
    episode: f.properties.episodeid,
    name: f.properties.eventname
  }));
  const settled = await Promise.allSettled(chosen.map((c) =>
    getJSON(`${GDACS_GEO}?eventtype=TC&eventid=${c.id}&episodeid=${c.episode}`, 30000)
  ));
  const tracks = [];
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const t = parseOfficialEvent(r.value, now);
    if (t) { t.id = chosen[i].id; t.eventname = chosen[i].name; tracks.push(t); }
  });
  const data = { list: tracks, updated: Date.now() };
  try { localStorage.setItem(GDACS_KEY, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
  return { ...data, cached: false };
}

/* 把官方路径匹配到 EONET 气旋：先按名称主干，再按当前位置距离 */
export function matchOfficialTrack(storm, tracks) {
  if (!tracks || !tracks.length) return null;
  const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const s = norm(storm.title || "");
  let best = null, bestD = Infinity;
  for (const t of tracks) {
    const n = norm(t.name || "").replace(/\d{2}$/, "");
    const core = n.length >= 4 ? n.slice(0, Math.min(n.length, 8)) : "";
    if (core && s.indexOf(core) >= 0) return t;
    const km = Math.hypot(storm.lat - t.lat, (storm.lon - t.lon) * Math.cos(storm.lat * Math.PI / 180)) * 111;
    if (km < bestD) { bestD = km; best = t; }
  }
  return bestD <= 350 ? best : null;
}
