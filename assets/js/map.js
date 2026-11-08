/* ============================================================
   晚霞地图：本地矢量底图（Natural Earth，公有领域）+ 网格色块
   不依赖在线瓦片，国内网络也能稳定显示。
   ============================================================ */
const W = 800, H = 520;
let regionPromise = null;

const MERC = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
const BANDS = [
  { min: 80, color: "#d9534f" },
  { min: 60, color: "#ef8f5a" },
  { min: 40, color: "#f2c66d" },
  { min: 20, color: "#9fc6e8" },
  { min: -1, color: "#cfd6e0" }
];

function band(score) { return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1]; }

export function loadRegion() {
  if (!regionPromise) {
    regionPromise = fetch("assets/map/region.json", { cache: "force-cache" })
      .then((r) => { if (!r.ok) throw new Error("map " + r.status); return r.json(); });
  }
  return regionPromise;
}

function project(lat, lon, view) {
  const x = (lon - view.lon0) / (view.lon1 - view.lon0) * W;
  const y = (view.yTop - MERC(lat)) / (view.yTop - view.yBot) * H;
  return [x, y];
}

function viewOf(lat, lon, spanLon) {
  const spanLat = spanLon * (H / W) * 0.92;
  return {
    lat, lon,
    lon0: lon - spanLon / 2,
    lon1: lon + spanLon / 2,
    latTop: lat + spanLat / 2,
    latBot: lat - spanLat / 2,
    yTop: MERC(lat + spanLat / 2),
    yBot: MERC(lat - spanLat / 2),
    spanLon, spanLat
  };
}

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

const DIRS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
const DIRS_EN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function dirName(deg, lang) {
  const i = Math.round(deg / 45) % 8;
  return (lang === "en" ? DIRS_EN : DIRS)[i];
}

