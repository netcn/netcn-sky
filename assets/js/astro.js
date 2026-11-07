/* ============================================================
   本地天文计算：太阳/月亮位置、日出日落、晨昏蒙影、月相、月出月落
   不依赖任何网络与第三方库；所有时间按中国标准时间 UTC+8 处理。
   算法来源：NOAA Solar Calculator（太阳）、SunCalc / Astronomy Answers（月亮简化模型）。
   精度：太阳事件 ±1 分钟，月亮事件 ±3 分钟，足够做观测决策。
   ============================================================ */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY = 86400000;
export const TZ = 8; // 中国标准时间

const rad = (d) => d * RAD;
const deg = (r) => r * DEG;
const wrap360 = (x) => ((x % 360) + 360) % 360;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function julianDay(date) { return date.getTime() / DAY + 2440587.5; }
function j2000(date) { return julianDay(date) - 2451545.0; }

/* ---------- 时间解析与显示（统一按 UTC+8 的“墙上时间”） ---------- */
export function parseLocal(s, tz = TZ) {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - tz * 3600e3);
}
export function fmtHM(date, tz = TZ) {
  if (!date || isNaN(date)) return "—";
  const t = new Date(date.getTime() + tz * 3600e3);
  return String(t.getUTCHours()).padStart(2, "0") + ":" + String(t.getUTCMinutes()).padStart(2, "0");
}
export function dayKey(date, tz = TZ) {
  const t = new Date(date.getTime() + tz * 3600e3);
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}
export function addDays(date, n) { return new Date(date.getTime() + n * DAY); }
export function startOfLocalDay(date, tz = TZ) {
  const t = new Date(date.getTime() + tz * 3600e3);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - tz * 3600e3);
}

/* ---------- 太阳 ---------- */
function solarGeom(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = wrap360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T)
    + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const dec = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const ra = deg(Math.atan2(Math.cos(rad(eps)) * Math.sin(rad(lambda)), Math.cos(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime = 4 * DEG * (
    y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M))
    + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M))
  );
  return { dec, ra, eqTime, lambda, eps };
}

function siderealTime(jd, lon) {
  return rad(280.16 + 360.9856235 * (jd - 2451545.0)) + rad(lon);
}

export function sunPosition(date, lat, lon) {
  const jd = julianDay(date);
  const { dec, ra } = solarGeom(jd);
  const H = siderealTime(jd, lon) - rad(ra);
  const alt = Math.asin(Math.sin(rad(lat)) * Math.sin(rad(dec)) + Math.cos(rad(lat)) * Math.cos(rad(dec)) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(rad(lat)) - Math.tan(rad(dec)) * Math.cos(rad(lat)));
  return { alt: deg(alt), az: wrap360(deg(az) + 180), dec };
}

const SUN_ZENITH = { sunrise: 90.833, civil: 96, nautical: 102, astro: 108 };

export function sunTimes(ymd, lat, lon, tz = TZ) {
  const utcMidnight = Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, 0, 0);
  const noonProbe = new Date(utcMidnight + (12 - tz) * 3600e3);
  const { dec, eqTime } = solarGeom(julianDay(noonProbe));
  const noonMin = 720 - 4 * lon - eqTime; // UTC 分钟
  const solarNoon = new Date(utcMidnight + noonMin * 60000);
  const out = { solarNoon };
  const pairs = [["sunrise", "sunset", SUN_ZENITH.sunrise], ["civilDawn", "civilDusk", SUN_ZENITH.civil],
    ["nauticalDawn", "nauticalDusk", SUN_ZENITH.nautical], ["astroDawn", "astroDusk", SUN_ZENITH.astro]];
  let polar = null;
  for (const [dawnKey, duskKey, zen] of pairs) {
    const cosH = (Math.cos(rad(zen)) - Math.sin(rad(lat)) * Math.sin(rad(dec)))
      / (Math.cos(rad(lat)) * Math.cos(rad(dec)));
    if (cosH > 1) { out[dawnKey] = null; out[duskKey] = null; if (zen === SUN_ZENITH.sunrise) polar = "down"; }
    else if (cosH < -1) { out[dawnKey] = null; out[duskKey] = null; if (zen === SUN_ZENITH.sunrise) polar = "up"; }
    else {
      const H = deg(Math.acos(cosH));
      out[dawnKey] = new Date(solarNoon.getTime() - 4 * H * 60000);
      out[duskKey] = new Date(solarNoon.getTime() + 4 * H * 60000);
    }
  }
  out.polar = polar;
  return out;
}

