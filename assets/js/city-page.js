/* ============================================================
   城市落地页：读取该城市今晚的实时评分，并跟随家族中英切换
   ============================================================ */
import { CITIES } from "./cities.js?v=23";
import { loadSky } from "./sources.js?v=25";
import { evaluate } from "./scoring.js?v=27";
import { fmtHM, phaseName, sunPosition, equatorialToAltAz } from "./astro.js?v=24";
import { buildDailyForecast } from "./forecast.js?v=6";
import { EVENTS as SKY_EVENTS } from "./events-feed.js?v=20261119c1";
import { renderShareCard, downloadShareCard, shareShareCard } from "./share-card.js?v=6";

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
    dawn: "朝霞", moon: "月亮",
    verdict: (sunset, glow, dawn, star, moon, why) =>
      `日落 ${sunset}，火烧云概率 ${glow}%；朝霞 ${dawn}%，星空 ${star} 分，月亮 ${moon} 分。${why}`,
    reasons: {
      low: "低云压得很低，西边地平线大概率被挡住。",
      good: "云层结构合适，值得提前找好西向视野。",
      rain: "日落前后有降水，云层容易被压平。",
      meh: "云和光都差一点，属于可看可不看的一晚。",
      noHigh: "高云和中云都太少，天上没有可以烧的云。"
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
    degraded: "部分数据源（{list}）本次没有取到，结果按其余数据源计算。",
    degradedNames: {
      models: "云量模式", ctx: "能见度与降水", ensemble: "集合预报",
      air: "空气质量", metno: "met.no 交叉校验"
    },
    eventGuide: "查看本地观测建议",
    eventCalendar: "查看天象日历",
    eventPeak: (date, time) => `${date} ${time}`,
    eventRadiant: (alt) => `本地辐射点约 ${alt}°`,
    eventZhr: (zhr) => `ZHR ${zhr}`,
    eventRegion: (region) => region,
    indexSearchPh: "搜索城市、景区或省份",
    indexCount: (visible, total) => visible === total ? `${total} 个目的地` : `${visible} / ${total} 个目的地`,
    indexEmpty: "没有找到匹配的目的地。",
    day: (k) => k === 0 ? "今晚" : k === 1 ? "明晚" : "后天",
    sunset: "日落", glow: "晚霞", star: "星空",
    starUnit: " 分", pct: "%",
    searchPh: "搜城市，回车跳转",
    noValue: "—",
    peak: (t) => `峰值 ${t}`,
    allUp: "整夜在地平线上",
    allDown: "整夜在地平线下",
    cloud: "云量", rain: "降水", temp: "温度",
    fHigh: "高云", fMid: "中云", fLow: "低云",
    fVis: "能见度", fAod: "气溶胶 AOD", fPrecip: "降水概率",
    fDew: "露点差", fAgree: "模式一致性", fEns: "集合成员",
    agree: (above, n) => `${above}/${n} 个模式 ≥60 分`,
    ens: (hit, n) => `${hit}/${n} 个成员达到门槛`,
    shareLoading: "正在生成分享图…",
    shareFail: "分享图生成失败，请稍后重试。",
    shareSaved: "已保存。微信里可以长按图片保存到相册。",
    shareHint: "长按图片也可保存到相册。",
    shareOpened: "已打开系统分享。",
    shareTitleText: "今晚，天会烧起来吗？",
    shareFileText: (c, g) => `${c}今晚晚霞概率 ${g}% · 火烧云观测`
  },
  en: {
    conf: (c) => c === "high" ? "high" : c === "mid" ? "medium" : "low",
    glowSub: (v, c) => `Index ${v} · ${c} confidence`,
    starSub: (cloud, moon) => `Cloud ${cloud}% · moonlight ${moon}%`,
    moonSub: (p, visible) => `${p} · ${visible ? "above the horizon" : "below the horizon all night"}`,
    dawn: "Dawn", moon: "Moon",
    verdict: (sunset, glow, dawn, star, moon, why) =>
      `Sunset ${sunset}, ${glow}% chance of a fire-cloud glow; dawn glow ${dawn}%, star score ${star}, Moon score ${moon}. ${why}`,
    reasons: {
      low: "Low cloud is sitting too thick — the western horizon will likely be blocked.",
      good: "Cloud structure is workable — find a western view early.",
      rain: "Rain around sunset tends to flatten the cloud deck.",
      meh: "Cloud and light are both slightly off — an optional night out.",
      noHigh: "Too little high or mid cloud; there is nothing for the sun to light up."
    },
    title: ["Worth going out tonight", "Worth a gamble tonight", "Better for stars tonight", "Not much of a show tonight"],
    date: (d) => bjDate(d).toLocaleDateString("en-US",
      { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }),
    updated: (t) => `Updated ${t} (China Standard Time)`,
    tzNote: (dur) => `Local solar time runs about ${dur} behind Beijing time; sunset and blue hour below are shown in China Standard Time (UTC+8).`,
    fail: "Could not load live data — please refresh later. The observing advice below is still useful.",
    loading: "Loading tonight's conditions…",
    degraded: "Some data sources ({list}) were unavailable this time; the result uses the remaining sources.",
    degradedNames: {
      models: "cloud models", ctx: "visibility & precipitation", ensemble: "ensemble",
      air: "air quality", metno: "met.no cross-check"
    },
    eventGuide: "Local viewing guide",
    eventCalendar: "Sky calendar",
    eventPeak: (date, time) => `${date} ${time}`,
    eventRadiant: (alt) => `radiant ~${alt}° locally`,
    eventZhr: (zhr) => `ZHR ${zhr}`,
    eventRegion: (region) => region,
    indexSearchPh: "Search a city, scenic spot or province",
    indexCount: (visible, total) => visible === total ? `${total} destinations` : `${visible} / ${total} destinations`,
    indexEmpty: "No matching destinations.",
    day: (k) => k === 0 ? "Tonight" : k === 1 ? "Tomorrow" : "Day after",
    sunset: "Sunset", glow: "Glow", star: "Stars",
    starUnit: " pts", pct: "%",
    searchPh: "Search a city, press Enter",
    noValue: "—",
    peak: (t) => `peak ${t}`,
    allUp: "above the horizon all night",
    allDown: "below the horizon all night",
    cloud: "Cloud", rain: "Rain", temp: "Temp",
    fHigh: "High cloud", fMid: "Mid cloud", fLow: "Low cloud",
    fVis: "Visibility", fAod: "Aerosol AOD", fPrecip: "Rain chance",
    fDew: "Dew-point spread", fAgree: "Model agreement", fEns: "Ensemble members",
    agree: (above, n) => `${above}/${n} models ≥60`,
    ens: (hit, n) => `${hit}/${n} members above threshold`,
    shareLoading: "Drawing the share image…",
    shareFail: "Could not create the share image. Please try again.",
    shareSaved: "Saved. In WeChat, long-press the image to save it to Photos.",
    shareHint: "You can also long-press the image to save it.",
    shareOpened: "System share sheet opened.",
    shareTitleText: "Will the sky burn tonight?",
    shareFileText: (c, g) => `${c}: ${g}% glow chance tonight · Sky Watch`
  }
};

