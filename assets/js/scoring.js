/* ============================================================
   观测评分：火烧云 / 朝霞 / 星空 / 月亮
   - 每个数值模式单独算一遍分
   - 39 个集合成员再各算一遍 → 得到“达到门槛的比例”作为概率
   - 模式中位数 + 集合中位数 → 典型评分
   - 模式分歧越大，置信度越低
   所有因子都保留下来，前端可以逐条解释“为什么”。
   ============================================================ */
import { clamp, sunTimes, sunPosition, moonPosition, moonIllumination, moonTimes, addDays, startOfLocalDay, phaseName } from "./astro.js?v=23";
import { interpolator } from "./sources.js?v=23";

const num = (v, d = null) => (Number.isFinite(v) ? v : d);
const lerp = (a, b, k) => a + (b - a) * clamp(k, 0, 1);

function pieceHigh(h) {
  if (h < 5) return 0;
  if (h < 15) return lerp(0, 45, (h - 5) / 10);
  if (h < 30) return lerp(45, 90, (h - 15) / 15);
  if (h <= 50) return lerp(90, 100, (h - 30) / 20);
  if (h <= 70) return lerp(100, 92, (h - 50) / 20);
  if (h <= 85) return lerp(92, 55, (h - 70) / 15);
  return lerp(55, 5, (h - 85) / 15);
}
/* 中云：火烧云主要靠高云被夕阳照亮，中云不是必需品。
   过去把「中云 0%」判成 15 分，等于把最典型的干净晚霞判成缺陷；
   现在 0–20% 给 55→82，20–40% 才是最佳，60% 以上才明显扣分。 */
function pieceMid(m) {
  if (m < 5) return 55;
  if (m < 20) return lerp(55, 82, (m - 5) / 15);
  if (m <= 40) return lerp(82, 100, (m - 20) / 20);
  if (m <= 60) return lerp(100, 85, (m - 40) / 20);
  if (m <= 80) return lerp(85, 45, (m - 60) / 20);
  return lerp(45, 10, (m - 80) / 20);
}
const pieceLow = (l) => clamp(100 - l * 1.5, 0, 100);
const pieceVis = (v) => clamp((v - 5) / 20 * 100, 0, 100);
const pieceAod = (a) => 100 * Math.exp(-0.5 * ((a - 0.25) / 0.24) ** 2);
const piecePrecip = (p) => clamp(100 - p * 1.6, 0, 100);
const pieceDew = (d) => clamp(d / 4 * 100, 0, 100);

