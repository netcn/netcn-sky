/* 天象事件页：倒计时、本地辐射点高度曲线、月相与 .ics */
import { CITIES } from "./cities.js?v=23";
import { equatorialToAltAz, fmtHM, moonIllumination, phaseName } from "./astro.js?v=24";
import { loadSky } from "./sources.js?v=25";
import { buildDailyForecast, AQI_LABEL } from "./forecast.js?v=6";
import { renderEventShareCard, downloadShareCard, shareShareCard } from "./share-card.js?v=6";

const EVENT = window.__EVENT__;
const PEAK = new Date(EVENT.peak_utc);
const BJ = 8 * 3600e3;
const $ = (s) => document.querySelector(s);
const SHOWCASE = ["shanghai", "beijing", "guangzhou", "chengdu", "kunming", "lhasa", "urumqi", "harbin", "xian", "wuhan", "dunhuang", "sanya"];
const CITY_LIST = SHOWCASE.map((id) => CITIES.find((c) => c.id === id)).filter(Boolean);

function initialLang() {
  const m = (document.cookie || "").match(/(?:^|; )ncn_lang=(zh|en)/);
  if (m) return m[1];
  return localStorage.getItem("lang") === "en" ? "en" : "zh";
}
let LANG = initialLang();
let selected = CITY_LIST[0] ? CITY_LIST[0].id : "shanghai";
let forecastData = null;
let forecastCity = null;
let forecastLoading = false;
let forecastError = false;
let shareState = null;
let shareBusy = false;
let shareLocal = null;

const ST = {
  zh: {
    shareLoading: "正在生成分享图…",
    shareFail: "分享图生成失败，请稍后重试。",
    shareHint: "长按图片也可保存到相册。",
    shareSaved: "已保存。微信里可以长按图片保存到相册。",
    shareOpened: "已打开系统分享。",
    shareTitleText: (name) => `${name} · 火烧云天象`,
    shareFileText: (name, date) => `${name} · ${date} · 火烧云`
  },
  en: {
    shareLoading: "Creating the share image…",
    shareFail: "Could not create the share image. Please try again.",
    shareHint: "You can also long-press the image to save it.",
    shareSaved: "Saved. In WeChat, long-press the image to save it to your album.",
    shareOpened: "System share opened.",
    shareTitleText: (name) => `${name} · Sky Watch`,
    shareFileText: (name, date) => `${name} · ${date} · Sky Watch`
  }
};
const st = () => ST[LANG === "en" ? "en" : "zh"];

const AZ = {
  zh: ["北", "东北", "东", "东南", "南", "西南", "西", "西北"],
  en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
};
const azName = (az) => AZ[LANG][Math.round(az / 45) % 8] || "—";
const setText = (id, text) => { const el = $("#" + id); if (el) el.textContent = text; };
const moonAt = (d) => moonIllumination(d);