export async function renderSkyMap(el, opts) {
  const {
    lat, lon, span = 8, points = [], cities = [], storms = [], lang = "zh",
    centerLat = lat, centerLon = lon, showStorms = true, meLabel = "", focus = false
  } = opts;
  const region = await loadRegion();
  const view = viewOf(centerLat, centerLon, span);
  const compact = !!opts.compact;
  const cityFont = compact ? 20 : 11;
  const meFont = compact ? 22 : 12;
  const scaleFont = compact ? 18 : 10;
  const cityLimit = compact ? 5 : 8;

  /* 国家边界 */
  const paths = [];
  for (const c of region.countries) {
    for (const ring of c.rings) {
      // 不做视野裁剪：SVG 会按 viewBox 自己裁。手动丢点会把跨出视野的多边形
      // 错误闭合成一堆碎片。
      let d = "";
      let lastX = null, lastY = null;
      for (const [plon, plat] of ring) {
        const [x, y] = project(plat, plon, view);
        if (lastX !== null && Math.abs(x - lastX) < 0.6 && Math.abs(y - lastY) < 0.6) continue;
        d += (d ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
        lastX = x; lastY = y;
      }
      if (d) paths.push(`<path class="sky-map-${c.n === "CN" ? "cn" : "nb"}" d="${d}Z"/>`);
    }
  }

  /* 经纬网 */
  const grid = [];
  const latStep = view.spanLat > 12 ? 4 : view.spanLat > 6 ? 2 : 1;
  const lonStep = view.spanLon > 12 ? 4 : view.spanLon > 6 ? 2 : 1;
  for (let la = Math.ceil(view.latBot / latStep) * latStep; la <= view.latTop; la += latStep) {
    const [, y] = project(la, view.lon, view);
    grid.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}"/>`);
  }
  for (let lo = Math.ceil(view.lon0 / lonStep) * lonStep; lo <= view.lon1; lo += lonStep) {
    const [x] = project(view.lat, lo, view);
    grid.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}"/>`);
  }

  /* 云量色块 */
  const rPx = Math.max(14, (0.36 / view.spanLon) * W);
  const cells = points.map((p, i) => {
    const [x, y] = project(p.lat, p.lon, view);
    if (x < -rPx || x > W + rPx || y < -rPx || y > H + rPx) return "";
    const b = band(p.score);
    const dist = distKm(lat, lon, p.lat, p.lon);
    const dir = dirName(bearing(lat, lon, p.lat, p.lon), lang);
    const label = lang === "en"
      ? `${dir} ${Math.round(dist)} km · glow index ${Math.round(p.score)}`
      : `${dir} ${Math.round(dist)} 公里 · 晚霞指数 ${Math.round(p.score)}`;
    return `<circle class="sky-map-cell" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rPx.toFixed(1)}" fill="${b.color}"><title>${label}</title></circle>`;
  }).join("");

  /* 城市标注 */
  const near = cities
    .map((c) => ({ ...c, d: distKm(lat, lon, c.lat, c.lon) }))
    .filter((c) => c.d < Math.max(view.spanLon, view.spanLat) * 120 && c.d > 8)
    .sort((a, b) => a.d - b.d)
    .slice(0, cityLimit);
  const citySvg = near.map((c) => {
    const [x, y] = project(c.lat, c.lon, view);
    if (x < 10 || x > W - 10 || y < 10 || y > H - 10) return "";
    return `<g class="sky-map-city"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4"/><text x="${(x + 5).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" style="font-size:${cityFont}px">${lang === "en" ? c.en : c.zh}</text></g>`;
  }).join("");

  /* 台风 */
  const stormSvg = showStorms ? storms.map((s) => {
    const [x, y] = project(s.lat, s.lon, view);
    if (x < 0 || x > W || y < 0 || y > H) return "";
    return `<g class="sky-map-storm"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">🌀</text><title>${s.title}</title></g>`;
  }).join("") : "";

  /* 用户位置 */
  const [ux, uy] = project(lat, lon, view);
  const scale100 = 100 / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180))) / view.spanLon * W;

  const legendHtml = focus ? "" : `
    <div class="sky-map-legend">
      <span>${lang === "en" ? "Glow index" : "晚霞指数"}</span>
      ${BANDS.slice().reverse().map((b, i) => {
        const labels = ["0–20", "20–40", "40–60", "60–80", "80+"];
        return `<i style="background:${b.color}"></i><em>${labels[i]}</em>`;
      }).join("")}
    </div>`;
  const capText = focus
    ? (lang === "en"
      ? "Showing the storm's latest recorded position. The glow grid stays around your city — use “Back to my location” to return."
      : "显示该热带气旋最近一次记录的位置；晚霞网格仍在你的城市周围，点『回到我的位置』可切回。")
    : (lang === "en"
      ? "Colours show the glow index at sunset around you; each cell is a model-averaged grid point."
      : "色块是日落时刻你周围网格点的晚霞指数（三个模式平均）；点一下色块可以看方向和距离。");

  el.innerHTML = `
    <div class="sky-map-canvas">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${lang === "en" ? "Regional glow map" : "区域晚霞地图"}">
        <rect class="sky-map-sea" x="0" y="0" width="${W}" height="${H}"/>
        <g class="sky-map-grid">${grid.join("")}</g>
        <g class="sky-map-land">${paths.join("")}</g>
        <g class="sky-map-cells">${cells}</g>
        <g class="sky-map-cities">${citySvg}</g>
        <g class="sky-map-storms">${stormSvg}</g>
        <g class="sky-map-me" transform="translate(${ux.toFixed(1)},${uy.toFixed(1)})">
          <circle class="sky-map-pulse" r="13"/>
          <circle class="sky-map-dot" r="5.5"/>
          ${meLabel ? `<text class="sky-map-me-label" x="10" y="4" style="font-size:${meFont}px">${meLabel}</text>` : ""}
        </g>
        <g class="sky-map-scale" transform="translate(22,${H - 24})">
          <line x1="0" y1="0" x2="${scale100.toFixed(1)}" y2="0"/>
          <text x="${scale100.toFixed(1)}" y="-6" style="font-size:${scaleFont}px">100 km</text>
        </g>
      </svg>
      <div class="sky-map-zoom">
        <button type="button" data-zoom="in" aria-label="${lang === "en" ? "Zoom in" : "放大"}">+</button>
        <button type="button" data-zoom="out" aria-label="${lang === "en" ? "Zoom out" : "缩小"}">−</button>
      </div>
    </div>
    ${legendHtml}
    <p class="sky-map-cap" id="skyMapCap">${capText}</p>
    <p class="sky-map-credit">${lang === "en" ? "Basemap: Natural Earth (public domain)" : "底图：Natural Earth（公有领域）"} · ${lang === "en" ? "100 km scale" : "比例尺 100 公里"}</p>`;

  /* 交互 */
  el.querySelectorAll("[data-zoom]").forEach((b) => {
    b.onclick = () => {
      const next = b.dataset.zoom === "in" ? Math.max(3, span * 0.65) : Math.min(26, span * 1.55);
      if (opts.onZoom) opts.onZoom(next);
    };
  });
  el.querySelectorAll(".sky-map-cell").forEach((c) => {
    c.addEventListener("click", () => {
      const p = points[+c.dataset.i];
      if (!p) return;
      const dist = distKm(lat, lon, p.lat, p.lon);
      const dir = dirName(bearing(lat, lon, p.lat, p.lon), lang);
      const cap = el.querySelector("#skyMapCap");
      if (cap) cap.textContent = lang === "en"
        ? `${dir} ${Math.round(dist)} km: glow index ${Math.round(p.score)}.`
        : `${dir} 方向约 ${Math.round(dist)} 公里：晚霞指数 ${Math.round(p.score)}。`;
    });
  });
}
