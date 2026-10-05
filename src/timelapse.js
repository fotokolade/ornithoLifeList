/* ---------- map time-lapse ---------- */
// One year of records played day by day. Every visit is a soft Gaussian blob that fades with the days after it
// (TL's afterglow, S.tl.glow); blobs of places and visits that lie close in space and time add up, so a place
// visited often glows stronger. The blobs keep their size while they fade, and their radius follows the zoom.
// It has a canvas layer of its own (the cluster layer is taken off the map meanwhile) and never starts by itself.
const TL_SPEEDS = [7, 15, 30, 60];  // days per second
const TL_GLOWS = [14, 30, 90, 365];  // the afterglow's time constant in days: a visit has lost two thirds of its glow by then
const TL_RADIUS_M = 1500, TL_RADIUS_MIN = 10, TL_RADIUS_MAX = 140;  // a blob's reach: on the ground, but never smaller or bigger than this on screen
const TL_SCALE = 0.5;  // the blobs are added up at this fraction of the screen's resolution: they are soft anyway
let TL_LAYER = null, TL_LAYER_CLASS = null, TL_MODEL = null, TL_KEY = "", TL_POS = 0, TL_RAF = 0;
/** @type {{lat: number, lon: number, w: number, ring: number}[]} what the layer shows now: the glow of each place that has one */
let TL_FRAME = [];
const dayOfYear = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5);
const tlDate = (year, day) => new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10);
/** @param {Observation[]} list @returns {number[]} the years with a record at a place with coordinates, ascending */
const tlYears = list => [...new Set(list.filter(o => PL[o.p].lat).map(o => o.y))].sort((a, b) => a - b);
// the species the picker offers (those with a located record) by lower-case name, German and English alike
let TL_SP_BY_NAME = new Map();
/**
 * With a species chosen, only its records play: a visit counts the birds seen that day (not the species), and
 * the bar counts its records and the places it was seen at, since "species so far" would always be 1.
 * @param {Observation[]} list regionObs(baseObs()), date-sorted
 * @param {number} year
 * @param {number|null} sp index into SP of the species to follow, null for all
 */
function tlModel(list, year, sp) {
  // a first record is the very first of its species in `list`, as on the normal map
  const first = new Map();
  for (const o of list) if (!first.has(o.s)) first.set(o.s, o);
  const n = dayOfYear(year, 12, 31) + 1;
  const daySp = Array.from({ length: n }, () => new Set()), dayPlaces = Array.from({ length: n }, () => new Set());
  const dayRecords = new Array(n).fill(0);  // one species: the records of a day
  const byPlace = new Map();
  for (const o of list) {
    if (o.y !== year || !PL[o.p].lat || (sp !== null && o.s !== sp)) continue;
    const di = dayOfYear(year, o.m, +o.d.slice(8));
    // what a day counts: the species seen, or (one species) the records made
    if (sp === null) daySp[di].add(o.s); else dayRecords[di]++;
    dayPlaces[di].add(o.p);
    if (!byPlace.has(o.p)) byPlace.set(o.p, new Map());
    const visits = byPlace.get(o.p);
    if (!visits.has(di)) visits.set(di, { di, sp: new Set(), birds: 0, lifer: false });
    const v = visits.get(di);
    v.sp.add(o.s);
    v.birds += Math.max(1, o.c);
    if (first.get(o.s) === o) v.lifer = true;
  }
  const seen = new Set();
  const cum = sp === null ? daySp.map(s => { for (const x of s) seen.add(x); return seen.size; })
    : dayPlaces.map(s => { for (const x of s) seen.add(x); return seen.size; });
  const places = [...byPlace].map(([p, visits]) => ({
    p,
    visits: [...visits.values()].sort((a, b) => a.di - b.di).map(v => ({ di: v.di, n: sp === null ? v.sp.size : v.birds, lifer: v.lifer })),
  }));
  const maxN = places.reduce((m, pl) => pl.visits.reduce((mm, v) => Math.max(mm, v.n), m), 1);
  return { year, n, sp, daySp: sp === null ? daySp.map(s => s.size) : dayRecords, cum, places, maxN };
}
/**
 * The glow of one place on `day`: its visits so far, each fading exponentially with the days since (time constant
 * `tau`) and weighing a little more for more species or birds, added up; `ring` is the strongest glow of a first record.
 * @param {{di: number, n: number, lifer: boolean}[]} visits date-sorted
 * @param {number} day
 * @param {number} tau days
 * @param {number} maxN the largest visit of the year, for the weight
 */