function initialLang() {
  try {
    const m = document.cookie.match(/(?:^|; )ncn_lang=(en|zh)/);
    if (m) return m[1];
  } catch (e) {}
  try {
    const s = localStorage.getItem("lang");
    if (s === "en" || s === "zh") return s;
  } catch (e) {}
  return document.documentElement.lang === "en" ? "en" : "zh";
}
let LANG = initialLang();
const L = () => I18N[LANG];
let STATE = null;
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  const idxInput = $("#cityIndexSearch");
  if (idxInput) {
    idxInput.placeholder = L().indexSearchPh;
    idxInput.setAttribute("aria-label", L().indexSearchPh);
  }
  const idxEmpty = $("#cityIndexEmpty");
  if (idxEmpty) idxEmpty.textContent = L().indexEmpty;
  refreshCityIndex();
  const ariaKey = "data-aria-" + LANG;
  document.querySelectorAll("[data-aria-zh]").forEach((el) => {
    const v = el.getAttribute(ariaKey);
    if (v != null) el.setAttribute("aria-label", v);
  });
}

function reason(e) {
  const c = e.cloud || {};
  const R = L().reasons;
  if ((c.low || 0) > 60) return R.low;
  /* 集合模式可能给出高于确定性模式的把握；先看概率，避免出现
     「85% 火烧云」同时又说「没有可以烧的云」这种自相矛盾。 */
  if (e.prob >= 60) return R.good;
  if ((c.high || 0) < 10 && (c.mid || 0) < 12) return R.noHigh;
  if (e.ctx && e.ctx.precip > 60) return R.rain;
  return R.meh;
}