export function median(a) {
  const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function stdev(a) {
  const v = a.filter((x) => Number.isFinite(x));
  if (v.length < 2) return 0;
  const m = v.reduce((s, x) => x + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

/* ---------- 火烧云 / 朝霞 ---------- */
export function glowFactors(cloud, ctx) {
  const h = num(cloud.high, 40), m = num(cloud.mid, 30), l = num(cloud.low, 30);
  const vis = num(ctx.visibility, 15), aod = num(ctx.aod, 0.2);
  const precip = num(ctx.precip, 20), dewDep = num(ctx.dewDep, 3);
  const f = {
    high: pieceHigh(h), mid: pieceMid(m), low: pieceLow(l),
    vis: pieceVis(vis), aod: pieceAod(aod), precip: piecePrecip(precip), dew: pieceDew(dewDep)
  };
  const base = f.high * 0.30 + f.mid * 0.18 + f.low * 0.22
    + f.vis * 0.10 + f.aod * 0.08 + f.precip * 0.07 + f.dew * 0.05;
  // ① 没有云就没有火烧云：云量作为“画布”门槛
  const canvas = clamp((h * 0.65 + m * 0.35) / 25, 0, 1);
  // ② 唯一的硬门槛是低云封死地平线（太阳被挡住，天上再多高云也没用）。
  //    旧版这里还乘了一个用「中云适宜度」算的 openSky，等于对无中云的
  //    干净晚霞二次惩罚；现在只按低云遮挡。
  const horizon = clamp((100 - l) / 100, 0, 1);
  const gate = 0.10 + 0.90 * horizon;
  return {
    total: clamp(base * (0.35 + 0.65 * canvas) * gate, 0, 100),
    factors: f,
    raw: { high: h, mid: m, low: l, vis, aod, precip, dewDep },
    canvas, horizon, gate
  };
}

/* ---------- 星空 ---------- */
export function starScore({ cloud, moon, vis, dewDep, bortle, precip }) {
  const cloudScore = clamp(100 - (num(cloud, 50)) * 1.15, 0, 100);
  const moonAlt = num(moon.alt, -10), illum = num(moon.illum, 0);
  const moonPenalty = moonAlt > 0 ? illum * clamp(moonAlt / 45, 0, 1) * 85 : 0;
  const moonScore = clamp(100 - moonPenalty, 0, 100);
  const visScore = pieceVis(num(vis, 15));
  const dewScore = pieceDew(num(dewDep, 3));
  const lightScore = clamp(100 - (bortle - 1) * 12, 0, 100);
  let total = cloudScore * 0.45 + moonScore * 0.25 + visScore * 0.12
    + dewScore * 0.08 + lightScore * 0.10;
  // 光污染封顶：市区再通透也看不到银河
  total = Math.min(total, clamp(100 - (bortle - 1) * 7.5, 0, 100));
  if (num(precip, 0) > 60) total = Math.min(total, 25);
  return { total: clamp(total, 0, 100), factors: { cloud: cloudScore, moon: moonScore, vis: visScore, dew: dewScore, light: lightScore } };
}

/* ---------- 月亮 ---------- */
export function moonScore({ illum, alt, cloud, visible }) {
  const cloudScore = clamp(100 - num(cloud, 50) * 1.1, 0, 100);
  const altScore = clamp(num(alt, 0) / 50 * 100, 0, 100);
  let total = illum * 100 * 0.35 + altScore * 0.30 + cloudScore * 0.35;
  if (!visible) total *= 0.30;
  return { total: clamp(total, 0, 100), factors: { illum: illum * 100, alt: altScore, cloud: cloudScore } };
}

/* ---------- 区域网格评分（晚霞地图） ---------- */
// 网格只取云层结构与地面气象，气溶胶沿用主点位的 AOD（空间变化小，避免再发 25 个请求）
export function scoreGrid(grid, sunset, aod = 0.2) {
  if (!grid || !grid.points || !sunset) return [];
  const marks = [-10, 10, 26].map((m) => new Date(sunset.getTime() + m * 60000));
  const avg = (fn) => {
    const v = marks.map(fn).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return grid.points.map((p) => {
    const ctx = {
      visibility: avg((s) => interpolator(p.ctx.times, p.ctx.visibility)(s)),
      precip: avg((s) => interpolator(p.ctx.times, p.ctx.precip)(s)),
      dew: avg((s) => interpolator(p.ctx.times, p.ctx.dew)(s)),
      temp: avg((s) => interpolator(p.ctx.times, p.ctx.temp)(s)),
      aod
    };
    ctx.dewDep = (ctx.temp != null && ctx.dew != null) ? ctx.temp - ctx.dew : 3;
    const scores = [];
    const list = (p.members && p.members.length) ? p.members : (p.models || []);
    for (const m of list) {
      const it = (arr) => interpolator(p.times, arr);
      const cloud = {
        low: avg((s) => it(m.low)(s)),
        mid: avg((s) => it(m.mid)(s)),
        high: avg((s) => it(m.high)(s))
      };
      scores.push(glowFactors(cloud, ctx).total);
    }
    /* 与首页一致：集合成员取中位数，不用平均（平均会被少数极端成员拉偏）。 */
    const score = scores.length ? (median(scores) ?? 0) : 0;
    return { lat: p.lat, lon: p.lon, score: clamp(score, 0, 100) };
  });
}

/* ---------- 一次评估 ---------- */
export function evaluate(data, city, date = new Date()) {
  const lat = city.lat, lon = city.lon, bortle = city.bortle || 7;
  const day = startOfLocalDay(date);
  const ymd = new Date(day.getTime() + 8 * 3600e3);
  const y = ymd.getUTCFullYear(), m = ymd.getUTCMonth() + 1, d = ymd.getUTCDate();

  const sunToday = sunTimes({ y, m, d }, lat, lon);
  const next = addDays(day, 1);
  const n2 = new Date(next.getTime() + 8 * 3600e3);
  const sunTomorrow = sunTimes({ y: n2.getUTCFullYear(), m: n2.getUTCMonth() + 1, d: n2.getUTCDate() }, lat, lon);

  const ctx = data.ctx;
  const ctxAt = (t) => ({
    visibility: interpolator(ctx.times, ctx.visibility)(t),
    precip: interpolator(ctx.times, ctx.precip)(t),
    dew: interpolator(ctx.times, ctx.dew)(t),
    temp: interpolator(ctx.times, ctx.temp)(t),
    aod: data.air ? interpolator(data.air.times, data.air.aod)(t) : 0.2,
    pm25: data.air ? interpolator(data.air.times, data.air.pm25)(t) : null
  });
  const withDew = (o) => ({ ...o, dewDep: (o.temp != null && o.dew != null) ? o.temp - o.dew : 3 });

  const modelAt = (m) => ({
    low: interpolator(data.times, m.cloud.low),
    mid: interpolator(data.times, m.cloud.mid),
    high: interpolator(data.times, m.cloud.high),
    total: interpolator(data.times, m.cloud.total)
  });

  /* --- 火烧云 / 朝霞 --- */
  // 晚霞的高光通常在日落后 10–25 分钟，朝霞在日出前 25 分钟到日出后 5 分钟；
  // 取一个小窗口平均，比只取日落那一刻更稳，也不会被单小时噪声带偏。
  function evalGlow(when, dir) {
    if (!when) return null;
    /* 先以 5 分钟为步长扫一遍窗口，找峰值时刻，再在峰值附近取三点平均。
       旧版固定取 -10/+10/+26，遇到峰值偏移时会低估，也给不出「可看时段」。 */
    const step = 5;
    const from = dir === "morning" ? -40 : -25;
    const to = dir === "morning" ? 10 : 35;
    const quick = [];
    for (let off = from; off <= to; off += step) {
      const t = new Date(when.getTime() + off * 60000);
      const qc = withDew({
        visibility: ctxAt(t).visibility, precip: ctxAt(t).precip,
        dew: ctxAt(t).dew, temp: ctxAt(t).temp, aod: ctxAt(t).aod
      });
      const sc = [];
      for (const m of data.models) {
        const it = modelAt(m);
        sc.push(glowFactors({ low: it.low(t), mid: it.mid(t), high: it.high(t) }, qc).total);
      }
      /* 扫描要和最终评分用同一口径（集合为主），否则会出现
         「最终 62 分、窗口为空」这种自相矛盾。 */
      /* 取「更乐观的一侧」：ECMWF 集合中位数 vs 六个模式的均值。
         实测两天上海：11-10 集合说好、模式说晴；11-11 反过来。
         单看任何一边都会把真实发生过的好晚霞判成 25%。 */
      const detMean = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0;
      let sBase = detMean;
      if (data.ensemble && data.ensemble.members.length) {
        const ens = [];
        for (const mem of data.ensemble.members) {
          const it = (arr) => interpolator(data.ensemble.times, arr)(t);
          const low = it(mem.low), mid = it(mem.mid), high = it(mem.high);
          if (low == null && mid == null && high == null) continue;
          ens.push(glowFactors({ low, mid, high }, qc).total);
        }
        const em = median(ens);
        if (em != null) sBase = Math.max(em, detMean);
      }
      /* 太阳高度门控：日落后约 40 分钟（高度 < -8°）天已黑，
         云量再合适也不可能有晚霞；不加这个峰值会一路漂到窗口末端。 */
      const alt = sunPosition(t, lat, lon).alt;
      const dayGate = clamp((alt + 10) / 8, 0, 1);
      quick.push({ off, t, s: sBase * dayGate });
    }
    const best = quick.reduce((a, b) => (b.s > a.s ? b : a));
    const offsets = [best.off - step, best.off, best.off + step];
    const marks = offsets.map((m) => new Date(when.getTime() + m * 60000));
    const winThreshold = Math.max(40, best.s * 0.75);
    const inWindow = quick.filter((q) => q.s >= winThreshold);
    const window = inWindow.length
      ? { start: inWindow[0].t, end: inWindow[inWindow.length - 1].t, threshold: winThreshold }
      : null;
    const avgOf = (fn) => {
      const v = marks.map(fn).filter((x) => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const c = withDew({
      visibility: avgOf((s) => ctxAt(s).visibility),
      precip: avgOf((s) => ctxAt(s).precip),
      dew: avgOf((s) => ctxAt(s).dew),
      temp: avgOf((s) => ctxAt(s).temp),
      aod: avgOf((s) => ctxAt(s).aod),
      pm25: ctxAt(marks[1]).pm25
    });
    const per = [];
    for (const m of data.models) {
      const it = modelAt(m);
      const cloud = {
        low: avgOf((s) => it.low(s)),
        mid: avgOf((s) => it.mid(s)),
        high: avgOf((s) => it.high(s))
      };
      const g = glowFactors(cloud, c);
      per.push({ id: m.id, label: m.label, zh: m.zh, org: m.org, score: g.total, cloud, factors: g.factors, canvas: g.canvas });
    }
    const scores = per.map((p) => p.score);
    const pModel = per.filter((p) => p.score >= 60).length / per.length;
    let pEns = null, ensMedian = null, ensN = 0, pEns55 = 0;
    if (data.ensemble && data.ensemble.members.length) {
      const ens = [];
      const memAvg = (arr) => {
        const f = interpolator(data.ensemble.times, arr);
        return avgOf((s) => f(s));
      };
      for (const mem of data.ensemble.members) {
        const low = memAvg(mem.low), mid = memAvg(mem.mid), high = memAvg(mem.high);
        if (low == null && mid == null && high == null) continue;
        ens.push(glowFactors({ low, mid, high }, c).total);
      }
      ensN = ens.length;
      pEns55 = ensN ? ens.filter((v) => v >= 55).length / ensN : 0;
      /* 成员不足 20 个时不用集合：残缺成员的中位数会把主分带偏，
         此时退回多模型中位数更稳。 */
      if (ensN >= 20) { pEns = ens.filter((s) => s >= 60).length / ensN; ensMedian = median(ens); }
    }
    /* 主分以 ECMWF 集合中位数为主：51 个成员能反映真实不确定性，
       而 3–6 个确定性模式的中位数会被个别报晴空的模式拖死——
       11-10 上海就是 ECMWF 81、CMA/ICON 报无云，中位数只剩 36。 */
    const med = median(scores);
    const detMean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const altBest = sunPosition(marks[1], lat, lon).alt;
    const dayGateBest = clamp((altBest + 10) / 8, 0, 1);
    /* 主分：集合中位数与模式均值取更高的一侧。
       ECMWF 集合只代表 ECMWF 一家的不确定性，遇到它整体偏晴/偏阴时
       （11-10 偏晴、11-11 偏阴各一次）会把真实的好晚霞压到 25%。
       取较高一侧 + 保留 dayGate，既不撒谎也不劝退。 */
    const agg = Math.max(ensMedian != null ? ensMedian : -1, detMean);
    const score = agg * dayGateBest;
    /* 概率与指数同源：指数 60 大致对应六成把握。
       集合里「够格」的成员比例只作为 15% 的修正，避免单一模式主导。 */
    const pFromScore = clamp(score * 1.05, 0, 95);
    const prob = clamp(pFromScore * 0.85 + (pEns55 || 0) * 100 * 0.15, 2, 95);
    const spread = stdev(scores);
    const agree = Math.max(pModel, 1 - pModel);
    const confidence = (spread <= 14 && agree >= 0.8) ? "high" : (spread <= 28 && agree >= 0.55) ? "mid" : "low";
    const medFactors = {};
    for (const k of Object.keys(per[0].factors)) medFactors[k] = median(per.map((p) => p.factors[k]));
    const medCloud = {};
    for (const k of ["high", "mid", "low"]) medCloud[k] = median(per.map((p) => p.cloud[k]));
    return {
      when: marks[1], time: marks[1], bestTime: marks[1], window,
      score, prob: Math.round(prob), pModel, pEns, pEns55, ensN,
      spread, confidence, models: per, factors: medFactors, cloud: medCloud,
      ctx: c, median: med, ensMedian
    };
  }

  const evening = evalGlow(sunToday.sunset, "evening");
  const morning = evalGlow(sunToday.sunrise, "morning");

  /* --- 夜间窗口 --- */
  const dusk = sunToday.astroDusk || sunToday.civilDusk;
  const dawn = sunTomorrow.astroDawn || sunTomorrow.civilDawn;
  let t0 = Math.max(dusk ? dusk.getTime() : 0, sunToday.civilDusk ? sunToday.civilDusk.getTime() : 0);
  const capStart = startOfLocalDay(day).getTime() + 20.5 * 3600e3;
  const capEnd = startOfLocalDay(day).getTime() + 27 * 3600e3; // 次日 03:00
  let a = Math.max(t0 + 15 * 60000, capStart);
  let b = Math.min(dawn ? dawn.getTime() : capEnd, capEnd);
  if (!(b > a)) { a = capStart; b = capEnd; }
  const samples = [0, 0.33, 0.66, 1].map((k) => new Date(a + (b - a) * k));

  const moonNow = moonPosition(samples[2], lat, lon);
  const illum = moonIllumination(samples[2]);
  const phase = phaseName(illum.phase);

  function evalStar() {
    const per = [];
    for (const m of data.models) {
      const it = modelAt(m);
      let cloudSum = 0, n = 0;
      for (const s of samples) { const v = it.total(s); if (v != null) { cloudSum += v; n++; } }
      const cloud = n ? cloudSum / n : 50;
      const c = withDew(ctxAt(samples[1]));
      const moonAlt = moonPosition(samples[2], lat, lon).alt;
      const r = starScore({ cloud, moon: { alt: moonAlt, illum: illum.fraction }, vis: c.visibility, dewDep: c.dewDep, bortle, precip: c.precip });
      per.push({ id: m.id, label: m.label, zh: m.zh, score: r.total, cloud, factors: r.factors });
    }
    const scores = per.map((p) => p.score);
    const pModel = per.filter((p) => p.score >= 55).length / per.length;
    let pEns = null, ensN = 0, ensMedian = null;
    if (data.ensemble && data.ensemble.members.length) {
      const ens = [];
      for (const mem of data.ensemble.members) {
        const it = interpolator(data.ensemble.times, mem.total);
        let sum = 0, n = 0;
        for (const s of samples) { const v = it(s); if (v != null) { sum += v; n++; } }
        if (!n) continue;
        const c = withDew(ctxAt(samples[1]));
        const r = starScore({ cloud: sum / n, moon: { alt: moonNow.alt, illum: illum.fraction }, vis: c.visibility, dewDep: c.dewDep, bortle, precip: c.precip });
        ens.push(r.total);
      }
      ensN = ens.length;
      if (ensN) { pEns = ens.filter((s) => s >= 55).length / ensN; ensMedian = median(ens); }
    }
    const med = median(scores);
    const score = pEns != null ? med * 0.5 + ensMedian * 0.5 : med;
    let prob = pEns != null ? pEns * 0.55 + pModel * 0.45 : pModel;
    prob = clamp(prob * 100, 0, 95);
    const spread = stdev(scores);
    const agree = Math.max(pModel, 1 - pModel);
    const confidence = (spread <= 14 && agree >= 0.8) ? "high" : (spread <= 28 && agree >= 0.55) ? "mid" : "low";
    return {
      score, prob: Math.round(prob), pModel, pEns, ensN, spread, confidence,
      models: per, median: med, ensMedian, cloud: median(per.map((p) => p.cloud)),
      samples, moon: { alt: moonNow.alt, illum: illum.fraction, phase }
    };
  }
  const star = evalStar();

  function evalMoon() {
    let maxAlt = -90, visible = false;
    for (const s of samples) {
      const p = moonPosition(s, lat, lon);
      if (p.alt > maxAlt) maxAlt = p.alt;
      if (p.alt > 0) visible = true;
    }
    let cloudSum = 0, n = 0;
    for (const m of data.models) {
      const it = modelAt(m);
      let sum = 0, k = 0;
      for (const s of samples) { const v = it.total(s); if (v != null) { sum += v; k++; } }
      if (k) { cloudSum += sum / k; n++; }
    }
    const cloud = n ? cloudSum / n : 50;
    const r = moonScore({ illum: illum.fraction, alt: maxAlt, cloud, visible });
    return { score: r.total, factors: r.factors, alt: maxAlt, illum: illum.fraction, phase, visible, cloud };
  }
  const moon = evalMoon();
  const mt = moonTimes(day, lat, lon);
  moon.rise = mt.rise;
  moon.set = mt.set;

  return {
    date: day, ymd: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    sun: sunToday, sunTomorrow, dusk, dawn, samples,
    evening, morning, star, moon, bortle,
    updated: data.updated, status: data.status
  };
}
