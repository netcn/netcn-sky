/* ============================================================
   首页综合图层（方案 D）
   - 卫星 / 街道 / 深色三种底图（Esri，支持 CORS）
   - 晚霞指数热力：5×5 网格 × 3 个模式，日落窗口评分
   - 雷达降水：RainViewer 最近 2 小时 13 帧，可回放
   - 台风：NASA EONET 最新记录位置
   地图按需初始化（进入视口才加载 Leaflet 实例与瓦片），不拖首屏。
   ============================================================ */
import { fmtHM, parseLocal } from "./astro.js?v=19";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const BASEMAPS = {
  sat: ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}",
  street: ESRI + "World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  dark: ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
};
const BASE_KEY = "sky_map_base_v1";
const RADAR_TTL = 5 * 60 * 1000;

/* 晚霞色带：低分区接近透明，40 分起米黄，60 分橙，80 分以上红。
   与截图程序的黄→橙→红一致，比旧版更暖、覆盖更实。 */
const GLOW_STOPS = [
  [0, [130, 150, 170, 0]],
  [12, [176, 192, 150, 26]],
  [24, [226, 214, 122, 62]],
  [36, [244, 204, 96, 92]],
  [48, [248, 184, 64, 118]],
  [60, [248, 152, 48, 142]],
  [72, [244, 112, 42, 164]],
  [86, [230, 62, 48, 184]],
  [100, [186, 26, 92, 200]]
];

const CLOUD_STOPS = [
  [0, [255, 255, 255, 0]],
  [18, [255, 255, 255, 26]],
  [42, [246, 250, 255, 70]],
  [66, [228, 238, 250, 108]],
  [86, [208, 222, 240, 134]],
  [100, [186, 203, 228, 158]]
];

const T = {
  zh: {
    glow: "晚霞", radar: "雷达", cloud: "云量", storms: "台风",
    sat: "卫星", street: "街道", dark: "深色",
    glowTitle: "晚霞指数", radarTitle: "雷达降水", stormNote: "台风",
    play: "回放近 2 小时", pause: "暂停",
    src: "底图 Esri · 雷达 RainViewer · 晚霞 Open-Meteo（ECMWF / CMA / ICON）",
    empty: "地图数据暂时不可用"
  },
  en: {
    glow: "Glow", radar: "Radar", cloud: "Cloud", storms: "Storms",
    sat: "Satellite", street: "Street", dark: "Dark",
    glowTitle: "Glow index", radarTitle: "Radar", stormNote: "Storm",
    play: "Replay last 2h", pause: "Pause",
    src: "Basemap Esri · Radar RainViewer · Glow Open-Meteo (ECMWF / CMA / ICON)",
    empty: "Map data is unavailable"
  }
};

