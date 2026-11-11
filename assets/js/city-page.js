/* ============================================================
   城市落地页：读取该城市今晚的实时评分，并跟随家族中英切换
   ============================================================ */
import { CITIES } from "./cities.js?v=20";
import { loadSky } from "./sources.js?v=20";
import { evaluate } from "./scoring.js?v=20";
import { fmtHM, phaseName } from "./astro.js?v=20";

const $ = (s) => document.querySelector(s);
const city = CITIES.find((c) => c.id === document.body.dataset.city);

/* 全站时间基准是北京时间（UTC+8）：评分、日落、日期标签都必须按 UTC+8 判定，
   否则海外用户会看到「标题写 11 日、卡片却是 12 日」这种错位。
   这里不用浏览器本地时区，统一把瞬时加 8 小时后读 UTC 字段。 */
const BJ = 8 * 3600e3;
const bjDate = (d) => new Date(d.getTime() + BJ);
const bjDayIndex = (d) => Math.floor((d.getTime() + BJ) / 86400000);
/* 北京时间以东经 120° 为基准；每差 1° 相当于 4 分钟太阳时 */
const solarOffsetMin = (lon) => Math.round((120 - lon) * 4);

const I18N = {
  zh: {
    conf: (c) => c === "high" ? "高" : c === "mid" ? "中" : "低",
    glowSub: (v, c) => `指数 ${v} · 置信度${c}`,
    starSub: (cloud, moon) => `云量 ${cloud}% · 月光 ${moon}%`,
    moonSub: (p, visible) => `${p} · ${visible ? "在地平线上" : "整夜在地平线下"}`,
    verdict: (sunset, glow, dawn, star, moon, why) =>
      `日落 ${sunset}，火烧云概率 ${glow}%；朝霞 ${dawn}%，星空 ${star} 分，月亮 ${moon} 分。${why}`,
    reasons: {
      low: "低云压得很低，西边地平线大概率被挡住。",
      noHigh: "高云太少，天上没有可以烧的云。",
      good: "高云比例正好，值得提前找好西向视野。",
      rain: "日落前后有降水，云层容易被压平。",
      meh: "云和光都差一点，属于可看可不看的一晚。"
    },
    title: ["今晚值得出门", "今晚可以赌一把", "今晚更适合看星", "今晚希望不大"],
    date: (d) => {
      const b = bjDate(d);
      return `${b.getUTCMonth() + 1} 月 ${b.getUTCDate()} 日 · 周${"日一二三四五六"[b.getUTCDay()]}`;
    },
    updated: (t) => `更新于 ${t}（北京时间）`,
    tzNote: (dur) => `当地太阳时比北京时间晚约 ${dur}；下方日落与蓝调时刻均按北京时间（UTC+8）显示。`,
    fail: "数据读取失败，请稍后刷新；预报本身仍可参考下方的观测建议。",
    loading: "正在读取今晚的观测条件…",
    day: (k) => k === 0 ? "今晚" : k === 1 ? "明晚" : "后天",
    sunset: "日落", glow: "晚霞", star: "星空",
    starUnit: " 分", pct: "%",
    searchPh: "搜城市，回车跳转"
  },
  en: {
    conf: (c) => c === "high" ? "high" : c === "mid" ? "medium" : "low",
    glowSub: (v, c) => `Index ${v} · ${c} confidence`,
    starSub: (cloud, moon) => `Cloud ${cloud}% · moonlight ${moon}%`,
    moonSub: (p, visible) => `${p} · ${visible ? "above the horizon" : "below the horizon all night"}`,
    verdict: (sunset, glow, dawn, star, moon, why) =>
      `Sunset ${sunset}, ${glow}% chance of a fire-cloud glow; dawn glow ${dawn}%, star score ${star}, Moon score ${moon}. ${why}`,
    reasons: {
      low: "Low cloud is sitting too thick — the western horizon will likely be blocked.",
      noHigh: "Not enough high cloud; there is nothing for the sun to light up.",
      good: "The high-cloud fraction is just right — find a western view early.",
      rain: "Rain around sunset tends to flatten the cloud deck.",
      meh: "Cloud and light are both slightly off — an optional night out."
    },
    title: ["Worth going out tonight", "Worth a gamble tonight", "Better for stars tonight", "Not much of a show tonight"],
    date: (d) => bjDate(d).toLocaleDateString("en-US",
      { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }),
    updated: (t) => `Updated ${t} (China Standard Time)`,
    tzNote: (dur) => `Local solar time runs about ${dur} behind Beijing time; sunset and blue hour below are shown in China Standard Time (UTC+8).`,
    fail: "Could not load live data — please refresh later. The observing advice below is still useful.",
    loading: "Loading tonight's conditions…",
    day: (k) => k === 0 ? "Tonight" : k === 1 ? "Tomorrow" : "Day after",
    sunset: "Sunset", glow: "Glow", star: "Stars",
    starUnit: " pts", pct: "%",
    searchPh: "Search a city, press Enter"
  }
};

let LANG = document.documentElement.lang === "en" ? "en" : "zh";
const L = () => I18N[LANG];
let STATE = null;

/* 静态文案：data-zh / data-en；title 与 meta 也一并切换 */
function applyStatic() {
  const key = "data-" + LANG;
  document.querySelectorAll("[data-zh]").forEach((el) => {
    const v = el.getAttribute(key);
    if (v == null) return;
    if (el.tagName === "META") el.setAttribute("content", v);
    else el.textContent = v;
  });
  const input = $("#citySearch");
  if (input) {
    input.placeholder = L().searchPh;
    input.setAttribute("aria-label", LANG === "en" ? "Search city" : "搜索城市");
  }
}

