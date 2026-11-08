/* ============================================================
   首页综合图层（方案 D）
   - 卫星 / 街道 / 深色三种底图（Esri，支持 CORS）
   - 晚霞指数热力：5×5 网格 × 3 个模式，日落窗口评分
   - 雷达降水：RainViewer 最近 2 小时 13 帧，可回放
   - 台风：NASA EONET 最新记录位置
   地图按需初始化（进入视口才加载 Leaflet 实例与瓦片），不拖首屏。
   ============================================================ */
import { fmtHM } from "./astro.js";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const BASEMAPS = {
  sat: ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}",
  street: ESRI + "World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  dark: ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
};
const BASE_KEY = "sky_map_base_v1";
const RADAR_TTL = 5 * 60 * 1000;

const GLOW_STOPS = [
  [0, [70, 102, 140, 0]],
  [10, [76, 112, 152, 104]],
  [22, [96, 130, 150, 148]],
  [32, [150, 150, 128, 174]],
  [44, [214, 190, 104, 178]],
  [56, [244, 186, 78, 204]],
  [70, [246, 142, 54, 224]],
  [84, [228, 74, 58, 236]],
  [100, [168, 24, 108, 244]]
];

const T = {
  zh: {
    glow: "晚霞", radar: "雷达", storms: "台风",
    sat: "卫星", street: "街道", dark: "深色",
    glowTitle: "晚霞指数", radarTitle: "雷达降水", stormNote: "台风",
    play: "回放近 2 小时", pause: "暂停",
    src: "底图 Esri · 雷达 RainViewer · 晚霞 Open-Meteo（ECMWF / CMA / ICON）",
    empty: "地图数据暂时不可用"
  },
  en: {
    glow: "Glow", radar: "Radar", storms: "Storms",
    sat: "Satellite", street: "Street", dark: "Dark",
    glowTitle: "Glow index", radarTitle: "Radar", stormNote: "Storm",
    play: "Replay last 2h", pause: "Pause",
    src: "Basemap Esri · Radar RainViewer · Glow Open-Meteo (ECMWF / CMA / ICON)",
    empty: "Map data is unavailable"
  }
};