function bjDate(d) { return new Date(d.getTime() + BJ); }
function bjDateLabel(d) {
  const b = bjDate(d);
  return LANG === "en" ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][b.getUTCMonth()]} ${b.getUTCDate()}` : `${b.getUTCMonth() + 1} 月 ${b.getUTCDate()} 日`;
}
function phaseLabel(date) {
  const p = phaseName(moonIllumination(date).phase);
  return LANG === "en" ? p.en : p.zh;
}
function localAtLocal(y, m, d, h, min = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, min) - BJ);
}

function applyStatic() {
  document.documentElement.lang = LANG === "en" ? "en" : "zh-CN";
  document.querySelectorAll("[data-zh]").forEach((el) => {
    el.textContent = LANG === "en" ? (el.dataset.en || el.dataset.zh) : el.dataset.zh;
  });
  document.querySelectorAll("[data-aria-zh][data-aria-en]").forEach((el) => {
    el.setAttribute("aria-label", LANG === "en" ? el.dataset.ariaEn : el.dataset.ariaZh);
  });
  document.title = LANG === "en"
    ? "Geminids 2026 · December 14 · Sky Watch"
    : "2026 双子座流星雨 · 12 月 14 日 · 火烧云";
}

function tick() {
  const el = $("#eventCountdown");
  if (!el) return;
  const diff = PEAK.getTime() - Date.now();
  if (diff <= 0) {
    el.textContent = LANG === "en" ? "Peak has passed · check the nights around it" : "峰值已过 · 前后几晚仍可关注";
    return;
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  el.textContent = LANG === "en"
    ? `Peak in ${days}d ${hours}h ${mins}m`
    : `距峰值 ${days} 天 ${hours} 小时 ${mins} 分`;
}

function buildSelect() {
  const select = $("#eventCity");
  if (!select) return;
  select.innerHTML = CITY_LIST.map((c) => `<option value="${c.id}">${LANG === "en" ? c.en : c.zh}</option>`).join("");
  if (CITY_LIST.some((c) => c.id === selected)) select.value = selected;
  select.onchange = () => {
    closeShareSheet();
    selected = select.value;
    renderLocal();
    loadEventForecast();
  };
}

function chartPoints(city) {
  const peakBJ = bjDate(PEAK);
  const y = peakBJ.getUTCFullYear();
  const m = peakBJ.getUTCMonth() + 1;
  const d = peakBJ.getUTCDate();
  const start = localAtLocal(y, m, d, 18, 0);
  const end = new Date(start.getTime() + 12 * 3600e3);
  const points = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 30 * 60e3) {
    const dt = new Date(t);
    const pos = equatorialToAltAz(EVENT.ra, EVENT.dec, dt, city.lat, city.lon);
    points.push({ t: dt, alt: Math.max(0, Math.min(90, pos.alt)), raw: pos.alt });
  }
  return { points, start, end };
}

function drawChart(city) {
  const box = $("#eventChart");
  if (!box) return;
  const { points, start, end } = chartPoints(city);
  const mobile = window.innerWidth < 760;
  const W = mobile ? 440 : 760;
  const H = mobile ? 250 : 260;
  const L = mobile ? 38 : 46;
  const R = mobile ? 12 : 18;
  const T = mobile ? 16 : 20;
  const B = mobile ? 34 : 38;
  const x = (t) => L + ((t - start.getTime()) / (end.getTime() - start.getTime())) * (W - L - R);
  const y = (alt) => H - B - (alt / 90) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t.getTime()).toFixed(1)},${y(p.alt).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points[points.length - 1].t.getTime()).toFixed(1)},${H - B} L${x(points[0].t.getTime()).toFixed(1)},${H - B} Z`;
  const grid = [0, 30, 60, 90].map((a) => `<line class="chart-grid" x1="${L}" y1="${y(a)}" x2="${W - R}" y2="${y(a)}"/><text class="chart-label" x="${L - 7}" y="${y(a) + 4}" text-anchor="end">${a}°</text>`).join("");
  const xTicks = [18, 22, 2, 6].map((h, i) => {
    const t = new Date(start.getTime() + i * 4 * 3600e3);
    return `<text class="chart-label" x="${x(t.getTime())}" y="${H - 12}" text-anchor="${i === 3 ? "end" : "middle"}">${String(h).padStart(2, "0")}:00</text>`;
  }).join("");
  const peakX = x(PEAK.getTime());
  const peakAlt = equatorialToAltAz(EVENT.ra, EVENT.dec, PEAK, city.lat, city.lon).alt;
  const peakY = y(Math.max(0, Math.min(90, peakAlt)));
  const label = LANG === "en" ? "Shower peak 22:00" : "流星雨峰值 22:00";
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${LANG === "en" ? "Radiant altitude through the night" : "辐射点整夜高度曲线"}">
    <rect class="chart-bg" x="0" y="0" width="${W}" height="${H}" rx="12"/>
    ${grid}${xTicks}
    <path class="chart-area" d="${area}"/>
    <path class="chart-line" d="${path}"/>
    <line class="chart-peak" x1="${peakX}" y1="${T}" x2="${peakX}" y2="${H - B}"/>
    <circle cx="${peakX}" cy="${peakY}" r="5" fill="var(--ui-ac)" stroke="var(--ui-card)" stroke-width="3"/>
    <text class="chart-peak-label" x="${peakX - 9}" y="${Math.max(T + 12, peakY - 9)}" text-anchor="end">${label}</text>
  </svg>`;
}

function renderLocal() {
  const city = CITY_LIST.find((c) => c.id === selected) || CITY_LIST[0];
  if (!city) return;
  const peakPos = equatorialToAltAz(EVENT.ra, EVENT.dec, PEAK, city.lat, city.lon);
  const alt = peakPos.alt;
  const rate = Math.round(EVENT.zhr * Math.max(0, Math.sin(Math.max(0, alt) * Math.PI / 180)));
  const moon = moonAt(PEAK);
  shareLocal = {
    alt: Math.max(0, alt).toFixed(0),
    azName: azName(peakPos.az),
    az: peakPos.az.toFixed(0),
    rate,
    moonPct: Math.round(moon.fraction * 100),
    phase: phaseLabel(PEAK)
  };
  setText("localAlt", `${Math.max(0, alt).toFixed(0)}°`);
  setText("localAz", `${azName(peakPos.az)} ${peakPos.az.toFixed(0)}°`);
  setText("localRate", LANG === "en" ? `≈${rate}/h` : `≈${rate} 颗/h`);
  setText("localMoon", `${Math.round(moon.fraction * 100)}% · ${phaseLabel(PEAK)}`);
  const note = $("#eventLocalNote");
  if (note) {
    note.textContent = LANG === "en"
      ? `At peak (22:00 CST) the radiant is ${Math.max(0, alt).toFixed(0)}° high toward ${azName(peakPos.az)}. The rate is a geometric ceiling: cloud, light pollution and the Moon still reduce what you see. The radiant keeps rising after 22:00; later hours can show more meteors if skies stay clear.`
      : `峰值 22:00（北京时间）时，辐射点位于${azName(peakPos.az)}方向约 ${Math.max(0, alt).toFixed(0)}° 高。这里的每小时流星数只是几何上限，云量、光害和月光还会继续打折。22:00 后辐射点还会继续升高；如果天气允许，后半夜的可见流星数可能更多。`;
  }
  const cityLink = $("#eventCityLinks");
  if (cityLink) {
    cityLink.innerHTML = `<a class="sky-link" href="/city/${city.id}/">${LANG === "en" ? "Weather, light pollution and sites for this city" : "查看该城市的天气、光害与机位"}</a>`;
  }
  drawChart(city);
}

function eventsDaysToPeak() {
  return Math.floor((PEAK.getTime() - Date.now()) / 86400000);
}

function selectedEventCity() {
  return CITY_LIST.find((c) => c.id === selected) || CITY_LIST[0];
}

function renderForecastPlaceholder() {
  const body = $("#eventForecastBody");
  if (!body) return;
  const days = eventsDaysToPeak();
  let text;
  if (days < 0) {
    text = LANG === "en" ? "The event has passed; the weather window is closed." : "事件已过，天气窗口关闭。";
  } else if (forecastLoading) {
    text = LANG === "en" ? "Reading the next five nights…" : "正在读取未来 5 天…";
  } else if (forecastError) {
    text = LANG === "en" ? "Weather data could not be loaded; the astronomy above is still valid." : "天气数据暂时读取失败；上面的天文可见性仍然有效。";
  } else if (days > 10) {
    text = LANG === "en"
      ? `The event is ${days} days away. The weather window opens inside 10 days, so no long-range forecast is invented here.`
      : `距峰值还有 ${days} 天。天气窗口要在 10 天内才开启，现在不在这里编造远期预报。`;
  } else {
    text = LANG === "en" ? "Weather window is open; reading the next five nights…" : "天气窗口已开启，正在读取未来 5 天…";
  }
  body.innerHTML = `<p class="event-forecast-wait">${text}</p>`;
}

function renderEventForecast() {
  const body = $("#eventForecastBody");
  if (!body || !forecastData) return renderForecastPlaceholder();
  const city = selectedEventCity();
  if (!city) return renderForecastPlaceholder();
  const items = buildDailyForecast(forecastData, city, LANG, 5);
  const peakYmd = bjDate(PEAK).toISOString().slice(0, 10);
  const covered = items.some((d) => d.ymd === peakYmd);
  const rows = items.map((d) => {
    const temp = d.tmax != null && d.tmin != null
      ? `${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°` : "—";
    const rain = d.precip == null ? "—" : `${Math.round(d.precip)}%`;
    const glow = d.glow == null ? "—" : `${d.glow}%`;
    const star = d.star == null ? "—" : `${d.star}${LANG === "en" ? " pts" : " 分"}`;
    const aqi = d.aqi == null ? "—" : String(d.aqi);
    const uv = d.uv == null ? "—" : String(d.uv);
    const airSource = AQI_LABEL[LANG === "en" ? "en" : "zh"];
    const airText = d.aqi == null
      ? (LANG === "en" ? "Air —" : "空气 —")
      : (LANG === "en" ? `Air ${aqi} (${airSource}) · ${d.aqiLabel}` : `空气 ${aqi}（${airSource}） · ${d.aqiLabel}`);
    const airTitle = d.aqi == null
      ? (LANG === "en" ? "AQI forecast not available for this night" : "这一晚的 AQI 预报尚未覆盖")
      : (LANG === "en" ? `${airSource} ${aqi} · ${d.aqiLabel}` : `${airSource} ${aqi} · ${d.aqiLabel}`);
    return `<div class="event-fc-day">
      <div class="event-fc-when"><b>${d.label}</b><small>${d.dateLabel}</small></div>
      <div class="event-fc-wx"><b>${d.weatherLabel}</b><span>${temp}</span><em>${LANG === "en" ? "Rain" : "降水"} ${rain}</em></div>
      <div class="event-fc-scores"><span>${LANG === "en" ? "Sunset" : "日落"} ${d.sunset}</span><span>${LANG === "en" ? "Glow" : "晚霞"} ${glow}</span><span>${LANG === "en" ? "Stars" : "星空"} ${star}</span></div>
      <div class="event-fc-aux"><span class="event-fc-air ${d.aqiTone}" title="${airTitle}">${airText}</span><span class="event-fc-uv ${d.uvTone}" title="${LANG === "en" ? "Daytime UV peak" : "日间紫外线峰值"}">UV ${uv}</span></div>
    </div>`;
  }).join("");
  const hint = covered
    ? (LANG === "en" ? "The event date is inside this five-day window. Use the night cloud and Moon first; EU AQI is only a relaxed guide." : "事件日已进入这 5 天窗口。先看夜间云量和月光；欧洲 AQI 只作宽松参考。")
    : (LANG === "en" ? `The five-day window reaches ${items[items.length - 1].dateLabel}; the peak is still ${eventsDaysToPeak()} days away. Wait for the event date to enter the window.` : `当前 5 天只覆盖到 ${items[items.length - 1].dateLabel}，峰值还有 ${eventsDaysToPeak()} 天；等事件日进入窗口再看峰值当天。`);
  body.innerHTML = `<div class="event-fc-list">${rows}</div><p class="event-forecast-hint">${hint}</p>`;
}

async function loadEventForecast() {
  const city = selectedEventCity();
  if (!city) return;
  if (eventsDaysToPeak() < 0 || eventsDaysToPeak() > 10) {
    forecastData = null;
    forecastCity = null;
    forecastError = false;
    renderForecastPlaceholder();
    return;
  }
  if (forecastData && forecastCity === city.id && !forecastError) {
    renderEventForecast();
    return;
  }
  const requestCity = city.id;
  forecastLoading = true;
  forecastError = false;
  renderForecastPlaceholder();
  try {
    const data = await loadSky(city.lat, city.lon);
    if (selectedEventCity() && selectedEventCity().id === requestCity) {
      forecastData = data;
      forecastCity = requestCity;
      renderEventForecast();
    }
  } catch (e) {
    if (selectedEventCity() && selectedEventCity().id === requestCity) {
      forecastData = null;
      forecastCity = null;
      forecastError = true;
      renderForecastPlaceholder();
    }
  } finally {
    forecastLoading = false;
    if (forecastError) renderForecastPlaceholder();
  }
}

function refreshForecastView() {
  if (forecastData && forecastCity === selected) renderEventForecast();
  else renderForecastPlaceholder();
}

function renderFacts() {
  const moon = moonAt(PEAK);
  setText("factPeak", `${bjDateLabel(PEAK)} ${fmtHM(PEAK)}`);
  setText("factZhr", String(EVENT.zhr || "—"));
  setText("factRadiant", `${EVENT.ra}° / +${EVENT.dec}°`);
  setText("factMoon", `${Math.round(moon.fraction * 100)}% · ${phaseLabel(PEAK)}`);
}

function downloadIcs() {
  const stamp = new Date();
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  const end = new Date(PEAK.getTime() + 4 * 3600e3);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//sky.netcn.org//events//CN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${EVENT.slug}@sky.netcn.org`,
    `DTSTAMP:${fmt(stamp)}`,
    `DTSTART:${fmt(PEAK)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${LANG === "en" ? "Geminids 2026" : "2026 双子座流星雨"}`,
    `DESCRIPTION:${LANG === "en" ? "Peak at 22:00 CST, Dec 14. Find a dark site and let your eyes adapt." : "峰值 12 月 14 日 22:00（北京时间）。找暗处，给眼睛 20 分钟适应。"}`,
    `URL:https://sky.netcn.org/events/${EVENT.slug}/`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${LANG === "en" ? "Geminids peak tomorrow night" : "双子座流星雨明晚峰值"}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "geminids-2026.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const btn = $("#icsBtn");
  if (btn) {
    const old = btn.textContent;
    btn.textContent = LANG === "en" ? "Calendar file ready" : "日历已生成";
    setTimeout(() => { btn.textContent = old; }, 2200);
  }
}