function reason(e) {
  const c = e.cloud || {};
  const R = L().reasons;
  if ((c.low || 0) > 60) return R.low;
  if ((c.high || 0) < 10) return R.noHigh;
  if (e.prob >= 60) return R.good;
  if (e.ctx && e.ctx.precip > 60) return R.rain;
  return R.meh;
}

function setCard(id, value, sub, ratio) {
  const v = $(`#c${id}`), s = $(`#s${id}`), b = $(`#b${id}`);
  if (v) v.textContent = value;
  if (s) s.textContent = sub;
  if (b) b.style.width = Math.max(2, Math.min(100, ratio || 0)) + "%";
}

function renderCards(ev) {
  const t = L();
  setCard("Glow", Math.round(ev.evening.prob),
    t.glowSub(Math.round(ev.evening.score), t.conf(ev.evening.confidence)), ev.evening.prob);
  setCard("Dawn", Math.round(ev.morning.prob),
    t.glowSub(Math.round(ev.morning.score), t.conf(ev.morning.confidence)), ev.morning.prob);
  setCard("Star", Math.round(ev.star.score),
    t.starSub(Math.round(ev.star.cloud || 0), Math.round((ev.star.moon.illum || 0) * 100)), ev.star.score);
  setCard("Moon", Math.round(ev.moon.score),
    t.moonSub(phaseName(ev.moon.phase)[LANG === "en" ? "en" : "zh"], ev.moon.visible), ev.moon.score);
}

function renderStrip(ev, data) {
  const sun = ev.sun;
  if ($("#cSunset")) $("#cSunset").textContent = fmtHM(sun.sunset);
  if ($("#cSunrise")) $("#cSunrise").textContent = fmtHM(sun.sunrise);
  if ($("#cBlue")) $("#cBlue").textContent = fmtHM(new Date(sun.sunset.getTime() + 25 * 60000));
  const cur = data.ctx && data.ctx.current;
  if ($("#cCloud")) $("#cCloud").textContent = cur ? Math.round(cur.cloud_cover) + "%" : "—";
}

function renderDays(data) {
  const box = $("#cDays");
  if (!box || !city) return;
  const t = L();
  const now = new Date();
  /* 「今晚/明晚/后天」按北京时间的自然日算，不能用浏览器本地零点 */
  const base = bjDayIndex(now);
  box.innerHTML = [0, 1, 2].map((i) => {
    const d = new Date(now.getTime() + i * 86400000);
    const ev = evaluate(data, city, d);
    const k = bjDayIndex(d) - base;
    return `<div class="city-day">
      <b>${t.day(k)}</b>
      <span>${t.sunset} ${fmtHM(ev.sun.sunset)}</span>
      <em>${t.glow} ${Math.round(ev.evening.prob)}%</em>
      <span class="city-day-val">${t.star} ${Math.round(ev.star.score)}${t.starUnit}</span>
    </div>`;
  }).join("");
}

/* 乌鲁木齐（东经 87.6°）等地官方用北京时间，但太阳时比北京晚 2 小时以上：
   夏天日落显示 21:50 常被误认为数据错误，这里给一句说明。
   偏移小于 45 分钟的东部城市不显示，避免噪声。 */
function renderTzNote() {
  if (!city) return;
  const strip = document.querySelector(".city-strip");
  if (!strip) return;
  const off = Math.abs(solarOffsetMin(city.lon));
  let el = document.querySelector("#cTzNote");
  if (off < 45) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("p");
    el.id = "cTzNote";
    el.className = "sky-hint";
    el.style.margin = "-10px 0 14px";
    strip.insertAdjacentElement("afterend", el);
  }
  const h = Math.floor(off / 60), m = off % 60;
  const dur = LANG === "en"
    ? [h ? h + (h > 1 ? " hours" : " hour") : "", m ? m + " min" : ""].filter(Boolean).join(" ")
    : [h ? h + " 小时" : "", m ? m + " 分" : ""].filter(Boolean).join(" ");
  el.textContent = L().tzNote(dur);
}

function renderVerdict(ev) {
  const t = L();
  const box = $("#verdictText");
  if (box) box.textContent = t.verdict(
    fmtHM(ev.sun.sunset), Math.round(ev.evening.prob), Math.round(ev.morning.prob),
    Math.round(ev.star.score), Math.round(ev.moon.score), reason(ev.evening));
  const dl = $("#dateLabel");
  if (dl) dl.textContent = t.date(new Date());
  const ut = $("#updateTime");
  if (ut) ut.textContent = t.updated(fmtHM(new Date()));
}

function renderAll() {
  if (!STATE) return;
  renderVerdict(STATE.ev);
  renderCards(STATE.ev);
  renderStrip(STATE.ev, STATE.data);
  renderDays(STATE.data);
  renderTzNote();
}

function switchLang(l) {
  LANG = l === "en" ? "en" : "zh";
  applyStatic();
  renderAll();
}

document.addEventListener("ncn:lang", (e) => switchLang(e.detail && e.detail.lang));

applyStatic();
const vt = $("#verdictText");
if (vt && !STATE) vt.textContent = L().loading;

async function run() {
  try {
    const data = await loadSky(city.lat, city.lon);
    const ev = evaluate(data, city, new Date());
    STATE = { data, ev };
    renderAll();
    window.__cityReady = true;
  } catch (e) {
    console.error(e);
    const box = $("#verdictText");
    if (box) box.textContent = L().fail;
    window.__cityReady = "error";
  }
}

const search = $("#citySearch");
if (search) {
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const hit = CITIES.find((c) => c.zh.includes(q) || c.en.toLowerCase().includes(q));
    location.href = hit ? `/city/${hit.id}/` : "/city/";
  });
}

window.__cityLang = () => LANG;
if (city) run();
