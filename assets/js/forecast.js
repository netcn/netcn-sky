/* ============================================================
   未来 5 天观测窗口：把逐日评分、天气、空气与 UV 统一成一套数据
   城市页和天象事件页共用；空气质量只给宽松提示，不参与评分。
   ============================================================ */
import { evaluate } from "./scoring.js?v=26";
import { fmtHM } from "./astro.js?v=24";

const BJ = 8 * 3600e3;
const bjDate = (d) => new Date(d.getTime() + BJ);
const pad = (n) => String(n).padStart(2, "0");

const WX = {
  0: ["晴", "Clear"], 1: ["晴间多云", "Mostly clear"], 2: ["多云", "Partly cloudy"], 3: ["阴", "Overcast"],
  45: ["雾", "Fog"], 48: ["雾凇", "Rime fog"],
  51: ["毛毛雨", "Light drizzle"], 53: ["毛毛雨", "Drizzle"], 55: ["密毛毛雨", "Dense drizzle"],
  56: ["冻毛毛雨", "Freezing drizzle"], 57: ["冻毛毛雨", "Freezing drizzle"],
  61: ["小雨", "Light rain"], 63: ["中雨", "Rain"], 65: ["大雨", "Heavy rain"],
  66: ["冻雨", "Freezing rain"], 67: ["冻雨", "Freezing rain"],
  71: ["小雪", "Light snow"], 73: ["中雪", "Snow"], 75: ["大雪", "Heavy snow"], 77: ["雪粒", "Snow grains"],
  80: ["阵雨", "Light showers"], 81: ["阵雨", "Showers"], 82: ["强阵雨", "Violent showers"],
  85: ["阵雪", "Snow showers"], 86: ["强阵雪", "Heavy snow showers"],
  95: ["雷阵雨", "Thunderstorm"], 96: ["雷暴伴冰雹", "Thunderstorm with hail"], 99: ["强雷暴伴冰雹", "Severe thunderstorm"]
};

const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* 宽松口径：0–100 视为可接受，100–150 才提示一般，>150 才提示偏差。
   这是给观测者的辅助信息，不参与星空评分，也不替代 AOD/云量。
   数据源是 Open-Meteo 的 european_aqi，界面统一标注为“欧洲 AQI / EU AQI”。 */
export const AQI_LABEL = { zh: "欧洲 AQI", en: "EU AQI" };
const AQI_BANDS = [
  { max: 100, tone: "ok", zh: "尚可", en: "Okay", color: "#2f8f57" },
  { max: 150, tone: "mid", zh: "一般", en: "Fair", color: "#a66b12" },
  { max: 9999, tone: "bad", zh: "偏差", en: "Poor", color: "#b53636" }
];

export function aqiBand(v) {
  if (v == null || !Number.isFinite(v)) return { tone: "none", zh: "—", en: "—", color: "var(--ui-ink3)" };
  return AQI_BANDS.find((b) => v <= b.max) || AQI_BANDS[AQI_BANDS.length - 1];
}

export function uvTone(v) {
  if (v == null || !Number.isFinite(v)) return "none";
  if (v <= 2) return "ok";
  if (v <= 5) return "mid";
  if (v <= 7) return "high";
  return "bad";
}

export function weatherLabel(code, lang = "zh") {
  const w = WX[code];
  return w ? w[lang === "en" ? 1 : 0] : "—";
}

function localNoon(y, m, d, hour = 12) {
  return new Date(Date.UTC(y, m - 1, d, hour - 8, 0));
}

function valueAt(times, values, target) {
  if (!times || !times.length || !values || !values.length) return null;
  let i = 0;
  while (i < times.length && times[i] < target) i++;
  if (i === 0) return values[0];
  if (i >= times.length) return values[values.length - 1];
  const a = values[i - 1], b = values[i];
  if (a == null) return b;
  if (b == null) return a;
  const ratio = (target - times[i - 1]) / (times[i] - times[i - 1]);
  return a + (b - a) * ratio;
}