function bjDateKey() {
  const d = new Date(Date.now() + BJ);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function shareFileName() {
  return `sky-${EVENT.slug}-${bjDateKey()}.png`;
}
function shareButtonLabel() {
  const b = $("#shareOpen");
  return b ? (b.getAttribute(LANG === "en" ? "data-en" : "data-zh") || "") : "";
}
function setShareReady(on) {
  const b = $("#shareOpen");
  if (b) b.disabled = !on || shareBusy;
}
function showShareNote(msg) {
  const n = $("#shareNote");
  if (n) n.textContent = msg;
}
function closeShareSheet() {
  const sheet = $("#shareSheet");
  if (!sheet) return;
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("share-open");
  shareState = null;
}
async function openShareSheet() {
  if (shareBusy || !EVENT) return;
  const city = selectedEventCity();
  if (!city) return;
  const sheet = $("#shareSheet");
  const preview = $("#sharePreviewWrap");
  const b = $("#shareOpen");
  if (!sheet || !preview) return;
  if (!shareLocal) renderLocal();
  shareBusy = true;
  if (b) { b.disabled = true; b.textContent = st().shareLoading; }
  showShareNote(st().shareLoading);
  preview.innerHTML = "";
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("share-open");
  try {
    const { blob, dataUrl } = await renderEventShareCard({
      event: EVENT, city, local: shareLocal, lang: LANG, updatedAt: Date.now()
    });
    const img = document.createElement("img");
    img.className = "city-share-img";
    img.src = dataUrl;
    img.alt = `${LANG === "en" ? (EVENT.name_en || EVENT.name_zh) : (EVENT.name_zh || EVENT.name_en)} ${LANG === "en" ? "share card" : "分享图"}`;
    preview.innerHTML = "";
    preview.appendChild(img);
    shareState = { blob, city };
    showShareNote(st().shareHint);
  } catch (e) {
    console.warn("event share card failed", e);
    showShareNote(st().shareFail);
  } finally {
    shareBusy = false;
    setShareReady(!!EVENT);
    if (b) b.textContent = shareButtonLabel();
  }
}
function saveShareImage() {
  if (!shareState) return;
  downloadShareCard(shareState.blob, shareFileName());
  showShareNote(st().shareSaved);
}
async function nativeShareImage() {
  if (!shareState) return;
  const name = LANG === "en" ? (EVENT.name_en || EVENT.name_zh) : (EVENT.name_zh || EVENT.name_en);
  const ok = await shareShareCard(
    shareState.blob,
    shareFileName(),
    st().shareTitleText(name),
    st().shareFileText(name, bjDateLabel(PEAK))
  );
  if (ok) { showShareNote(st().shareOpened); return; }
  saveShareImage();
}

function switchLang(l) {
  closeShareSheet();
  LANG = l === "en" ? "en" : "zh";
  applyStatic();
  buildSelect();
  renderFacts();
  renderLocal();
  refreshForecastView();
  tick();
}

document.addEventListener("ncn:lang", (e) => switchLang(e.detail && e.detail.lang));
const icsBtn = $("#icsBtn");
if (icsBtn) icsBtn.addEventListener("click", downloadIcs);
$("#shareOpen")?.addEventListener("click", openShareSheet);
$("#shareDownload")?.addEventListener("click", saveShareImage);
$("#shareNative")?.addEventListener("click", nativeShareImage);
$("#shareClose")?.addEventListener("click", closeShareSheet);
document.querySelectorAll("[data-share-close]").forEach((el) => el.addEventListener("click", closeShareSheet));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#shareSheet")?.hidden) closeShareSheet();
});
applyStatic();
buildSelect();
renderFacts();
renderLocal();
renderForecastPlaceholder();
setShareReady(!!EVENT);
tick();
loadEventForecast();
setInterval(tick, 1000);
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderLocal, 160);
});
