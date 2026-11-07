/* ============================================================
   火烧云 · 页面逻辑
   数据 → 评分 → 渲染；城市默认上海，可切换/定位。
   ============================================================ */
import { loadSky, interpolator } from "./sources.js";
import { evaluate, glowFactors } from "./scoring.js";
import { CITIES, DEFAULT_CITY, cityById, nearestCity, cityLabel } from "./cities.js";
import { fmtHM, phaseName } from "./astro.js";

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
    now: "现在", sunset: "日落", blueHour: "蓝调", moonrise: "月出", sunrise: "日出",
    tlHint: "柱子是云量，紫点是降水概率高",
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
    srcNote: (t) => `数据：<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> 六个数值模式（ECMWF / CMA / ICON / GFS / JMA / UKMO）、ECMWF 50 个集合成员、空气质量气溶胶；<a href="https://www.met.no/" target="_blank" rel="noopener">挪威气象局 met.no</a> 做总云量交叉校验。更新于 ${t}。预报存在误差，概率仅供参考；光污染为城市级估算，郊区与山区通常更好。`,
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
    now: "now", sunset: "Sunset", blueHour: "Blue hour", moonrise: "Moonrise", sunrise: "Sunrise",
    tlHint: "Bars are cloud cover; a violet dash means rain is likely",
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
    srcNote: (t) => `Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> six models (ECMWF / CMA / ICON / GFS / JMA / UKMO), 50 ECMWF ensemble members, air-quality aerosol; <a href="https://www.met.no/" target="_blank" rel="noopener">met.no</a> for a total-cloud cross-check. Updated ${t}. Forecasts are uncertain and probabilities are indicative; light pollution is a city-level estimate.`,
    error: "Could not load the data — network or rate limit. Try again in a moment.",
    retry: "Retry",
    bortleNote: "city light pollution is strong; the Milky Way is not visible",
    moonUp: "visible tonight", moonDown: "below the horizon all night",
    week: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    today: "Today", tomorrow: "Tomorrow", dayAfter: "In 2 days",
    cloudPh: "Search a city, e.g. Shanghai"
  }
};

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
  sel: "evening", refreshing: false
};

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
  if (reload) loadData();
  else render();
}
function nameOf(c) { return cityLabel(c, lang()); }

/* ---------- 数据 ---------- */
async function loadData(force = false) {
  window.__skyReady = false;
  S.loading = !S.data;
  S.refreshing = !!S.data;
  S.error = null;
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
  } catch (e) {
    S.loading = false;
    S.refreshing = false;
    S.error = e;
    window.__skyReady = true;
    render();
  }
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
  $("#updateTime").textContent = upd ? `${t().updated} ${fmtHM(upd, 8)}${S.data.cached ? "（缓存）" : ""}` : "—";
  const rb = $("#refreshBtn");
  if (rb) { rb.textContent = S.refreshing ? t().updating : t().refresh; rb.disabled = S.refreshing; }
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

/* ---------- 渲染：时间轴 ---------- */
function renderTimeline() {
  const box = $("#timeline");
  $("#tlHint").textContent = t().tlHint;
  if (!S.days[0] || !S.data) { box.innerHTML = `<div class="sky-skeleton" style="height:140px"></div>`; return; }
  const ev = S.days[0];
  const dayStart = ev.date.getTime();
  const start = dayStart + 12 * 3600e3;
  const interps = S.data.models.map((m) => interpolator(S.data.times, m.cloud.total));
  const precipAt = interpolator(S.data.ctx.times, S.data.ctx.precip);
  const bars = [];
  for (let i = 0; i < 24; i++) {
    const at = new Date(start + i * 3600e3);
    const vals = interps.map((f) => f(at)).filter((v) => v != null);
    const cloud = vals.length ? vals.sort((a, b) => a - b)[vals.length >> 1] : 0;
    const rain = (precipAt(at) || 0) >= 55;
    const nearSun = [ev.sun.sunset, ev.sun.sunrise].some((d) => d && Math.abs(d - at) < 45 * 60000);
    const h = Math.max(3, Math.min(100, cloud));
    bars.push(`<div class="sky-bar ${nearSun ? "sun" : ""} ${rain ? "rain" : ""}" title="${fmtHM(at)} · ${round(cloud)}%"><i style="height:${h}%;opacity:${(0.18 + cloud / 100 * 0.62).toFixed(2)}"></i></div>`);
  }
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
  box.innerHTML = `<div class="sky-bars-wrap"><div class="sky-bars">${bars.join("")}</div>${nowLine}</div><div class="sky-axis">${axis}</div>`;
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
  const head = isGlow
    ? (lang() === "en"
      ? `<b>${node.prob}%</b> chance · typical score ${round(node.score)} · ${node.models.filter((m) => m.score >= 60).length}/${node.models.length} models above 60`
      : `<b>${node.prob}%</b> 概率 · 典型评分 ${round(node.score)} · 6 个模式中 ${node.models.filter((m) => m.score >= 60).length} 个达到 60 分`)
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
  $("#geoBtn").onclick = () => {
    if (!navigator.geolocation) return;
    $("#geoBtn").textContent = lang() === "en" ? "Locating…" : "定位中…";
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const near = nearestCity(latitude, longitude) || DEFAULT_CITY;
      setCity({ id: "geo", zh: "我的位置", en: "My location", province: "定位", lat: latitude, lon: longitude, bortle: near.bortle });
      $("#geoBtn").textContent = t().geo;
    }, () => {
      $("#geoBtn").textContent = t().geo;
    }, { timeout: 8000, maximumAge: 600000 });
  };
  $("#citySearch").addEventListener("input", (e) => renderCitySuggest(e.target.value));
  $("#citySearch").addEventListener("focus", (e) => renderCitySuggest(e.target.value));
  $("#citySearch").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("#citySuggest").hidden = true; } });
  document.addEventListener("click", (e) => { if (!e.target.closest(".nc-search")) $("#citySuggest").hidden = true; });
  document.addEventListener("ncn:lang", () => { render(); $("#citySearch").placeholder = t().cloudPh; });
  document.addEventListener("ncn:theme", () => {});
}

/* ---------- 总渲染 ---------- */
function render() {
  renderHero();
  renderCards();
  renderTimeline();
  renderDetail();
  renderModels();
  renderEnsemble();
  renderDays();
  renderEvents();
  renderNote();
}

/* ---------- 启动 ---------- */
S.city = loadCity();
window.__sky = S;
$("#citySearch").placeholder = t().cloudPh;
bind();
render();
loadData();