function makeRamp(stops) {
  return (v) => {
    const x = Math.max(0, Math.min(100, v));
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (x >= stops[i][0] && x <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const k = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
    return [
      Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
      Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
      Math.round(a[1][2] + (b[1][2] - a[1][2]) * k),
      Math.round(a[1][3] + (b[1][3] - a[1][3]) * k)
    ];
  };
}
const glowRamp = makeRamp(GLOW_STOPS);
const ramp = glowRamp;
const cloudRamp = makeRamp(CLOUD_STOPS);
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
/* ---------- 平滑场：双三次插值 + 分形噪声 + 等值线 ----------
   旧版是双线性 + 高斯模糊，9×9 拉到整幅只能得到「一团糊」。
   这里改成：Catmull-Rom 双三次（无折线、无菱形格）→ 叠 3 个八度的值噪声
   （模拟云层的细碎结构）→ 每 20 分画一条极淡的等值线。
   观感接近 SunsetWx / 火烧云分析那种「云图式」渐变，而不是色块。 */
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y) {
  return 0.56 * vnoise(x, y) + 0.28 * vnoise(x * 2.13 + 17, y * 2.13 + 31)
    + 0.16 * vnoise(x * 4.37 + 53, y * 4.37 + 71);
}
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function paint(points, values, colorFn, size = 768, feather = 0.24, opts2 = {}) {
  const { rows, cols } = meta(points);
  const at = (r, c) => {
    const rr = Math.max(0, Math.min(rows - 1, r));
    const cc = Math.max(0, Math.min(cols - 1, c));
    const v = values[rr * cols + cc];
    return Number.isFinite(v) ? v : 0;
  };
  const field = new Float32Array(size * size);
  const band = Math.max(1, size * feather);
  const tex = opts2.texture == null ? 1 : opts2.texture;
  for (let y = 0; y < size; y++) {
    const gy = (1 - y / (size - 1)) * (rows - 1);
    const r1 = Math.floor(gy), fy = gy - r1;
    for (let x = 0; x < size; x++) {
      const gx = (x / (size - 1)) * (cols - 1);
      const c1 = Math.floor(gx), fx = gx - c1;
      const p0 = at(r1 - 1, c1 - 1), p1 = at(r1 - 1, c1), p2 = at(r1 - 1, c1 + 1), p3 = at(r1 - 1, c1 + 2);
      const p4 = at(r1, c1 - 1), p5 = at(r1, c1), p6 = at(r1, c1 + 1), p7 = at(r1, c1 + 2);
      const p8 = at(r1 + 1, c1 - 1), p9 = at(r1 + 1, c1), pa = at(r1 + 1, c1 + 1), pb = at(r1 + 1, c1 + 2);
      const pc = at(r1 + 2, c1 - 1), pd = at(r1 + 2, c1), pe = at(r1 + 2, c1 + 1), pf = at(r1 + 2, c1 + 2);
      const top = catmull(p0, p1, p2, p3, fx);
      const mid = catmull(p4, p5, p6, p7, fx);
      const bot = catmull(p8, p9, pa, pb, fx);
      const low = catmull(pc, pd, pe, pf, fx);
      let v = catmull(top, mid, bot, low, fy);
      /* 纹理：幅度随数值变化，低分区几乎不加，高分区的「云絮感」更明显 */
      if (tex) v += (fbm(x / size * 9, y / size * 9) - 0.5) * (2.2 + v * 0.075) * tex;
      field[y * size + x] = v;
    }
  }

  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const col = colorFn(Math.max(0, Math.min(100, field[y * size + x])));
      /* 有机形状遮罩：以中心为圆心的不规则椭圆，边界用噪声扰动。
         原来的矩形羽化会在地图上留下一个「方框」，改成这样看起来
         像一片晚霞云，而不是一张贴在底图上的图片。 */
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const rr = Math.sqrt(nx * nx + ny * ny);
      const wob = (fbm(x / size * 3.2 + 91.7, y / size * 3.2 + 37.3) - 0.5) * 0.42;
      let e = Math.max(0, Math.min(1, (1 - (rr + wob)) / 0.42));
      e = e * e * (3 - 2 * e);
      /* 中尺度透明度起伏：让「云」有厚有薄、有断裂，
         而不是一整片均匀的色块（只改透明度，不改分数）。 */
      const veil = fbm(x / size * 5.5 + 211.3, y / size * 5.5 + 157.9);
      e *= 0.62 + 0.38 * veil;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = Math.round(col[3] * e);
    }
  }
  ctx.putImageData(img, 0, 0);

  /* 等值线：每 20 分一条，极淡，只提供结构感，不喧宾夺主 */
  if (opts2.contours !== false && size >= 400) {
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = Math.max(1, size / 640);
    const levels = [40, 60, 80];
    const st = 3; // 每 3 像素采一格，够平滑且不至于拖慢手机
    for (const lv of levels) {
      ctx.beginPath();
      for (let y = 0; y < size - st; y += st) {
        for (let x = 0; x < size - st; x += st) {
          const a = field[y * size + x], b = field[y * size + x + st];
          const c = field[(y + st) * size + x], d = field[(y + st) * size + x + st];
          const idx = (a > lv ? 1 : 0) | (b > lv ? 2 : 0) | (d > lv ? 4 : 0) | (c > lv ? 8 : 0);
          if (idx === 0 || idx === 15) continue;
          const lerp = (p, q) => (lv - p) / (q - p);
          const top = () => [x + st * lerp(a, b), y];
          const right = () => [x + st, y + st * lerp(b, d)];
          const bottom = () => [x + st * lerp(c, d), y + st];
          const left = () => [x, y + st * lerp(a, c)];
          const seg = {
            1: [left, top], 2: [top, right], 3: [left, right], 4: [right, bottom],
            5: [left, top, right, bottom], 6: [top, bottom], 7: [left, bottom],
            8: [bottom, left], 9: [bottom, top], 10: [top, right, bottom, left],
            11: [bottom, right], 12: [left, right], 13: [right, top], 14: [top, left]
          }[idx];
          if (!seg) continue;
          for (let k = 0; k < seg.length; k += 2) {
            ctx.moveTo(seg[k][0], seg[k][1]);
            ctx.lineTo(seg[k + 1][0], seg[k + 1][1]);
          }
        }
      }
      ctx.stroke();
    }
  }
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
let cloudOn = false;
let cloudData = null;
let cloudUrls = [];
let cloudIdx = 0;
let cloudTimer = null;
let cloudBusy = false;
let cloudOverlay = null;
let cloudCityKey = "";
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
  map.createPane("cloudPane");
  map.getPane("cloudPane").style.zIndex = "360";
  map.createPane("radarPane");
  map.getPane("radarPane").style.zIndex = "380";
  map.getPane("glowPane").style.pointerEvents = "none";
  map.getPane("cloudPane").style.pointerEvents = "none";
  map.getPane("radarPane").style.pointerEvents = "none";

  try {
    const saved = localStorage.getItem(BASE_KEY);
    if (saved && BASEMAPS[saved]) baseKind = saved;
  } catch (e) {}

  base = L.tileLayer(BASEMAPS[baseKind], { maxZoom: 16, attribution: "" }).addTo(map);
  /* 底图兜底：Esri 在部分网络下会被挡或超时，连续失败就换一个源，
     否则用户看到的是「一块深色底 + 一团晚霞」，会以为地图坏了。 */
  let baseErrs = 0;
  let swapped = false;
  base.on("tileerror", () => {
    if (swapped || ++baseErrs < 5) return;
    swapped = true;
    try {
      map.removeLayer(base);
      base = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        { maxZoom: 16, subdomains: "abcd", attribution: "" }).addTo(map);
      if (base.bringToBack) base.bringToBack();
    } catch (e) {}
  });
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
    const cplay = el2.querySelector("#mapCloudPlay");
    if (cplay) cplay.onclick = toggleCloudPlay;
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
      : cb.dataset.layer === "cloud" ? cloudOn
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
      /* 手机降一档分辨率：768² 的双三次 + 等值线在低端机要 300ms+，
         512² 肉眼几乎看不出差别，但快一倍。 */
      const sz = (window.innerWidth < 700 ? 512 : 768);
      url = paint(opts.points, opts.points.map((p) => p.score), glowRamp, sz, 0.24);
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
  const hereScore = scoreAt(points, city.lat, city.lon);
  L.circleMarker([city.lat, city.lon], { radius: 5.5, color: "#fff", weight: 2, fillColor: "#d1432a", fillOpacity: 1 })
    .bindTooltip(`${opts.cityLabel || labelOf(city)}${hereScore != null ? `<em>${hereScore}</em>` : ""}`,
      { permanent: true, direction: "top", className: "lm-city me", offset: [0, -6] })
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
      const tr = (s.track || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      const off = s.official;
      const hasFc = off && off.future && off.future.length >= 2;

      /* 历史路径：优先官方观测点（更密、更准），否则用 EONET */
      if (hasFc) {
        const hist = off.past && off.past.length > 1 ? off.past : [];
        if (hist.length > 1) {
          L.polyline(hist.map((p) => [p.lat, p.lon]), {
            color: "#ffb36b", weight: 1.7, opacity: 0.75, interactive: false
          }).addTo(stormGroup);
        }
        /* 官方误差锥 */
        if (off.cone && off.cone.length >= 3) {
          L.polygon(off.cone, {
            color: "#a78bfa", weight: 1, opacity: 0.5,
            fillColor: "#a78bfa", fillOpacity: 0.09, interactive: false, dashArray: "3 4"
          }).addTo(stormGroup);
        }
        /* 官方预报：从最后一个历史点连到全部未来预报点 */
        const cur = hist[hist.length - 1] || { lat: s.lat, lon: s.lon };
        const fc = [[cur.lat, cur.lon]].concat(off.future.map((p) => [p.lat, p.lon]));
        L.polyline(fc, {
          color: "#a78bfa", weight: 2, opacity: 0.95, dashArray: "6 5", interactive: false
        }).addTo(stormGroup);
        off.future.forEach((p, i) => {
          const hrs = Math.round((p.t - Date.now()) / 3600000);
          const isLast = i === off.future.length - 1;
          L.circleMarker([p.lat, p.lon], {
            radius: isLast ? 4 : 2.6, color: "#ddd0ff", weight: 1.2,
            fillColor: "#8b5cf6", fillOpacity: 0.95
          }).bindTooltip(isLast
            ? (L0 === "en" ? `+${hrs}h official` : `+${hrs}h 官方预报`)
            : (L0 === "en" ? `+${hrs}h` : `+${hrs}h`), {
              permanent: isLast, direction: "right", className: "lm-fc", offset: [5, 0]
            }).addTo(stormGroup);
        });
      } else {
        /* 没有官方预报：保留原来的线性外推，橙色以示区别 */
        if (tr.length > 1) {
          L.polyline(tr.map((p) => [p.lat, p.lon]), {
            color: "#ffb36b", weight: 1.6, opacity: 0.7, interactive: false
          }).addTo(stormGroup);
          const a = tr[Math.max(0, tr.length - 6)];
          const b = tr[tr.length - 1];
          const hrs = (new Date(b.date) - new Date(a.date)) / 3600000;
          if (hrs > 0) {
            const vx = (b.lon - a.lon) / hrs;
            const vy = (b.lat - a.lat) / hrs;
            const p24 = [b.lat + vy * 24, b.lon + vx * 24];
            const p48 = [b.lat + vy * 48, b.lon + vx * 48];
            L.polyline([[b.lat, b.lon], p24], {
              color: "#ffd9a8", weight: 1.4, opacity: 0.85, dashArray: "4 5", interactive: false
            }).addTo(stormGroup);
            L.polyline([p24, p48], {
              color: "#ffd9a8", weight: 1.2, opacity: 0.5, dashArray: "3 6", interactive: false
            }).addTo(stormGroup);
            L.circleMarker(p24, { radius: 3, color: "#ffd9a8", weight: 1.4, fillColor: "#ff8a3d", fillOpacity: 0.85 })
              .bindTooltip(L0 === "en" ? "+24h (linear)" : "+24h 外推", {
                permanent: true, direction: "right", className: "lm-storm", offset: [5, 0]
              }).addTo(stormGroup);
          }
        }
      }
      L.circleMarker([s.lat, s.lon], { radius: 5, color: "#ffd9a8", weight: 2, fillColor: "#ff8a3d", fillOpacity: 0.9 })
        .bindTooltip(L0 === "en" ? s.title : `🌀 ${s.title}`, {
          permanent: true, direction: "right", className: "lm-storm", offset: [7, 0]
        }).addTo(stormGroup);
    }
    if (opts.stormsOn !== false) stormGroup.addTo(map);
  }
  // 云量：城市变了就丢弃旧网格；开着就恢复当前帧
  const ckey = city.lat.toFixed(2) + "," + city.lon.toFixed(2);
  if (cloudData && cloudCityKey !== ckey) {
    stopCloudPlay();
    if (cloudOverlay && map.hasLayer(cloudOverlay)) map.removeLayer(cloudOverlay);
    cloudOverlay = null;
    cloudData = null;
    cloudUrls = [];
    setCloudChip(false);
    if (cloudOn) ensureCloud().then(() => showCloud(0)).catch(() => {});
  }
  if (cloudOn && cloudData && cloudOverlay) {
    if (!map.hasLayer(cloudOverlay)) cloudOverlay.addTo(map);
    showCloud(cloudIdx);
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
        const tr = (opts.focus.track || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        if (tr.length > 1) {
          const pts = tr.map((p) => [p.lat, p.lon]);
          const a = tr[Math.max(0, tr.length - 6)];
          const b = tr[tr.length - 1];
          const hrs = (new Date(b.date) - new Date(a.date)) / 3600000;
          if (hrs > 0 && !(opts.focus.official && opts.focus.official.future && opts.focus.official.future.length >= 2)) {
            pts.push([b.lat + ((b.lat - a.lat) / hrs) * 24, b.lon + ((b.lon - a.lon) / hrs) * 24]);
          }
          const fo = opts.focus.official;
          if (fo) {
            if (fo.past) for (const p of fo.past) pts.push([p.lat, p.lon]);
            if (fo.future) for (const p of fo.future) pts.push([p.lat, p.lon]);
          }
          map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 6 });
        } else {
          map.setView([opts.focus.lat, opts.focus.lon], 5);
        }
      } else if (points && points.length) {
        /* 地图容器是横幅（约 2.7:1），网格接近方形：fitBounds 会被高度卡住，
           把数据缩成中间一小块、两边露出空底图。这里直接按「经度跨度铺满 80% 宽度」
           算缩放级别，上下允许裁切——用户看到的就是一张铺满的晚霞图。 */
        const bb = L.latLngBounds(viewBoundsOf(points));
        const size = map.getSize();
        const lonSpan = Math.max(0.2, bb.getEast() - bb.getWest());
        const z = Math.log2(360 * (size.x * 0.95) / (256 * lonSpan));
        map.setView(bb.getCenter(), Math.max(3, Math.min(9, z)), { animate: false });
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

/* ---------- 云量预报 ---------- */
function makePoints(lat, lon, n, step) {
  const cos = Math.max(0.3, Math.cos(lat * Math.PI / 180));
  const half = (n - 1) / 2;
  const pts = [];
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      pts.push({ lat: +(lat + j * step).toFixed(3), lon: +(lon + (i * step) / cos).toFixed(3) });
    }
  }
  return pts;
}