function ramp(v) {
  const x = Math.max(0, Math.min(100, v));
  let a = GLOW_STOPS[0], b = GLOW_STOPS[GLOW_STOPS.length - 1];
  for (let i = 0; i < GLOW_STOPS.length - 1; i++) {
    if (x >= GLOW_STOPS[i][0] && x <= GLOW_STOPS[i + 1][0]) { a = GLOW_STOPS[i]; b = GLOW_STOPS[i + 1]; break; }
  }
  const k = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
  return [
    Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
    Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
    Math.round(a[1][2] + (b[1][2] - a[1][2]) * k),
    Math.round(a[1][3] + (b[1][3] - a[1][3]) * k)
  ];
}
const rgba = (c) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(2)})`;

/* ---------- 网格 → 热力图 ---------- */
function meta(points) {
  const lats = [...new Set(points.map((p) => p.lat))].sort((a, b) => a - b);
  const lons = [...new Set(points.map((p) => p.lon))].sort((a, b) => a - b);
  return { lats, lons, rows: lats.length, cols: lons.length };
}
function boundsOf(points) {
  const { lats, lons } = meta(points);
  const dLat = lats.length > 1 ? Math.abs(lats[1] - lats[0]) / 2 : 0.1;
  const dLon = lons.length > 1 ? Math.abs(lons[1] - lons[0]) / 2 : 0.1;
  return [[lats[0] - dLat, lons[0] - dLon], [lats[lats.length - 1] + dLat, lons[lons.length - 1] + dLon]];
}
function viewBoundsOf(points) {
  const { lats, lons } = meta(points);
  return [[lats[0], lons[0]], [lats[lats.length - 1], lons[lons.length - 1]]];
}
function paint(points, values, size = 168, feather = 0.2) {
  const { rows, cols } = meta(points);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  const at = (r, c) => {
    const v = values[r * cols + c];
    return Number.isFinite(v) ? v : 0;
  };
  const band = Math.max(1, size * feather);
  for (let y = 0; y < size; y++) {
    const gy = (1 - y / (size - 1)) * (rows - 1);
    const r0 = Math.min(rows - 1, Math.floor(gy));
    const r1 = Math.min(rows - 1, r0 + 1);
    const ty = gy - r0;
    for (let x = 0; x < size; x++) {
      const gx = (x / (size - 1)) * (cols - 1);
      const c0 = Math.min(cols - 1, Math.floor(gx));
      const c1 = Math.min(cols - 1, c0 + 1);
      const tx = gx - c0;
      const v = (at(r0, c0) * (1 - tx) + at(r0, c1) * tx) * (1 - ty)
        + (at(r1, c0) * (1 - tx) + at(r1, c1) * tx) * ty;
      const col = ramp(v);
      let e = Math.min(
        Math.min(x, size - 1 - x) / band,
        Math.min(y, size - 1 - y) / band,
        1
      );
      e = e * e * (3 - 2 * e);
      const i = (y * size + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = Math.round(col[3] * e);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL("image/png");
}

/* ---------- 状态 ---------- */
let map = null;
let base = null;
let glowLayer = null;
let cityGroup = null;
let stormGroup = null;
let opts = null;
let observer = null;
let lastViewKey = "";
let baseKind = "sat";
let radarOn = true;
let radarMeta = null;
let radarLayers = new Map();
let radarIdx = -1;
let radarTimer = null;
let radarBusy = false;
let stormSig = "";
let glowSig = "";
let glowUrl = "";

function lang() { return opts && opts.lang === "en" ? "en" : "zh"; }
function txt() { return T[lang()]; }

/* ---------- 初始化 ---------- */
function init(el) {
  if (map) return;
  if (!window.L) { setMapLoading(T[lang()].empty); return; }
  map = L.map(el, {
    center: [opts.city.lat, opts.city.lon],
    zoom: 7,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    zoomControl: false,
    minZoom: 3,
    maxZoom: 16,
    worldCopyJump: true,
    attributionControl: true,
    scrollWheelZoom: false
  });
  window.__skyMap = map;
  map.createPane("glowPane");
  map.getPane("glowPane").style.zIndex = "350";
  map.createPane("radarPane");
  map.getPane("radarPane").style.zIndex = "380";
  map.getPane("glowPane").style.pointerEvents = "none";
  map.getPane("radarPane").style.pointerEvents = "none";

  try {
    const saved = localStorage.getItem(BASE_KEY);
    if (saved && BASEMAPS[saved]) baseKind = saved;
  } catch (e) {}

  base = L.tileLayer(BASEMAPS[baseKind], { maxZoom: 16, attribution: "" }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('<a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> · <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>');
  L.control.zoom({ position: "topright" }).addTo(map);

  const el2 = el.closest(".sky-map-shell");
  if (el2) {
    el2.querySelectorAll("[data-base]").forEach((b) => {
      b.onclick = () => setBase(b.dataset.base);
    });
    el2.querySelectorAll("[data-layer]").forEach((cb) => {
      cb.onchange = () => toggleLayer(cb.dataset.layer, cb.checked);
    });
    const play = el2.querySelector("#mapRadarPlay");
    if (play) play.onclick = toggleRadarPlay;
  }
  bindStormChip();
  map.on("moveend", checkStormChip);
  map.on("zoomend", () => {
    if (!cityGroup) return;
    const hide = window.innerWidth < 640 && map.getZoom() <= 5;
    if (hide && map.hasLayer(cityGroup)) map.removeLayer(cityGroup);
    if (!hide && !map.hasLayer(cityGroup)) cityGroup.addTo(map);
  });
}

function setBase(kind) {
  if (!BASEMAPS[kind] || !map) return;
  baseKind = kind;
  base.setUrl(BASEMAPS[kind]);
  try { localStorage.setItem(BASE_KEY, kind); } catch (e) {}
  document.querySelectorAll("[data-base]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.base === kind));
  });
}

/* ---------- 应用数据 ---------- */
export function updateLiveMap(o) {
  opts = o;
  window.__skyLiveOpts = o;
  const el = document.getElementById("skyMap");
  if (!el) return;
  el.querySelector(".sky-skeleton")?.remove();
  if (map) return apply();
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      observer = null;
      init(el);
      map.invalidateSize();
      apply();
      if (radarOn) ensureRadar().then((m) => showRadar(m.frames.length - 1)).catch(() => {});
    }, { rootMargin: "400px" });
    observer.observe(el);
  }
}

export function setMapLoading(msg) {
  const el = document.getElementById("skyMap");
  if (!el) return;
  let box = el.querySelector(".lm-empty");
  if (!msg) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement("div");
    box.className = "lm-empty";
    el.appendChild(box);
  }
  box.textContent = msg;
}

function apply() {
  if (!map || !opts) return;
  const L0 = lang();
  const tr = T[L0];
  document.querySelectorAll("[data-lt]").forEach((n) => {
    const k = n.dataset.lt;
    if (tr[k]) n.textContent = tr[k];
  });
  const src = document.querySelector(".sky-map-src");
  if (src) src.textContent = tr.src;
  const legendTitle = document.querySelector(".lm-legend-title");
  if (legendTitle) legendTitle.textContent = tr.glowTitle;
  const sw = document.querySelector(".lm-sw");
  if (sw && !sw.childElementCount) {
    sw.innerHTML = [0, 20, 40, 60, 80, 100].map((v) => `<i style="background:${rgba(ramp(v))}"></i>`).join("");
  }
  const play = document.querySelector("#mapRadarPlay");
  if (play && !radarTimer) play.setAttribute("aria-label", tr.play);

  document.querySelectorAll("[data-layer]").forEach((cb) => {
    cb.checked = cb.dataset.layer === "radar" ? radarOn
      : cb.dataset.layer === "storms" ? opts.stormsOn !== false
        : opts.glowOn !== false;
  });
  document.querySelectorAll("[data-base]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.base === baseKind));
  });

  // 晚霞热力
  if (opts.points && opts.points.length) {
    const sig = opts.points.map((p) => Math.round(p.score * 10)).join(",");
    let url;
    if (sig === glowSig && glowUrl) {
      url = glowUrl;
    } else {
      url = paint(opts.points, opts.points.map((p) => p.score));
      glowSig = sig;
      glowUrl = url;
    }
    const b = boundsOf(opts.points);
    if (!glowLayer) {
      glowLayer = L.imageOverlay(url, b, { pane: "glowPane", opacity: 0.68, interactive: false });
      glowLayer.addTo(map);
    } else {
      glowLayer.setUrl(url);
      glowLayer.setBounds(b);
    }
    glowLayer.setOpacity(opts.glowOn === false ? 0 : 0.68);
  }

  // 城市标注
  if (cityGroup) { map.removeLayer(cityGroup); cityGroup = null; }
  cityGroup = L.layerGroup();
  const { points, city } = opts;
  const compact = window.innerWidth < 640;
  const limit = compact ? 2 : 4;
  const near = (opts.cities || [])
    .map((c) => ({ c, d: Math.hypot(c.lat - city.lat, (c.lon - city.lon) * 0.85) }))
    .filter((x) => x.d < 2.2 && x.d > 0.08 && x.c.id !== city.id)
    .sort((a, b) => a.d - b.d);
  const kept = [];
  for (const { c } of near) {
    if (kept.some((k) => Math.hypot(k.lat - c.lat, (k.lon - c.lon) * 0.85) < (compact ? 1 : 0.5)) ) continue;
    kept.push(c);
    if (kept.length >= limit) break;
  }
  for (const c of kept) {
    const s = scoreAt(points, c.lat, c.lon);
    L.circleMarker([c.lat, c.lon], { radius: 3.5, color: "#fff", weight: 1.4, fillColor: "#1b2230", fillOpacity: 0.9 })
      .bindTooltip(`${labelOf(c)}${s != null ? `<em>${s}</em>` : ""}`, {
        permanent: true, direction: "right", className: "lm-city", offset: [5, 0]
      }).addTo(cityGroup);
  }
  L.circleMarker([city.lat, city.lon], { radius: 5.5, color: "#fff", weight: 2, fillColor: "#d1432a", fillOpacity: 1 })
    .bindTooltip(opts.cityLabel || labelOf(city), { permanent: true, direction: "top", className: "lm-city me", offset: [0, -6] })
    .addTo(cityGroup);
  if (!compact || map.getZoom() > 5) cityGroup.addTo(map);

  // 台风
  const storms = opts.storms || [];
  const sig = L0 + "|" + storms.map((s) => s.id + ":" + s.lat.toFixed(2) + s.lon.toFixed(2)).join(",");
  if (sig !== stormSig) {
    stormSig = sig;
    if (stormGroup) { map.removeLayer(stormGroup); stormGroup = null; }
    stormGroup = L.layerGroup();
    for (const s of storms) {
      L.circleMarker([s.lat, s.lon], { radius: 5, color: "#ffd9a8", weight: 2, fillColor: "#ff8a3d", fillOpacity: 0.9 })
        .bindTooltip(L0 === "en" ? s.title : `🌀 ${s.title}`, {
          permanent: true, direction: "right", className: "lm-storm", offset: [7, 0]
        }).addTo(stormGroup);
    }
    if (opts.stormsOn !== false) stormGroup.addTo(map);
  }
  if (radarOn && radarMeta && radarIdx >= 0) showRadar(radarIdx);
  checkStormChip();

  // 视角：城市或台风焦点变化时才重置，避免语言/主题切换把地图拉回去
  const key = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}|${opts.focus ? opts.focus.lat + "," + opts.focus.lon : ""}`;
  if (key !== lastViewKey) {
    lastViewKey = key;
    requestAnimationFrame(() => {
      map.invalidateSize();
      if (opts.focus) {
        map.setView([opts.focus.lat, opts.focus.lon], 5);
      } else if (points && points.length) {
        map.fitBounds(viewBoundsOf(points), { padding: [18, 18], maxZoom: 9 });
      } else {
        map.setView([city.lat, city.lon], 7);
      }
    });
  }
}

