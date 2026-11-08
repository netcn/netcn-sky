/* ============================================================
   城市落地页：读取该城市今晚的实时评分
   ============================================================ */
import { CITIES } from "./cities.js";
import { loadSky } from "./sources.js";
import { evaluate } from "./scoring.js";
import { fmtHM, phaseName } from "./astro.js";

const $ = (s) => document.querySelector(s);
const city = CITIES.find((c) => c.id === document.body.dataset.city);
const L = {
  confHigh: "高", confMid: "中", confLow: "低",
  conf: (c) => c === "high" ? "高" : c === "mid" ? "中" : "低"
};

function dayLabel(d) {
  const w = "日一二三四五六"[d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${w}`;
}

function reason(e) {
  const c = e.cloud || {};
  if ((c.low || 0) > 60) return "低云压得很低，西边地平线大概率被挡住。";
  if ((c.high || 0) < 10) return "高云太少，天上没有可以烧的云。";
  if (e.prob >= 60) return "高云比例正好，值得提前找好西向视野。";
  if (e.ctx && e.ctx.precip > 60) return "日落前后有降水，云层容易被压平。";
  return "云和光都差一点，属于可看可不看的一晚。";
}

function setCard(id, value, unit, sub, ratio) {
  const v = $(`#c${id}`);
  const s = $(`#s${id}`);
  const b = $(`#b${id}`);
  if (v) v.textContent = value;
  if (s) s.textContent = sub;
  if (b) b.style.width = Math.max(2, Math.min(100, ratio || 0)) + "%";
  const card = v ? v.closest(".sky-card") : null;
  if (card) card.dataset.unit = unit || "";
}

function cards(ev) {
  setCard("Glow", Math.round(ev.evening.prob), "%",
    `指数 ${Math.round(ev.evening.score)} · 置信度${L.conf(ev.evening.confidence)}`, ev.evening.prob);
  setCard("Dawn", Math.round(ev.morning.prob), "%",
    `指数 ${Math.round(ev.morning.score)} · 置信度${L.conf(ev.morning.confidence)}`, ev.morning.prob);
  setCard("Star", Math.round(ev.star.score), "",
    `云量 ${Math.round(ev.star.cloud || 0)}% · 月光 ${Math.round((ev.star.moon.illum || 0) * 100)}%`, ev.star.score);
  setCard("Moon", Math.round(ev.moon.score), "",
    `${phaseName(ev.moon.phase).zh} · ${ev.moon.visible ? "在地平线上" : "整夜在地平线下"}`, ev.moon.score);
}

function strip(ev, data) {
  const sun = ev.sun;
  if ($("#cSunset")) $("#cSunset").textContent = fmtHM(sun.sunset);
  if ($("#cSunrise")) $("#cSunrise").textContent = fmtHM(sun.sunrise);
  if ($("#cBlue")) $("#cBlue").textContent = fmtHM(new Date(sun.sunset.getTime() + 25 * 60000));
  const cur = data.ctx && data.ctx.current;
  if ($("#cCloud")) $("#cCloud").textContent = cur ? Math.round(cur.cloud_cover) + "%" : "—";
}

function days(data) {
  const box = $("#cDays");
  if (!box) return;
  const now = new Date();
  const rows = [0, 1, 2].map((i) => {
    const d = new Date(now.getTime() + i * 86400000);
    const ev = evaluate(data, city, d);
    return { d, ev };
  });
  box.innerHTML = rows.map(({ d, ev }) => {
    const label = i0(d, now);
    return `<div class="city-day">
      <b>${label}</b>
      <span>日落 ${fmtHM(ev.sun.sunset)}</span>
      <em>晚霞 ${Math.round(ev.evening.prob)}%</em>
      <span class="city-day-val">星空 ${Math.round(ev.star.score)} 分</span>
    </div>`;
  }).join("");
  function i0(d, n) {
    const a = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const k = Math.round((b - a) / 86400000);
    return k === 0 ? "今晚" : k === 1 ? "明晚" : "后天";
  }
}

async function run() {
  try {
    const data = await loadSky(city.lat, city.lon);
    const ev = evaluate(data, city, new Date());
    const title = ev.evening.prob >= 65 ? "今晚值得出门"
      : ev.evening.prob >= 40 ? "今晚可以赌一把"
        : ev.star.score >= 55 ? "今晚更适合看星"
          : "今晚希望不大";
    if ($("#verdictTag")) $("#verdictTag").textContent = title;
    if ($("#verdictText")) {
      $("#verdictText").textContent =
        `日落 ${fmtHM(ev.sun.sunset)}，火烧云概率 ${Math.round(ev.evening.prob)}%；`
        + `朝霞 ${Math.round(ev.morning.prob)}%，星空 ${Math.round(ev.star.score)} 分，月亮 ${Math.round(ev.moon.score)} 分。`
        + reason(ev.evening);
    }
    if ($("#dateLabel")) $("#dateLabel").textContent = dayLabel(new Date());
    if ($("#updateTime")) $("#updateTime").textContent = `更新于 ${fmtHM(new Date())}`;
    cards(ev);
    strip(ev, data);
    days(data);
    window.__cityReady = true;
  } catch (e) {
    console.error(e);
    if ($("#verdictText")) $("#verdictText").textContent = "数据读取失败，请稍后刷新；预报本身仍可参考下方的观测建议。";
    window.__cityReady = "error";
  }
}

const search = document.getElementById("citySearch");
if (search) {
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const hit = CITIES.find((c) => c.zh.includes(q) || c.en.toLowerCase().includes(q));
    location.href = hit ? `/city/${hit.id}/` : "/city/";
  });
}

if (city) run();