function dateLabel(b, lang, i) {
  const m = b.getUTCMonth() + 1;
  const d = b.getUTCDate();
  const w = b.getUTCDay();
  if (i >= 3) return lang === "en" ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}` : `${m}/${d}`;
  return lang === "en"
    ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d} ${WEEK_EN[w]}`
    : `${m}/${d} 周${WEEK_ZH[w]}`;
}

function dayLabel(i, lang, now) {
  const w = bjDate(new Date(now.getTime() + i * 86400000)).getUTCDay();
  if (lang === "en") return i === 0 ? "Tonight" : i === 1 ? "Tomorrow" : i === 2 ? "Day after" : WEEK_EN[w];
  return i === 0 ? "今晚" : i === 1 ? "明晚" : i === 2 ? "后天" : `周${WEEK_ZH[w]}`;
}

export function buildDailyForecast(data, city, lang = "zh", days = 5) {
  const now = new Date();
  const daily = data.ctx && data.ctx.daily;
  const items = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const b = bjDate(d);
    const y = b.getUTCFullYear(), m = b.getUTCMonth() + 1, day = b.getUTCDate();
    const ymd = `${y}-${pad(m)}-${pad(day)}`;
    const ev = evaluate(data, city, d);
    const di = daily && daily.time ? daily.time.indexOf(ymd) : -1;
    const dailyCode = di >= 0 && daily.weather_code ? daily.weather_code[di] : null;
    /* 这是“今晚”的卡片，天气图标必须跟着夜间云量走。
       旧版直接用 daily.weather_code，会出现“阴 / 云量 34%”这种自相矛盾的展示。
       有明确降水信号时保留降水图标，否则按夜间云量归到晴 / 晴间多云 / 多云 / 阴。 */
    const precip = di >= 0 && daily.precipitation_probability_max ? daily.precipitation_probability_max[di] : null;
    const cloud = ev.star && ev.star.cloud != null ? ev.star.cloud : null;
    const wet = precip != null && precip >= 50 && dailyCode != null && dailyCode >= 51;
    let wxCode = dailyCode;
    if (!wet && cloud != null) {
      wxCode = cloud >= 85 ? 3 : cloud >= 55 ? 2 : cloud >= 20 ? 1 : 0;
    }
    const aqi = data.air ? valueAt(data.air.times, data.air.aqi, localNoon(y, m, day, 21)) : null;
    const uv = di >= 0 && daily.uv_index_max ? daily.uv_index_max[di] : null;
    const aqiB = aqiBand(aqi);
    const sunset = ev.sun && ev.sun.sunset ? fmtHM(ev.sun.sunset) : "—";
    items.push({
      i,
      label: dayLabel(i, lang, now),

      dateLabel: dateLabel(b, lang, i),
      ymd,
      weatherCode: wxCode,
      weatherLabel: weatherLabel(wxCode, lang),
      tmax: di >= 0 && daily.temperature_2m_max ? daily.temperature_2m_max[di] : null,
      tmin: di >= 0 && daily.temperature_2m_min ? daily.temperature_2m_min[di] : null,
      precip: di >= 0 && daily.precipitation_probability_max ? daily.precipitation_probability_max[di] : null,
      sunset,
      glow: ev.evening && ev.evening.prob != null ? Math.round(ev.evening.prob) : null,
      dawn: ev.morning && ev.morning.prob != null ? Math.round(ev.morning.prob) : null,
      star: ev.star && ev.star.score != null ? Math.round(ev.star.score) : null,
      cloud: ev.star && ev.star.cloud != null ? Math.round(ev.star.cloud) : null,
      moon: ev.moon && ev.moon.illum != null ? Math.round(ev.moon.illum * 100) : null,
      moonScore: ev.moon && ev.moon.score != null ? Math.round(ev.moon.score) : null,
      aqi: aqi == null ? null : Math.round(aqi),
      aqiTone: aqiB.tone,
      aqiLabel: aqiB[lang === "en" ? "en" : "zh"],
      uv: uv == null ? null : Math.round(uv * 10) / 10,
      uvTone: uvTone(uv)
    });
  }
  return items;
}