function labelOf(c) {
  return lang() === "en" ? (c.en || c.zh || "") : (c.zh || c.en || "");
}
function scoreAt(points, lat, lon) {
  if (!points) return null;
  let best = null, bd = Infinity;
  for (const p of points) {
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best ? Math.round(best.score) : null;
}

/* ---------- 图层开关 ---------- */
function toggleLayer(kind, on) {
  if (!map) return;
  if (kind === "glow") {
    opts.glowOn = on;
    if (glowLayer) glowLayer.setOpacity(on ? 0.68 : 0);
  } else if (kind === "radar") {
    radarOn = on;
    if (on) {
      ensureRadar().then(() => showRadar(radarMeta.frames.length - 1)).catch(() => {
        radarOn = false;
        const cb = document.querySelector('[data-layer="radar"]');
        if (cb) cb.checked = false;
      });
    } else {
      stopRadar();
      for (const l of radarLayers.values()) map.removeLayer(l);
      radarLayers.clear();
      radarIdx = -1;
      setRadarChip(false);
    }
  } else if (kind === "storms") {
    opts.stormsOn = on;
    if (on && stormGroup) stormGroup.addTo(map);
    if (!on && stormGroup) map.removeLayer(stormGroup);
    checkStormChip();
  }
}

/* ---------- 雷达 ---------- */
async function ensureRadar() {
  if (radarMeta) return radarMeta;
  if (radarBusy) {
    while (radarBusy) await new Promise((r) => setTimeout(r, 120));
    return radarMeta;
  }
  radarBusy = true;
  try {
    const r = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const frames = ((d.radar && d.radar.past) || []).map((f) => ({
      t: new Date(f.time * 1000), path: f.path
    }));
    radarMeta = { host: d.host || "https://tilecache.rainviewer.com", frames, at: Date.now() };
    if (!frames.length) throw new Error("no radar frames");
    return radarMeta;
  } finally {
    radarBusy = false;
  }
}

function radarLayer(i) {
  if (!radarMeta || !radarMeta.frames[i] || !map) return null;
  if (!radarLayers.has(i)) {
    const f = radarMeta.frames[i];
    const layer = L.tileLayer(`${radarMeta.host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, {
      opacity: 0,
      maxNativeZoom: 7,
      maxZoom: 16,
      pane: "radarPane",
      attribution: ""
    });
    layer.addTo(map);
    radarLayers.set(i, layer);
  }
  return radarLayers.get(i);
}

function showRadar(i) {
  if (!radarMeta || !map) return;
  const idx = Math.max(0, Math.min(radarMeta.frames.length - 1, i));
  radarIdx = idx;
  radarLayer(idx + 1);
  for (const [k, l] of radarLayers) l.setOpacity(k === idx ? 0.62 : 0);
  radarLayer(idx).setOpacity(0.62);
  for (const [k, l] of [...radarLayers]) {
    if (Math.abs(k - idx) > 2) { map.removeLayer(l); radarLayers.delete(k); }
  }
  setRadarChip(true, radarMeta.frames[idx].t);
}

function toggleRadarPlay() {
  if (!radarMeta) return;
  if (radarTimer) {
    stopRadar();
    showRadar(radarMeta.frames.length - 1);
    return;
  }
  let i = 0;
  const btn = document.querySelector("#mapRadarPlay");
  if (btn) { btn.textContent = "❚❚"; btn.classList.add("playing"); btn.setAttribute("aria-label", T[lang()].pause); }
  radarTimer = setInterval(() => {
    showRadar(i);
    i += 1;
    if (i >= radarMeta.frames.length) stopRadar();
  }, 620);
}
function stopRadar() {
  if (radarTimer) clearInterval(radarTimer);
  radarTimer = null;
  const btn = document.querySelector("#mapRadarPlay");
  if (btn) { btn.textContent = "▶"; btn.classList.remove("playing"); btn.setAttribute("aria-label", T[lang()].play); }
}
function setRadarChip(on, date) {
  const chip = document.querySelector("#mapRadarCtl");
  if (!chip) return;
  chip.hidden = !on;
  if (date) {
    const time = document.querySelector("#mapRadarTime");
    if (time) time.textContent = fmtHM(date);
  }
}

/* ---------- 台风提示 ---------- */
function bindStormChip() {
  const chip = document.querySelector("#mapStormChip");
  if (chip) {
    chip.onclick = () => {
      if (!map || !stormGroup) return;
      const pts = (opts.storms || []).map((s) => [s.lat, s.lon]);
      if (!pts.length) return;
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 5 });
      chip.hidden = true;
    };
  }
}
function checkStormChip() {
  const chip = document.querySelector("#mapStormChip");
  if (!chip || !map) return;
  const storms = (opts && opts.storms) || [];
  if (!storms.length || opts.stormsOn === false) { chip.hidden = true; return; }
  const b = map.getBounds().pad(0.05);
  const out = storms.filter((s) => !b.contains([s.lat, s.lon]));
  chip.hidden = out.length === 0;
  if (out.length) chip.textContent = `🌀 ${out.length} ${lang() === "en" ? "storm(s) outside this view · show" : "个台风在视野外 · 查看"}`;
}
