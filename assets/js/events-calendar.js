/* 天象日历：中英切换 + 按北京时间筛选下一场 + 页面内分享图 */
import { renderCalendarShareCard, downloadShareCard, shareShareCard } from "./share-card.js?v=6";

const $ = (s) => document.querySelector(s);
const EVENTS = Array.isArray(window.__EVENTS__) ? window.__EVENTS__ : [];

function peakMs(e) {
  const raw = e.peak_utc || `${e.date}T12:00:00Z`;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : new Date(`${e.date}T12:00:00Z`).getTime();
}
function futureEvents() {
  const now = Date.now();
  return EVENTS
    .filter((e) => peakMs(e) >= now)
    .slice()
    .sort((a, b) => peakMs(a) - peakMs(b));
}
function badgeText(state, en) {
  if (state === "past") return en ? ["Past", "Past"] : ["已过", "已过"];
  if (state === "next") return en ? ["Next", "Next"] : ["下一场", "下一场"];
  return en ? ["Preview", "Preview"] : ["预告", "预告"];
}
function decorateEvents() {
  const future = futureEvents();
  const first = future[0] ? (future[0].slug || future[0].date) : null;
  const now = Date.now();
  const en = lang === "en";
  document.querySelectorAll(".event-card[data-event-date]").forEach((card) => {
    const peak = new Date(card.dataset.eventPeak || `${card.dataset.eventDate}T12:00:00Z`).getTime();
    const slug = card.dataset.eventSlug || card.dataset.eventDate;
    const state = peak < now ? "past" : slug === first ? "next" : "preview";
    card.classList.toggle("event-card-past", state === "past");
    const badge = card.querySelector(".event-badge");
    if (!badge) return;
    const text = badgeText(state, en)[0];
    badge.textContent = text;
    badge.dataset.zh = state === "past" ? "已过" : state === "next" ? "下一场" : "预告";
    badge.dataset.en = state === "past" ? "Past" : state === "next" ? "Next" : "Preview";
    badge.className = `event-badge ${state}`;
  });
  setShareReady(future.length > 0);
  return future;
}

function initialLang() {
  const m = (document.cookie || "").match(/(?:^|; )ncn_lang=(zh|en)/);
  if (m) return m[1];
  return localStorage.getItem("lang") === "en" ? "en" : "zh";
}

const T = {
  zh: {
    shareLoading: "正在生成分享图…",
    shareFail: "分享图生成失败，请稍后重试。",
    shareHint: "长按图片也可保存到相册。",
    shareSaved: "已保存。微信里可以长按图片保存到相册。",
    shareOpened: "已打开系统分享。",
    shareTitleText: "接下来，天上有什么值得等？",
    shareFileText: (name, date) => `${name} · ${date} · 天象日历`
  },
  en: {
    shareLoading: "Creating the share image…",
    shareFail: "Could not create the share image. Please try again.",
    shareHint: "You can also long-press the image to save it.",
    shareSaved: "Saved. In WeChat, long-press the image to save it to your album.",
    shareOpened: "System share opened.",
    shareTitleText: "What's next in the night sky?",
    shareFileText: (name, date) => `${name} · ${date} · Sky calendar`
  }
};

let lang = initialLang();
let shareState = null;
let shareBusy = false;
const t = () => T[lang === "en" ? "en" : "zh"];

function bjDateKey() {
  const d = new Date(Date.now() + 8 * 3600e3);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function shareFileName() { return `sky-calendar-${bjDateKey()}.png`; }
function shareButtonLabel() {
  const b = $("#shareOpen");
  return b ? (b.getAttribute(lang === "en" ? "data-en" : "data-zh") || "") : "";
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
  const future = futureEvents();
  if (shareBusy || !future.length) return;
  const sheet = $("#shareSheet");
  const preview = $("#sharePreviewWrap");
  const b = $("#shareOpen");
  if (!sheet || !preview) return;
  shareBusy = true;
  if (b) { b.disabled = true; b.textContent = t().shareLoading; }
  showShareNote(t().shareLoading);
  preview.innerHTML = "";
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("share-open");
  try {
    const { blob, dataUrl } = await renderCalendarShareCard({ events: future, lang, updatedAt: Date.now() });
    const img = document.createElement("img");
    img.className = "city-share-img";
    img.src = dataUrl;
    img.alt = lang === "en" ? "Sky calendar share card" : "天象日历分享图";
    preview.innerHTML = "";
    preview.appendChild(img);
    shareState = { blob, name: future[0] };
    showShareNote(t().shareHint);
  } catch (e) {
    console.warn("calendar share card failed", e);
    showShareNote(t().shareFail);
  } finally {
    shareBusy = false;
    setShareReady(future.length > 0);
    if (b) b.textContent = shareButtonLabel();
  }
}
function saveShareImage() {
  if (!shareState) return;
  downloadShareCard(shareState.blob, shareFileName());
  showShareNote(t().shareSaved);
}
async function nativeShareImage() {
  if (!shareState) return;
  const first = shareState.name || futureEvents()[0];
  if (!first) return;
  const ok = await shareShareCard(
    shareState.blob,
    shareFileName(),
    t().shareTitleText,
    t().shareFileText(lang === "en" ? first.name_en : first.name_zh, first.date)
  );
  if (ok) { showShareNote(t().shareOpened); return; }
  saveShareImage();
}

function apply(l) {
  lang = l === "en" ? "en" : "zh";
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.querySelectorAll("[data-zh]").forEach((el) => {
    el.textContent = lang === "en" ? (el.dataset.en || el.dataset.zh) : el.dataset.zh;
  });
  document.querySelectorAll("[data-aria-zh][data-aria-en]").forEach((el) => {
    el.setAttribute("aria-label", lang === "en" ? el.dataset.ariaEn : el.dataset.ariaZh);
  });
  document.title = lang === "en"
    ? "Sky calendar · Meteors and eclipses · Sky Watch"
    : "天象日历 · 流星雨、日食与月食 · 火烧云";
  decorateEvents();
}

document.addEventListener("ncn:lang", (e) => {
  closeShareSheet();
  apply(e.detail && e.detail.lang);
});
$("#shareOpen")?.addEventListener("click", openShareSheet);
$("#shareDownload")?.addEventListener("click", saveShareImage);
$("#shareNative")?.addEventListener("click", nativeShareImage);
$("#shareClose")?.addEventListener("click", closeShareSheet);
document.querySelectorAll("[data-share-close]").forEach((el) => el.addEventListener("click", closeShareSheet));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#shareSheet")?.hidden) closeShareSheet();
});

apply(lang);
window.__calendarReady = true;
