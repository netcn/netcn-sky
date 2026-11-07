/* ============================================================
   数据源汇总
   ① Open-Meteo 多模式（6 个独立数值模式：ECMWF / CMA / ICON / GFS / JMA / UKMO）
   ② Open-Meteo 集合预报（ECMWF ENS 50 个成员）→ 概率
   ③ Open-Meteo 空气质量（气溶胶光学厚度 / PM2.5）→ 晚霞色彩
   ④ 挪威气象局 met.no（总云量交叉校验）
   全部免密钥、支持浏览器直连；20 分钟本地缓存。
   ============================================================ */
import { parseLocal } from "./astro.js";

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
const TTL = 20 * 60 * 1000;

function cacheKey(lat, lon) {
  return CACHE_PREFIX + lat.toFixed(2) + "_" + lon.toFixed(2);
}

async function getJSON(url, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-cache" });
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
    + `&daily=sunrise,sunset&timezone=Asia%2FShanghai&forecast_days=3`;
  const d = await getJSON(url);
  const h = d.hourly || {};
  return {
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
    + `&hourly=pm2_5,pm10,aerosol_optical_depth,dust&timezone=Asia%2FShanghai&forecast_days=3`;
  const d = await getJSON(url, 20000);
  const h = d.hourly || {};
  return {
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
  if (!opts.force) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.t && Date.now() - c.t < TTL && c.d && c.d.models) {
          return { ...c.d, cached: true, updated: c.t };
        }
      }
    } catch (e) {}
  }

  const jobs = {
    core: Promise.all([fetchModels(lat, lon), fetchContext(lat, lon)]),
    ensemble: fetchEnsemble(lat, lon),
    air: fetchAir(lat, lon),
    metno: fetchMetno(lat, lon)
  };
  const settled = await Promise.allSettled([jobs.core, jobs.ensemble, jobs.air, jobs.metno]);
  const [coreR, ensR, airR, metR] = settled;
  if (coreR.status === "rejected") throw coreR.reason;

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