/* ---------- 月亮 ---------- */
function moonCoords(date) {
  const d = j2000(date);
  const L = rad(218.316 + 13.176396 * d);
  const M = rad(134.963 + 13.064993 * d);
  const F = rad(93.272 + 13.229350 * d);
  const l = L + rad(6.289) * Math.sin(M);
  const b = rad(5.128) * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);
  const obl = rad(23.4397);
  const ra = Math.atan2(Math.sin(l) * Math.cos(obl) - Math.tan(b) * Math.sin(obl), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(obl) + Math.cos(b) * Math.sin(obl) * Math.sin(l));
  return { ra, dec, dist };
}

export function moonPosition(date, lat, lon) {
  const { ra, dec, dist } = moonCoords(date);
  const H = siderealTime(julianDay(date), lon) - ra;
  const alt = Math.asin(Math.sin(rad(lat)) * Math.sin(dec) + Math.cos(rad(lat)) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(rad(lat)) - Math.tan(dec) * Math.cos(rad(lat)));
  return { alt: deg(alt), az: wrap360(deg(az) + 180), dist };
}

export function moonIllumination(date) {
  const d = j2000(date);
  const s = solarGeom(julianDay(date));
  const m = moonCoords(date);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(rad(s.dec)) * Math.sin(m.dec)
    + Math.cos(rad(s.dec)) * Math.cos(m.dec) * Math.cos(rad(s.ra) - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(rad(s.dec)) * Math.sin(rad(s.ra) - m.ra),
    Math.sin(rad(s.dec)) * Math.cos(m.dec) - Math.cos(rad(s.dec)) * Math.sin(m.dec) * Math.cos(rad(s.ra) - m.ra)
  );
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI };
}

export function moonTimes(dayStart, lat, lon, tz = TZ) {
  const start = startOfLocalDay(dayStart, tz);
  const step = 10 * 60000;
  let prev = moonPosition(start, lat, lon).alt;
  let rise = null, set = null;
  for (let t = step; t <= DAY; t += step) {
    const alt = moonPosition(new Date(start.getTime() + t), lat, lon).alt;
    if (prev <= 0 && alt > 0 && rise === null) {
      const k = -prev / (alt - prev);
      rise = new Date(start.getTime() + t - step + k * step);
    }
    if (prev > 0 && alt <= 0 && set === null) {
      const k = prev / (prev - alt);
      set = new Date(start.getTime() + t - step + k * step);
    }
    prev = alt;
  }
  const allUp = [0, 6, 12, 18].every((h) => moonPosition(new Date(start.getTime() + h * 3600e3), lat, lon).alt > 0);
  const allDown = [0, 6, 12, 18].every((h) => moonPosition(new Date(start.getTime() + h * 3600e3), lat, lon).alt <= 0);
  return { rise, set, allUp, allDown };
}

export const MOON_PHASES = [
  { max: 0.03, zh: "新月", en: "New moon" }, { max: 0.22, zh: "娥眉月", en: "Waxing crescent" },
  { max: 0.28, zh: "上弦月", en: "First quarter" }, { max: 0.47, zh: "盈凸月", en: "Waxing gibbous" },
  { max: 0.53, zh: "满月", en: "Full moon" }, { max: 0.72, zh: "亏凸月", en: "Waning gibbous" },
  { max: 0.78, zh: "下弦月", en: "Last quarter" }, { max: 0.97, zh: "残月", en: "Waning crescent" },
  { max: 1.01, zh: "新月", en: "New moon" }
];
export function phaseName(phase) {
  return MOON_PHASES.find((p) => phase <= p.max) || MOON_PHASES[0];
}