async function ensureCloud() {
  if (!opts || !map) return null;
  const key = opts.city.lat.toFixed(2) + "," + opts.city.lon.toFixed(2);
  if (cloudData && cloudCityKey === key) return cloudData;
  if (cloudBusy) {
    while (cloudBusy) await new Promise((r) => setTimeout(r, 150));
    if (cloudData && cloudCityKey === key) return cloudData;
  }
  cloudBusy = true;
  try {
    const { lat, lon } = opts.city;
    const pts = makePoints(lat, lon, 7, 0.5);
    const base = `latitude=${pts.map((p) => p.lat).join(",")}&longitude=${pts.map((p) => p.lon).join(",")}`
      + "&hourly=cloud_cover&models=ecmwf_ifs025&timezone=Asia%2FShanghai&forecast_days=2";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    let raw;
    try {
      const r = await fetch("https://api.open-meteo.com/v1/forecast?" + base, { cache: "no-cache", signal: ctrl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      raw = await r.json();
    } finally {
      clearTimeout(timer);
    }
    const arr = Array.isArray(raw) ? raw : [raw];
    const keyName = "cloud_cover_ecmwf_ifs025";
    const times = (arr[0].hourly.time || []).map((x) => parseLocal(x).getTime());
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const frames = [];
    for (let i = 0; i < times.length && frames.length < 24; i++) {
      if (times[i] < now.getTime()) continue;
      const values = arr.map((p) => {
        const a = p.hourly[keyName] || p.hourly.cloud_cover || [];
        const v = a[i];
        return v == null ? 0 : v;
      });
      frames.push({ t: new Date(times[i]), values });
    }
    if (!frames.length) throw new Error("no cloud frames");
    cloudUrls = frames.map((f) => paint(pts, f.values, cloudRamp, 140, 0.22));
    cloudData = { points: pts, frames, urls: cloudUrls, bounds: boundsOf(pts) };
    cloudCityKey = key;
    return cloudData;
  } finally {
    cloudBusy = false;
  }
}

function showCloud(i) {
  if (!cloudData || !map) return;
  const idx = Math.max(0, Math.min(cloudData.frames.length - 1, i));
  cloudIdx = idx;
  if (!cloudOverlay) {
    cloudOverlay = L.imageOverlay(cloudData.urls[idx], cloudData.bounds, {
      pane: "cloudPane", opacity: 0.9, interactive: false
    });
  } else {
    cloudOverlay.setUrl(cloudData.urls[idx]);
    cloudOverlay.setBounds(cloudData.bounds);
  }
  if (!map.hasLayer(cloudOverlay)) cloudOverlay.addTo(map);
  setCloudChip(true, cloudData.frames[idx].t);
}

function toggleCloudPlay() {
  if (!cloudData) return;
  if (cloudTimer) { stopCloudPlay(); return; }
  let i = 0;
  const btn = document.querySelector("#mapCloudPlay");
  if (btn) { btn.textContent = "❚❚"; btn.classList.add("playing"); }
  showCloud(0);
  cloudTimer = setInterval(() => {
    showCloud(i);
    i += 1;
    if (i >= cloudData.frames.length) stopCloudPlay();
  }, 900);
}
function stopCloudPlay() {
  if (cloudTimer) clearInterval(cloudTimer);
  cloudTimer = null;
  const btn = document.querySelector("#mapCloudPlay");
  if (btn) { btn.textContent = "▶"; btn.classList.remove("playing"); }
}
function setCloudChip(on, date) {
  const chip = document.querySelector("#mapCloudCtl");
  if (!chip) return;
  chip.hidden = !on;
  if (date) {
    const time = document.querySelector("#mapCloudTime");
    if (time) time.textContent = fmtHM(date);
  }
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
  } else if (kind === "cloud") {
    cloudOn = on;
    if (on) {
      ensureCloud().then(() => showCloud(0)).catch(() => {
        cloudOn = false;
        const cb = document.querySelector('[data-layer="cloud"]');
        if (cb) cb.checked = false;
        setCloudChip(false);
      });
    } else {
      stopCloudPlay();
      if (cloudOverlay && map.hasLayer(cloudOverlay)) map.removeLayer(cloudOverlay);
      setCloudChip(false);
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