function setCard(id, value, sub, ratio) {
  const v = $(`#c${id}`), s = $(`#s${id}`), b = $(`#b${id}`);
  if (v) v.textContent = value;
  if (s) s.textContent = sub;
  if (b) b.style.width = Math.max(2, Math.min(100, ratio || 0)) + "%";
}

/* ---------- 今晚观测窗口 / 小时走势 / 关键因子 ---------- */
const AZ_ZH = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
const AZ_EN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function azName(az) {
  if (!Number.isFinite(az)) return "";
  const i = Math.round((((az % 360) + 360) % 360) / 45) % 8;
  return (LANG === "en" ? AZ_EN : AZ_ZH)[i];
}

function setText(id, v) {
  const el = $(id);
  if (!el) return;
  el.textContent = (v == null || v === "") ? L().noValue : v;
}

/* times 是 sources.js 里的毫秒时间戳数组 */
function sampleAt(times, values, t) {
  if (!times || !values || !times.length) return null;
  const target = t.getTime();
  let i = 0;
  while (i < times.length && +times[i] <= target) i++;
  if (i === 0) return values[0] ?? null;
  if (i >= times.length) return values[values.length - 1] ?? null;
  const t0 = +times[i - 1], t1 = +times[i];
  const v0 = values[i - 1], v1 = values[i];
  if (v0 == null || v1 == null) return v0 ?? v1 ?? null;
  const k = t1 === t0 ? 0 : (target - t0) / (t1 - t0);
  return v0 + (v1 - v0) * k;
}