function tlGlow(visits, day, tau, maxN) {
  let w = 0, ring = 0;
  for (const v of visits) {
    if (v.di > day) break;
    const fade = Math.exp(-(day - v.di) / tau);
    w += fade * (0.45 + 0.55 * Math.sqrt(v.n / maxN));
    if (v.lifer) ring = Math.max(ring, fade);
  }
  return { w, ring };
}
// the layer: the blobs of TL_FRAME, added up in one canvas over the map and coloured by how strong the sum is
const tlRgb = (() => {
  const g = document.createElement("canvas").getContext("2d");
  return css => { g.clearRect(0, 0, 1, 1); g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
})();
const TL_SPRITES = new Map();
/** A white blob that falls off like a Gaussian bell (out to 2.5 sigma), `r` px to its edge. */
function tlSprite(r) {
  let s = TL_SPRITES.get(r);
  if (s) return s;
  s = document.createElement("canvas");
  s.width = s.height = 2 * r;
  const g = s.getContext("2d"), grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, `rgba(255,255,255,${i === 10 ? 0 : Math.exp(-((i / 10 * 2.5) ** 2) / 2).toFixed(3)})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2 * r, 2 * r);
  TL_SPRITES.set(r, s);
  return s;
}
/** 256 colours for the sum of the blobs, from clear through the map's amber and orange to a dark red-brown. */
function tlPalette() {
  const lo = tlRgb(cssVar("--mk-lo")), hi = tlRgb(cssVar("--mk-hi")), deep = [92, 26, 8];
  /** @type {[number, number[], number][]} */
  const stops = [[0, lo, 0], [0.18, lo, 0.5], [0.55, hi, 0.82], [1, deep, 0.95]];
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let k = 1;
    while (k < stops.length - 1 && x > stops[k][0]) k++;
    const [x0, c0, a0] = stops[k - 1], [x1, c1, a1] = stops[k], f = (x - x0) / (x1 - x0);
    for (let j = 0; j < 3; j++) lut[i * 4 + j] = c0[j] + (c1[j] - c0[j]) * f;
    lut[i * 4 + 3] = 255 * (a0 + (a1 - a0) * f);
  }
  return lut;
}
/** @param {number} lat @returns {number} a blob's radius in screen px at the map's zoom: its reach on the ground, within limits */
const tlRadius = lat => Math.max(TL_RADIUS_MIN, Math.min(TL_RADIUS_MAX, TL_RADIUS_M / (156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** MAP.getZoom())));
function tlMakeLayer() {
  return L.Layer.extend({
    onAdd(map) {
      this._canvas = L.DomUtil.create("canvas", "tl-canvas leaflet-zoom-hide");
      this._work = document.createElement("canvas");
      map.getPane("overlayPane").appendChild(this._canvas);
      map.on("move zoomend resize", this.redraw, this);
      this.redraw();
    },
    onRemove(map) {
      map.off("move zoomend resize", this.redraw, this);
      this._canvas.remove();
    },
    redraw() {
      const map = this._map;
      if (!map || !map._loaded) return;
      const size = map.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(size.x * dpr), ch = Math.round(size.y * dpr), W = Math.max(1, Math.round(size.x * TL_SCALE)), H = Math.max(1, Math.round(size.y * TL_SCALE));
      const canvas = this._canvas, work = this._work;
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; canvas.style.width = size.x + "px"; canvas.style.height = size.y + "px"; }
      if (work.width !== W || work.height !== H) { work.width = W; work.height = H; }
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      const out = canvas.getContext("2d"), g = work.getContext("2d", { willReadFrequently: true });
      out.clearRect(0, 0, cw, ch);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      const shown = [];
      for (const it of TL_FRAME) {
        const pt = map.latLngToContainerPoint([it.lat, it.lon]), r = Math.max(2, Math.round(tlRadius(it.lat) * TL_SCALE));
        if (pt.x < -r / TL_SCALE || pt.y < -r / TL_SCALE || pt.x > size.x + r / TL_SCALE || pt.y > size.y + r / TL_SCALE) continue;
        g.globalAlpha = 0.9 * (1 - Math.exp(-it.w / 1.5));  // a place visited very often saturates smoothly instead of as a flat plateau
        g.drawImage(tlSprite(r), Math.round(pt.x * TL_SCALE - r), Math.round(pt.y * TL_SCALE - r));
        if (it.ring > 0.15) shown.push([pt, it.ring]);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      // the sum of the blobs is only an amount (the alpha); the palette turns it into colour
      if (TL_FRAME.length) {
        const img = g.getImageData(0, 0, W, H), d = img.data, lut = tlPalette();
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3];
          if (!a) continue;
          d[i] = lut[a * 4]; d[i + 1] = lut[a * 4 + 1]; d[i + 2] = lut[a * 4 + 2]; d[i + 3] = lut[a * 4 + 3];
        }
        g.putImageData(img, 0, 0);
        out.imageSmoothingEnabled = true;
        out.drawImage(work, 0, 0, cw, ch);
      }
      // a first record keeps its green ring (white-edged, as on the normal map), as long as its glow lasts
      for (const [pt, strength] of shown) {
        out.globalAlpha = Math.min(1, strength + 0.2);
        for (const [w, color] of /** @type {[number, string][]} */ ([[5, "#fff"], [3, "#1e9e4f"]])) {
          out.beginPath(); out.arc(pt.x * dpr, pt.y * dpr, 7 * dpr, 0, 2 * Math.PI);
          out.lineWidth = w * dpr; out.strokeStyle = color; out.stroke();
        }
      }
      out.globalAlpha = 1;
    },
  });
}
/** Draws the state of day `day` (0-based) onto the map and the bar. */
function tlShow(day) {
  const m = TL_MODEL;
  if (!m) return;
  day = Math.max(0, Math.min(m.n - 1, day));
  S.tl.day = day;
  TL_FRAME = [];
  for (const pl of m.places) {
    const { w, ring } = tlGlow(pl.visits, day, S.tl.glow, m.maxN);
    if (w > 0.02) TL_FRAME.push({ lat: PL[pl.p].lat, lon: PL[pl.p].lon, w, ring });
  }
  if (TL_LAYER) TL_LAYER.redraw();
  $("tl-range").value = String(day);
  $("tl-date").textContent = fmtD(tlDate(m.year, day));
  $("tl-stats").textContent = t(m.sp === null ? "tlStats" : "tlStatsSp", fmtN(m.daySp[day]), fmtN(m.cum[day]));
}
function tlSyncPlay() { $("tl-play").textContent = S.tl.playing ? t("tlPause") : t("tlPlay"); }
function tlPause() {
  S.tl.playing = false;
  cancelAnimationFrame(TL_RAF);
  tlSyncPlay();
}
function tlPlay() {
  if (!TL_MODEL || S.tl.playing) return;
  if (TL_POS >= TL_MODEL.n - 1) TL_POS = 0;
  S.tl.playing = true;
  tlSyncPlay();
  let last = performance.now();
  const step = now => {
    if (!S.tl.playing || !TL_MODEL) return;
    // a tab in the background stops the frames; don't jump ahead when it comes back
    TL_POS += Math.min(now - last, 100) / 1000 * S.tl.speed;
    last = now;
    if (TL_POS >= TL_MODEL.n - 1) { TL_POS = TL_MODEL.n - 1; tlShow(TL_POS); tlPause(); return; }
    tlShow(Math.floor(TL_POS));
    TL_RAF = requestAnimationFrame(step);
  };
  TL_RAF = requestAnimationFrame(step);
}
/** Forget the drawn year (redacting, leaving the mode): it is built again on the next visit. */
function tlReset() {
  tlPause();
  TL_FRAME = [];
  if (TL_LAYER) TL_LAYER.redraw();
  TL_MODEL = null; TL_KEY = "";
}
// button, bar and map value picker follow the mode
function tlSyncUi() {
  $("m-tl").setAttribute("aria-pressed", String(S.tl.on));
  $("m-tl").classList.toggle("on", S.tl.on);
  $("tl-bar").hidden = !S.tl.on;
  $("m-metric").hidden = S.tl.on;
}
/** The picker's suggestions: the species with a located record in `list`, in the order of the life list. */
function tlFillSpecies(list) {
  const located = new Set(list.filter(o => PL[o.p].lat).map(o => o.s));
  TL_SP_BY_NAME = new Map();
  for (const s of located) for (const name of [SP[s].name, SP[s].english]) if (name) TL_SP_BY_NAME.set(name.toLowerCase(), s);
  $("tl-suggest").innerHTML = [...located].sort((a, b) => SP[a].order - SP[b].order).map(s => `<option value="${esc(speciesName(SP[s]))}">`).join("");
  $("tl-sp").value = S.tl.sp === null ? "" : speciesName(SP[S.tl.sp]);
}
/** The picker took a name: that species, or all again when it is emptied; a name that is none is put back. */
function tlPickSpecies() {
  const box = $("tl-sp"), name = box.value.trim().toLowerCase();
  if (name && !TL_SP_BY_NAME.has(name)) { box.value = S.tl.sp === null ? "" : speciesName(SP[S.tl.sp]); return; }
  S.tl.sp = name ? TL_SP_BY_NAME.get(name) : null;
  renderMap();
}
function drawTimelapse() {
  const list = regionObs(baseObs());
  tlFillSpecies(list);
  const only = S.tl.sp === null ? list : list.filter(o => o.s === S.tl.sp), years = tlYears(only);
  if (MAP_ROUTE) MAP_ROUTE.clearLayers();
  if (!TL_LAYER) { TL_LAYER_CLASS = TL_LAYER_CLASS || tlMakeLayer(); TL_LAYER = new TL_LAYER_CLASS(); }
  if (!MAP.hasLayer(TL_LAYER)) TL_LAYER.addTo(MAP);
  const legend = MAP_LEGEND.getContainer();
  if (!years.length) {
    // with a species chosen the bar stays, so that it can be changed or cleared
    tlReset(); legend.hidden = true; $("tl-bar").hidden = S.tl.sp === null;
    $("tl-date").textContent = $("tl-stats").textContent = ""; $("tl-year").innerHTML = "";  // nothing of the last region's year stays on the bar
    $("map-note").textContent = t(S.tl.sp === null ? "tlNone" : "tlNoneSp");
    return;
  }
  if (!years.includes(S.tl.year)) S.tl.year = !S.timeAll && years.includes(S.year) ? S.year : years[years.length - 1];
  $("tl-year").innerHTML = years.slice().reverse().map(y => `<option value="${y}">${y}</option>`).join("");
  $("tl-year").value = String(S.tl.year);
  const key = `${S.tl.year}|${S.region}|${S.tl.sp}|${S.escaped}|${S.collective}`;
  if (key !== TL_KEY) {
    const fresh = TL_KEY.split("|", 3).join("|") !== key.split("|", 3).join("|");
    tlReset();
    TL_KEY = key;
    TL_MODEL = tlModel(list, S.tl.year, S.tl.sp);
    if (fresh) TL_POS = 0;
    MAP.fitBounds(TL_MODEL.places.map(pl => [PL[pl.p].lat, PL[pl.p].lon]), { padding: [30, 30], maxZoom: 15, animate: false });
    $("tl-range").max = String(TL_MODEL.n - 1);
  }
  legend.hidden = false;
  legend.innerHTML = `<b>${t("tlKey")}</b><div class="map-legend-row"><span><i class="tl-ramp"></i>${t(S.tl.sp === null ? "tlKeyVisit" : "tlKeyVisitSp")}</span><span>${markerDot(0.25, 16, true)}${t("mapLiferKey")}</span></div>`;
  $("map-note").textContent = t("tlNote", TL_MODEL.places.length);
  TL_POS = Math.min(TL_POS, TL_MODEL.n - 1);
  tlShow(Math.floor(TL_POS));
}
