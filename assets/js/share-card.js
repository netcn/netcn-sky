/* 城市页分享图：纯前端 Canvas 绘制，不依赖后端。
   所有数字都来自当前页面的实时评分结果，生成 1080×1080 PNG。 */

const BG_URL = "/assets/share-bg.jpg";
const CALENDAR_BG = "/assets/share-bg-calendar.jpg";
const EVENT_BG = {
  meteor: "/assets/share-bg-meteor.jpg",
  "lunar-eclipse": "/assets/share-bg-lunar.jpg",
  "solar-eclipse": "/assets/share-bg-solar.jpg"
};
function eventBackground(kind) {
  return EVENT_BG[kind] || BG_URL;
}
const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';

const BJ = 8 * 3600e3;

function bjParts(date = new Date()) {
  const d = new Date(date.getTime() + BJ);
  return {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: "日一二三四五六"[d.getUTCDay()],
    hh: String(d.getUTCHours()).padStart(2, "0"),
    mm: String(d.getUTCMinutes()).padStart(2, "0")
  };
}

function hm(date) {
  if (!date) return "—";
  const d = new Date(date.getTime() + BJ);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function rounded(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 品牌标记：红橙半圆拱形 + 奶油色小蘑菇脸 */
function drawMark(ctx, x, y, s = 1) {
  const w = 52 * s, h = 26 * s;
  ctx.save();
  ctx.fillStyle = "#e85837";
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.arc(x + w / 2, y + h, w / 2, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();

  const fw = 30 * s, fh = 28 * s;
  ctx.fillStyle = "#fff0c9";
  rounded(ctx, x + (w - fw) / 2, y + h - 4 * s, fw, fh, 7 * s);
  ctx.fill();

  ctx.fillStyle = "#2a2222";
  const ex = 5 * s, ey = 9 * s;
  ctx.beginPath();
  ctx.arc(x + (w - fw) / 2 + 9 * s, y + h + ey, 1.7 * s, 0, Math.PI * 2);
  ctx.arc(x + (w - fw) / 2 + fw - 9 * s, y + h + ey, 1.7 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2a2222";
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h + 17 * s, 6 * s, 0.16 * Math.PI, 0.84 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

async function loadBackground(url = BG_URL) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  if (img.complete && img.naturalWidth) return img;
  try {
    const ready = await Promise.race([
      img.decode().then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 1500))
    ]);
    if (ready || (img.complete && img.naturalWidth)) return img;
    return null;
  } catch (e) {
    return img.complete && img.naturalWidth ? img : null;
  }
}

/* 让长标题在给定宽度内自动缩小，返回实际字号 */
function fitFont(ctx, text, maxWidth, start, weight = "800") {
  let size = start;
  while (size > 24) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawText(ctx, text, x, y, size, color, weight = "700", align = "left") {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.shadowColor = "rgba(30, 12, 10, .52)";
  ctx.shadowBlur = Math.max(8, size * .18);
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export async function renderShareCard({ city, ev, lang = "zh", daily = {}, updatedAt = null }) {
  await document.fonts?.ready?.catch?.(() => {});
  const bg = await loadBackground();

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const en = lang === "en";
  const name = en ? (city.en || city.zh) : city.zh;
  const p = bjParts();
  const dateLine = en
    ? `${name} · ${new Date(Date.now() + BJ).toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" })}`
    : `${name} · ${p.month}/${p.day} 周${p.weekday}`;
  const glow = Math.round(ev?.evening?.prob ?? 0);
  const dawn = Math.round(ev?.morning?.prob ?? 0);
  const star = Math.round(ev?.star?.score ?? 0);
  const moon = Math.round(ev?.moon?.score ?? 0);
  const sunset = hm(ev?.sun?.sunset);
  const windowStart = ev?.evening?.window?.start;
  const windowEnd = ev?.evening?.window?.end;
  const peak = ev?.evening?.bestTime;
  const best = windowStart && windowEnd
    ? `${hm(windowStart)}–${hm(windowEnd)}`
    : (peak ? hm(peak) : "—");
  /* 窗口只有几分钟时，「窗口」和「峰值」会显示成同一个时刻，避免重复 */
  const sameMoment = peak && best !== "—"
    && (best === hm(peak)
      || (windowStart && windowEnd && hm(windowStart) === hm(peak) && hm(windowEnd) === hm(peak)));
  const peakTxt = peak && !sameMoment ? hm(peak) : null;
  const aqi = daily?.aqi;
  const uv = daily?.uv;
  const updated = hm(updatedAt ? new Date(updatedAt) : new Date());

  /* 摄影底图铺满 1080×1080；没有加载成功则用同色系渐变兜底 */
  if (bg) {
    ctx.drawImage(bg, 0, 0, 1080, 1080);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, "#9b3737");
    g.addColorStop(.35, "#ef7548");
    g.addColorStop(.62, "#f8c375");
    g.addColorStop(.82, "#5d3542");
    g.addColorStop(1, "#111b2a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1080, 1080);
  }

  /* 上、下压暗，保证文字在明亮云层上依然可读 */
  const scrim = ctx.createLinearGradient(0, 0, 0, 1080);
  scrim.addColorStop(0, "rgba(13, 16, 23, .66)");
  scrim.addColorStop(.18, "rgba(13, 16, 23, .30)");
  scrim.addColorStop(.42, "rgba(13, 16, 23, .34)");
  scrim.addColorStop(.66, "rgba(13, 16, 23, .48)");
  scrim.addColorStop(.84, "rgba(13, 16, 23, .78)");
  scrim.addColorStop(1, "rgba(9, 13, 21, .94)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, 1080, 1080);

  /* 顶部品牌 + 城市/日期 */
  drawMark(ctx, 74, 72, 1.25);
  drawText(ctx, en ? "SKY WATCH" : "火烧云 · SKY WATCH", 150, 104, 27, "#fff3d7", "700");
  drawText(
    ctx,
    dateLine,
    1006, 104, 26, "rgba(255,243,215,.82)", "600", "right"
  );

  /* 标题 */
  const title1 = en ? "Will the sky" : "今晚，";
  const title2 = en ? "burn tonight?" : "天会烧起来吗？";
  const t1Size = fitFont(ctx, title1, 900, en ? 82 : 84);
  drawText(ctx, title1, 80, 300, t1Size, "#fff8e9", "800");
  const t2Size = fitFont(ctx, title2, 900, en ? 82 : 84);
  drawText(ctx, title2, 80, 300 + (en ? 88 : 92), t2Size, "#fff8e9", "800");

  /* 大分数 */
  drawText(ctx, String(glow), 76, 620, 196, "#fff7e7", "900");
  ctx.save();
  ctx.font = `900 196px ${FONT}`;
  const scoreW = ctx.measureText(String(glow)).width;
  ctx.restore();
  drawText(ctx, "%", 76 + scoreW + 6, 620, 74, "#ffe0b8", "800");
  drawText(ctx, en ? "Glow chance" : "晚霞概率", 76, 674, 32, "#ffe0b8", "700");

  /* 三项指标 */
  const metrics = en
    ? `Dawn ${dawn}%   ·   Stars ${star}   ·   Moon ${moon}`
    : `朝霞 ${dawn}%   ·   星空 ${star}   ·   月亮 ${moon}`;
  drawText(ctx, metrics, 78, 752, 30, "#ffecc9", "700");

  /* 最佳窗口与补充信息 */
  const bestLine = en
    ? `Best ${best}${peakTxt ? ` · Peak ${peakTxt}` : ""}`
    : `最佳窗口 ${best}${peakTxt ? ` · 峰值 ${peakTxt}` : ""}`;
  drawText(ctx, bestLine, 78, 814, 28, "#fff2d5", "700");

  const extras = [
    `${en ? "Sunset" : "日落"} ${sunset}`,
    aqi != null ? `AQI ${aqi}` : null,
    uv != null ? `UV ${uv}` : null
  ].filter(Boolean).join("  ·  ");
  if (extras) drawText(ctx, extras, 78, 868, 24, "rgba(255,243,221,.72)", "600");

  /* 底线、网址与更新时间 */
  ctx.save();
  ctx.strokeStyle = "rgba(255, 239, 214, .22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(78, 952);
  ctx.lineTo(1002, 952);
  ctx.stroke();
  ctx.restore();

  drawText(ctx, "sky.netcn.org", 78, 1004, 28, "#fff2d4", "700");
  drawText(ctx, `${en ? "Updated" : "更新"} ${updated}`, 1004, 1004, 22, "rgba(255,243,221,.60)", "600", "right");

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const dataUrl = canvas.toDataURL("image/png");
  return { canvas, blob, dataUrl };
}

export function downloadShareCard(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ---------- 天象页分享卡 ---------- */

async function makeEventCardBase(bgUrl = BG_URL) {
  await document.fonts?.ready?.catch?.(() => {});
  const bg = await loadBackground(bgUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");

  if (bg) {
    ctx.drawImage(bg, 0, 0, 1080, 1080);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, "#9b3737");
    g.addColorStop(.35, "#ef7548");
    g.addColorStop(.62, "#f8c375");
    g.addColorStop(.82, "#5d3542");
    g.addColorStop(1, "#111b2a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1080, 1080);
  }

  const scrim = ctx.createLinearGradient(0, 0, 0, 1080);
  scrim.addColorStop(0, "rgba(13, 16, 23, .66)");
  scrim.addColorStop(.18, "rgba(13, 16, 23, .30)");
  scrim.addColorStop(.42, "rgba(13, 16, 23, .34)");
  scrim.addColorStop(.66, "rgba(13, 16, 23, .48)");
  scrim.addColorStop(.84, "rgba(13, 16, 23, .78)");
  scrim.addColorStop(1, "rgba(9, 13, 21, .94)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, 1080, 1080);
  return { canvas, ctx };
}

function drawBrandRow(ctx, en, rightText) {
  drawMark(ctx, 74, 72, 1.25);
  drawText(ctx, en ? "SKY WATCH" : "火烧云 · SKY WATCH", 150, 104, 27, "#fff3d7", "700");
  if (rightText) drawText(ctx, rightText, 1006, 104, 25, "rgba(255,243,215,.82)", "600", "right");
}

function drawCardFooter(ctx, en, updatedAt) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 239, 214, .22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(78, 952);
  ctx.lineTo(1002, 952);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, "sky.netcn.org", 78, 1004, 28, "#fff2d4", "700");
  const updated = hm(updatedAt ? new Date(updatedAt) : new Date());
  drawText(ctx, `${en ? "Updated" : "更新"} ${updated}`, 1004, 1004, 22, "rgba(255,243,221,.60)", "600", "right");
}

function eventDateZh(iso) {
  const d = new Date(iso);
  const p = bjParts(d);
  return `${p.month} 月 ${p.day} 日`;
}
function eventDateEn(iso) {
  const d = new Date(iso);
  const p = bjParts(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${months[p.month - 1]} ${p.day}, ${weekdays[new Date(d.getTime() + BJ).getUTCDay()]}`;
}
function eventShortDate(iso) {
  const d = new Date(iso);
  const p = bjParts(d);
  return `${p.month}/${p.day}`;
}
function eventTime(iso) {
  return hm(new Date(iso));
}

function eventPeakMs(e) {
  const raw = e.peak_utc || `${e.date}T12:00:00Z`;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : new Date(`${e.date}T12:00:00Z`).getTime();
}

export async function renderCalendarShareCard({ events = [], lang = "zh", updatedAt = null }) {
  const now = Date.now();
  const future = events
    .filter((e) => eventPeakMs(e) >= now)
    .slice()
    .sort((a, b) => eventPeakMs(a) - eventPeakMs(b));
  const first = future[0];
  if (!first) throw new Error("calendar share card needs at least one future event");
  const en = lang === "en";
  const { canvas, ctx } = await makeEventCardBase(CALENDAR_BG);
  const n = future.length;

  drawBrandRow(ctx, en, en ? `2026–2030 · ${n} events` : `2026–2030 · ${n} 场天象`);

  const title1 = en ? "What's next" : "接下来，";
  const title2 = en ? "in the night sky" : "天上有什么值得等";
  const t1 = fitFont(ctx, title1, 900, en ? 82 : 84);
  drawText(ctx, title1, 80, 300, t1, "#fff8e9", "800");
  const t2 = fitFont(ctx, title2, 900, en ? 78 : 80);
  drawText(ctx, title2, 80, 300 + (en ? 88 : 92), t2, "#fff8e9", "800");

  const big = eventShortDate(first.date);
  drawText(ctx, big, 76, 620, 148, "#fff7e7", "900");
  drawText(ctx, en ? `Next · ${first.name_en}` : `下一场 · ${first.name_zh}`, 78, 676, 30, "#ffe0b8", "700");

  const meta = first.kind === "meteor"
    ? (en ? `ZHR ${first.zhr ?? "—"} · radiant ${first.ra ?? "—"}° / +${first.dec ?? "—"}°` : `ZHR ${first.zhr ?? "—"} · 辐射点 ${first.ra ?? "—"}° / +${first.dec ?? "—"}°`)
    : (en ? (first.region_en || first.summary_en || "") : (first.region_zh || first.summary_zh || ""));
  drawText(ctx, meta, 78, 752, 28, "#ffecc9", "700");

  const best = en
    ? (first.region_en || `Peak ${eventDateEn(first.peak_utc || first.date)} ${eventTime(first.peak_utc || first.date)}`)
    : (first.region_zh || `峰值 ${eventDateZh(first.peak_utc || first.date)} ${eventTime(first.peak_utc || first.date)}`);
  drawText(ctx, best, 78, 814, 25, "#fff2d5", "700");

  const upcoming = future.slice(1, 3).map((e) => en
    ? `${e.name_en} ${eventDateEn(e.date)}`
    : `${e.name_zh} ${eventDateZh(e.date)}`).join("  ·  ");
  if (upcoming) drawText(ctx, upcoming, 78, 868, 21, "rgba(255,243,221,.72)", "600");

  drawCardFooter(ctx, en, updatedAt);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const dataUrl = canvas.toDataURL("image/png");
  return { canvas, blob, dataUrl };
}

function eventKind(e) {
  if (e.kind) return e.kind;
  const s = `${e.slug || ""} ${e.name_en || ""} ${e.name_zh || ""}`.toLowerCase();
  if (s.includes("lunar")) return "lunar-eclipse";
  if (s.includes("solar")) return "solar-eclipse";
  return e.zhr != null ? "meteor" : "solar-eclipse";
}

export async function renderEventShareCard({ event, city, local = {}, lang = "zh", updatedAt = null }) {
  if (!event) throw new Error("event share card needs event data");
  const en = lang === "en";
  const kind = eventKind(event);
  const isMeteor = kind === "meteor";
  const { canvas, ctx } = await makeEventCardBase(eventBackground(kind));
  const peak = event.peak_utc || `${event.date}T12:00:00Z`;
  const cityName = en ? (city?.en || city?.zh || "China") : (city?.zh || "中国");
  const dateLine = en
    ? `${cityName} · ${eventDateEn(peak)}`
    : `${cityName} · ${bjParts(new Date(peak)).month}/${bjParts(new Date(peak)).day} 周${bjParts(new Date(peak)).weekday}`;

  drawBrandRow(ctx, en, dateLine);

  const title = en ? (event.name_en || event.name_zh) : (event.name_zh || event.name_en);
  const tSize = fitFont(ctx, title, 900, 86);
  drawText(ctx, title, 78, 300, tSize, "#fff8e9", "800");
  const subtitle = `${en ? eventDateEn(peak) : eventDateZh(peak)} ${eventTime(peak)}`;
  drawText(ctx, subtitle, 80, 382, 30, "rgba(255,243,215,.82)", "600");

  const big = isMeteor && event.zhr != null ? String(event.zhr) : eventTime(peak);
  drawText(ctx, big, 76, 620, 168, "#fff7e7", "900");
  const bigLabel = isMeteor && event.zhr != null
    ? (en ? "Ideal ZHR" : "理想 ZHR")
    : (en ? "Peak (CST)" : "峰值（北京时间）");
  drawText(ctx, bigLabel, 78, 674, 32, "#ffe0b8", "700");

  const alt = local.alt != null ? `${local.alt}°` : "—";
  const az = local.azName ? `${local.azName} ${local.az}°` : "";
  let line1, line2, best, extras;
  if (isMeteor) {
    line1 = en
      ? `Radiant at peak ${alt}${az ? ` · ${az}` : ""}`
      : `峰值时辐射点 ${alt}${az ? ` · ${az}` : ""}`;
    line2 = local.rate != null
      ? (en
        ? `Geometric ≈${local.rate}/h · Moon ${local.moonPct ?? "—"}% · ${local.phase || ""}`
        : `几何上限 ≈${local.rate} 颗/h · 月光 ${local.moonPct ?? "—"}% · ${local.phase || ""}`)
      : (en ? (event.active_en || "") : (event.active_zh || ""));
    best = en
      ? `Best after ${eventTime(peak)} · the radiant keeps rising`
      : `最佳 ${eventTime(peak)} 后 · 辐射点继续升高`;
    extras = en
      ? `Active ${event.active_en || "—"} · IMO 2026`
      : `活跃期 ${event.active_zh || "—"} · IMO 2026`;
  } else {
    const region = en ? (event.region_en || "Visible from parts of China") : (event.region_zh || "中国部分地区可见");
    line1 = region.split(/[；;]/)[0];
    line2 = kind === "lunar-eclipse"
      ? (en ? "Penumbral shading is subtle · barely visible" : "半影食较淡 · 肉眼几乎难以察觉")
      : (en ? "Partial in China · eclipse glasses required" : "中国可见偏食 · 必须使用日食眼镜");
    best = kind === "lunar-eclipse"
      ? (en ? "Around greatest eclipse · low in the southwest" : "食甚前后 · 西南低空观看")
      : (en ? "Before sunset · look low in the west" : "日落前 · 关注西方低空");
    extras = en ? "Visibility varies by location" : "各地可见程度不同，以当地天象为准";
  }
  const line1Size = isMeteor ? 28 : fitFont(ctx, line1, 900, 27);
  const line2Size = isMeteor ? 25 : fitFont(ctx, line2, 900, 25);
  drawText(ctx, line1, 78, 752, line1Size, "#ffecc9", "700");
  drawText(ctx, line2, 78, 798, line2Size, "#ffecc9", "700");
  drawText(ctx, best, 78, 840, 25, "#fff2d5", "700");
  if (extras) drawText(ctx, extras, 78, 882, 22, "rgba(255,243,221,.72)", "600");

  drawCardFooter(ctx, en, updatedAt);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const dataUrl = canvas.toDataURL("image/png");
  return { canvas, blob, dataUrl };
}


export async function shareShareCard(blob, filename, title, text) {
  if (!blob) return false;
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return true;
    }
  } catch (e) {
    if (e?.name === "AbortError") return true;
  }
  return false;
}