function medianCloudAt(data, t) {
  const vals = [];
  for (const m of data.models || []) {
    const v = sampleAt(data.times, m.cloud && m.cloud.total, t);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

function renderObs(ev) {
  const t = L();
  const even = ev.evening;
  const win = even && even.window;
  const best = even && even.bestTime;
  let winTxt = null;
  if (win) winTxt = `${fmtHM(win.start)}–${fmtHM(win.end)}`;
  if (best) winTxt = winTxt ? `${winTxt} · ${t.peak(fmtHM(best))}` : fmtHM(best);
  setText("#obsWindow", winTxt);

  if (ev.sun && ev.sun.sunset) {
    const p = sunPosition(ev.sun.sunset, city.lat, city.lon);
    setText("#obsSunAz", `${azName(p.az)} ${Math.round(p.az)}°`);
  } else {
    setText("#obsSunAz", null);
  }
  if (ev.sun && ev.sun.sunrise) {
    const p = sunPosition(ev.sun.sunrise, city.lat, city.lon);
    setText("#obsDawnAz", `${azName(p.az)} ${Math.round(p.az)}°`);
  } else {
    setText("#obsDawnAz", null);
  }

  const moon = ev.moon || {};
  setText("#obsMoonrise", moon.rise ? fmtHM(moon.rise) : (moon.visible ? t.allUp : t.allDown));
  setText("#obsMoonset", moon.set ? fmtHM(moon.set) : (moon.visible ? t.allUp : t.allDown));

  setText("#obsDark", ev.dusk && ev.dawn ? `${fmtHM(ev.dusk)}–${fmtHM(ev.dawn)}` : null);
}

function renderHourly(data, ev) {
  const box = $("#hourlyBars");
  if (!box) return;
  const sunset = ev.sun && ev.sun.sunset;
  const ctx = data.ctx || {};
  if (!sunset || !ctx.times || !ctx.times.length) {
    box.innerHTML = `<p class="city-hint">${L().noValue}</p>`;
    return;
  }
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const at = new Date(sunset.getTime() + (i - 2) * 3600e3);
    pts.push({
      at,
      cloud: medianCloudAt(data, at),
      precip: sampleAt(ctx.times, ctx.precip, at),
      temp: sampleAt(ctx.times, ctx.temp, at)
    });
  }
  const temps = pts.map((p) => p.temp).filter(Number.isFinite);
  const tMin = temps.length ? Math.min(...temps) : 0;
  const tMax = temps.length ? Math.max(...temps) : 1;
  const span = Math.max(1.2, tMax - tMin);
  box.innerHTML = pts.map((p, i) => {
    const cloud = p.cloud == null ? 0 : Math.max(0, Math.min(100, p.cloud));
    const cloudTxt = p.cloud == null ? L().noValue : `${Math.round(cloud)}%`;
    const k = p.temp == null ? 0.5 : Math.max(0, Math.min(1, (p.temp - tMin) / span));
    const color = `hsl(${Math.round(210 - 185 * k)},68%,56%)`;
    const nearSun = i === 2;
    const rain = p.precip != null && p.precip >= 55;
    const title = `${fmtHM(p.at)} · ${L().cloud} ${cloudTxt}`
      + (p.temp != null ? ` · ${L().temp} ${Math.round(p.temp)}°C` : "")
      + (p.precip != null ? ` · ${L().rain} ${Math.round(p.precip)}%` : "");
    return `<div class="city-hcol ${nearSun ? "sun" : ""}" title="${title}">`
      + `<b>${cloudTxt}</b>`
      + `<div class="city-hbar"><i style="height:${Math.max(3, cloud)}%;background:${color}"></i></div>`
      + `<span>${fmtHM(p.at)}${nearSun ? " · " + L().sunset : ""}</span>`
      + (p.temp != null ? `<small>${Math.round(p.temp)}°</small>` : "")
      + (rain ? '<em class="rain">●</em>' : "")
      + `</div>`;
  }).join("");
}

function renderFactors(ev) {
  const box = $("#factorBody");
  if (!box || !ev.evening) return;
  const t = L();
  const cloud = ev.evening.cloud || {};
  const ctx = ev.evening.ctx || {};
  const pct = (v) => v == null ? t.noValue : `${Math.round(v)}%`;
  const num = (v, digits = 0, unit = "") => v == null ? t.noValue : `${Number(v).toFixed(digits)}${unit}`;
  const rows = [
    [t.fHigh, pct(cloud.high)],
    [t.fMid, pct(cloud.mid)],
    [t.fLow, pct(cloud.low)],
    [t.fVis, num(ctx.visibility, 0, " km")],
    [t.fAod, num(ctx.aod, 2)],
    [t.fPrecip, pct(ctx.precip)],
    [t.fDew, num(ctx.dewDep, 1, "°C")]
  ];
  const models = ev.evening.models || [];
  const above = models.filter((m) => m.score >= 60).length;
  const conf = t.conf(ev.evening.confidence);
  let html = rows.map(([k, v]) => `<div class="city-factor-row"><span>${k}</span><b>${v}</b></div>`).join("");
  if (models.length) {
    html += `<div class="city-factor-row city-factor-wide"><span>${t.fAgree}</span><b>${t.agree(above, models.length)} · ${conf}</b></div>`;
  }
  const ensN = ev.evening.ensN || 0;
  if (ensN) {
    const hit = Math.round((ev.evening.pEns55 || 0) * ensN);
    html += `<div class="city-factor-row city-factor-wide"><span>${t.fEns}</span><b>${t.ens(hit, ensN)}</b></div>`;
  }
  box.innerHTML = html;
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
  const items = buildDailyForecast(data, city, LANG, 5);
  box.innerHTML = items.map((d) => {
    const temp = d.tmax != null && d.tmin != null
      ? `${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°` : "—";
    const rain = d.precip == null ? "—" : `${Math.round(d.precip)}%`;
    const glow = d.glow == null ? "—" : `${d.glow}%`;
    const dawn = d.dawn == null ? "—" : `${d.dawn}%`;
    const star = d.star == null ? "—" : `${d.star}${t.starUnit}`;
    const moon = d.moonScore == null ? "—" : `${d.moonScore}${t.starUnit}`;
    const aqi = d.aqi == null ? "—" : String(d.aqi);
    const uv = d.uv == null ? "—" : String(d.uv);
    const airText = d.aqi == null
      ? (LANG === "en" ? "Air —" : "空气 —")
      : (LANG === "en" ? `Air ${aqi} (EU AQI) · ${d.aqiLabel}` : `空气 ${aqi}（欧洲 AQI） · ${d.aqiLabel}`);
    const airTitle = d.aqi == null
      ? (LANG === "en" ? "AQI forecast not available for this night" : "这一晚的 AQI 预报尚未覆盖")
      : (LANG === "en" ? `EU AQI ${aqi} · ${d.aqiLabel}` : `欧洲 AQI ${aqi} · ${d.aqiLabel}`);
    const uvTitle = LANG === "en" ? "Daytime UV peak" : "日间紫外线峰值";
    return `<div class="city-day">
      <div class="city-day-when"><b>${d.label}</b><small>${d.dateLabel}</small></div>
      <div class="city-day-wx"><b>${d.weatherLabel}</b><span>${temp}</span><em>${LANG === "en" ? "Rain" : "降水"} ${rain}</em></div>
      <div class="city-day-scores"><span>${t.sunset} ${d.sunset}</span><span>${t.glow} ${glow}</span><span>${t.dawn} ${dawn}</span><span class="city-day-val">${t.star} ${star}</span><span>${t.moon} ${moon}</span></div>
      <div class="city-day-aux">
        <span class="city-day-air ${d.aqiTone}" title="${airTitle}">${airText}</span>
        <span class="city-day-uv ${d.uvTone}" title="${uvTitle}">UV ${uv}</span>
      </div>
    </div>`;
  }).join("");
}

/* ---------- 城市目录：区域分组内的即时搜索 ---------- */
let cityIndexCards = null;
let cityIndexRegions = null;

function refreshCityIndex() {
  const input = $("#cityIndexSearch");
  if (!input || !cityIndexCards) return;
  const q = input.value.trim().toLowerCase();
  let visible = 0;
  cityIndexCards.forEach((card) => {
    const match = !q || (card.dataset.search || "").includes(q);
    card.hidden = !match;
    if (match) visible++;
  });
  cityIndexRegions.forEach((region) => {
    const provs = region.querySelectorAll(".city-index-prov");
    let regionVisible = 0;
    provs.forEach((prov) => {
      const shown = prov.querySelectorAll(".city-index-card:not([hidden])").length;
      const any = shown > 0;
      prov.hidden = !any;
      if (any) regionVisible += shown;
      /* 省份标题后的数字也要跟着搜索结果走，否则搜“黄山”时会看到
         “安徽 19”但实际只显示 1 张卡片。 */
      const small = prov.querySelector("h3 small");
      if (small) {
        if (!small.dataset.total) small.dataset.total = small.textContent;
        small.textContent = String(q ? shown : small.dataset.total);
      }
    });
    region.hidden = regionVisible === 0;
    if (q && regionVisible) region.open = true;
    const count = region.querySelector("summary em");
    if (count) {
      if (!count.dataset.total) count.dataset.total = count.textContent;
      count.textContent = String(q ? regionVisible : count.dataset.total);
    }
  });
  const count = $("#cityIndexCount");
  if (count) count.textContent = L().indexCount(visible, cityIndexCards.length);
  const empty = $("#cityIndexEmpty");
  if (empty) empty.hidden = visible !== 0;
}

function initCityIndex() {
  const input = $("#cityIndexSearch");
  if (!input) return;
  cityIndexCards = Array.from(document.querySelectorAll(".city-index-card"));
  cityIndexRegions = Array.from(document.querySelectorAll(".city-index-region"));
  input.addEventListener("input", refreshCityIndex);
  refreshCityIndex();
}

/* ---------- 城市页：数据源降级提示 ---------- */
function renderDataNotice(data) {
  const el = $("#cityDataNotice");
  if (!el) return;
  const dg = (data && data.degraded) || [];
  if (!dg.length) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const names = L().degradedNames || {};
  el.textContent = L().degraded(dg.map((k) => names[k] || k).join(LANG === "en" ? ", " : "、"));
  el.hidden = false;
}

/* ---------- 城市页：下一场天象（按北京时间运行时筛选） ---------- */
function eventPeakMs(e) {
  const raw = e.peak_utc || `${e.date}T12:00:00Z`;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : new Date(`${e.date}T12:00:00Z`).getTime();
}

function nextSkyEvent(now = new Date()) {
  return (SKY_EVENTS || [])
    .slice()
    .sort((a, b) => eventPeakMs(a) - eventPeakMs(b))
    .find((e) => eventPeakMs(e) >= now.getTime()) || null;
}

function eventDateParts(e) {
  const d = bjDate(new Date(e.peak_utc || `${e.date}T12:00:00Z`));
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { month, day, time };
}

function renderCityEvent() {
  const section = $("#cityEventSection");
  const box = $("#cityEvent");
  if (!section || !box || !city) return;
  const e = nextSkyEvent();
  if (!e) {
    section.hidden = true;
    box.innerHTML = "";
    return;
  }
  const en = LANG === "en";
  const parts = eventDateParts(e);
  const date = en ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parts.month - 1]} ${parts.day}` : `${parts.month} 月 ${parts.day} 日`;
  const isMeteor = e.kind === "meteor";
  let detail = "";
  if (isMeteor) {
    const peak = new Date(e.peak_utc || `${e.date}T12:00:00Z`);
    const alt = Math.max(0, Math.round(equatorialToAltAz(e.ra, e.dec, peak, city.lat, city.lon).alt));
    detail = L().eventPeak(date, parts.time) + " · " + L().eventRadiant(alt) + " · " + L().eventZhr(e.zhr);
  } else {
    detail = L().eventPeak(date, parts.time) + " · " + L().eventRegion(en ? (e.region_en || "") : (e.region_zh || ""));
  }
  const href = e.detail ? `/events/${e.slug}/` : "/events/";
  const link = e.detail ? L().eventGuide : L().eventCalendar;
  const kind = en ? (e.kind_en || e.kind) : (e.kind_zh || e.kind);
  box.innerHTML = `<div class="city-event-main">
    <span class="city-event-badge">${esc(kind)}</span>
    <b>${esc(en ? e.name_en : e.name_zh)}</b>
    <span>${esc(detail)}</span>
  </div><a class="sky-link" href="${href}">${esc(link)}</a>`;
  section.hidden = false;
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
  renderObs(STATE.ev);
  renderHourly(STATE.data, STATE.ev);
  renderFactors(STATE.ev);
  renderDays(STATE.data);
  renderTzNote();
  renderDataNotice(STATE.data);
  renderCityEvent();
}

/* ---------- 页面内生成分享图 ---------- */
let shareCardState = null;

function setShareReady(on) {
  const btn = $("#shareOpen");
  if (btn) btn.disabled = !on;
}

function shareFileName() {
  const p = bjDate(new Date());
  const n = `${p.getUTCFullYear()}${String(p.getUTCMonth() + 1).padStart(2, "0")}${String(p.getUTCDate()).padStart(2, "0")}`;
  return `sky-${city.id}-${n}.png`;
}

function closeShareSheet() {
  const sheet = $("#shareSheet");
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("share-open");
}

function syncShareLang() {
  /* 分享图里的文字是在打开时画的；切换语言后关掉旧图，避免中英混排 */
  closeShareSheet();
  shareCardState = null;
}

async function openShareSheet() {
  if (!STATE || !city) return;
  const btn = $("#shareOpen");
  const note = $("#shareNote");
  const previous = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = L().shareLoading;
  }
  if (note) note.textContent = L().shareHint;
  try {
    const daily = buildDailyForecast(STATE.data, city, LANG, 5)[0] || {};
    const { blob, dataUrl } = await renderShareCard({
      city, ev: STATE.ev, lang: LANG, daily,
      updatedAt: STATE.data.updated || null
    });
    shareCardState = {
      blob,
      filename: shareFileName(),
      text: L().shareFileText(LANG === "en" ? (city.en || city.zh) : city.zh,
        Math.round(STATE.ev.evening.prob))
    };
    const wrap = $("#sharePreviewWrap");
    if (wrap) {
      wrap.innerHTML = "";
      const img = document.createElement("img");
      img.className = "city-share-img";
      img.src = dataUrl;
      img.alt = LANG === "en"
        ? `${city.en || city.zh} tonight's sky share card`
        : `${city.zh}今晚天空分享图`;
      wrap.appendChild(img);
    }
    const sheet = $("#shareSheet");
    if (sheet) {
      sheet.hidden = false;
      sheet.setAttribute("aria-hidden", "false");
      document.body.classList.add("share-open");
      $("#shareClose")?.focus({ preventScroll: true });
    }
  } catch (e) {
    console.error(e);
    if (note) note.textContent = L().shareFail;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.getAttribute("data-" + LANG) || previous;
    }
  }
}

function saveShareImage() {
  if (!shareCardState) return;
  downloadShareCard(shareCardState.blob, shareCardState.filename);
  const note = $("#shareNote");
  if (note) note.textContent = L().shareSaved;
}

async function nativeShareImage() {
  if (!shareCardState) return;
  const note = $("#shareNote");
  const shared = await shareShareCard(
    shareCardState.blob,
    shareCardState.filename,
    L().shareTitleText,
    shareCardState.text
  );
  if (shared) {
    if (note) note.textContent = L().shareOpened;
    return;
  }
  /* 微信内置浏览器等不支持文件分享时，退回下载/长按保存 */
  saveShareImage();
}

$("#shareOpen")?.addEventListener("click", openShareSheet);
$("#shareDownload")?.addEventListener("click", saveShareImage);
$("#shareNative")?.addEventListener("click", nativeShareImage);
$("#shareClose")?.addEventListener("click", closeShareSheet);
$("[data-share-close]")?.addEventListener("click", closeShareSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#shareSheet")?.hidden) closeShareSheet();
});

function switchLang(l) {
  LANG = l === "en" ? "en" : "zh";
  applyStatic();
  renderAll();
  syncShareLang();
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
    setShareReady(true);
    window.__cityReady = true;
  } catch (e) {
    console.error(e);
    const box = $("#verdictText");
    if (box) box.textContent = L().fail;
    setShareReady(false);
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
else initCityIndex();
