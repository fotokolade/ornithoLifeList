/* ---------- map time-lapse ---------- */
// One year of records played day by day: a place lights up on the day it was visited and fades over TL_FADE
// days; a small faint dot stays where you have been earlier in the year. It has a layer of its own (the
// cluster layer is taken off the map meanwhile) and never starts by itself.
const TL_FADE = 14, TL_SPEEDS = [7, 15, 30, 60];  // fade-out in days; speeds in days per second
const TL_DOT_OLD = 8;
let TL_LAYER = null, TL_MODEL = null, TL_KEY = "", TL_POS = 0, TL_RAF = 0;
const dayOfYear = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5);
const tlDate = (year, day) => new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10);
/** @param {Observation[]} list @returns {number[]} the years with a record at a place with coordinates, ascending */
const tlYears = list => [...new Set(list.filter(o => PL[o.p].lat).map(o => o.y))].sort((a, b) => a - b);
/**
 * @param {Observation[]} list regionObs(baseObs()), date-sorted
 * @param {number} year
 */
function tlModel(list, year) {
  // a first record is the very first of its species in `list`, as on the normal map
  const first = new Map();
  for (const o of list) if (!first.has(o.s)) first.set(o.s, o);
  const n = dayOfYear(year, 12, 31) + 1;
  const daySp = Array.from({ length: n }, () => new Set());
  const byPlace = new Map();
  for (const o of list) {
    if (o.y !== year || !PL[o.p].lat) continue;
    const di = dayOfYear(year, o.m, +o.d.slice(8));
    daySp[di].add(o.s);
    if (!byPlace.has(o.p)) byPlace.set(o.p, new Map());
    const visits = byPlace.get(o.p);
    if (!visits.has(di)) visits.set(di, { di, sp: new Set(), lifer: false });
    const v = visits.get(di);
    v.sp.add(o.s);
    if (first.get(o.s) === o) v.lifer = true;
  }
  const seen = new Set();
  const cum = daySp.map(s => { for (const x of s) seen.add(x); return seen.size; });
  const places = [...byPlace].map(([p, visits]) => ({
    p, state: "", dot: null, marker: null,
    visits: [...visits.values()].sort((a, b) => a.di - b.di).map(v => ({ di: v.di, n: v.sp.size, lifer: v.lifer })),
  }));
  const maxN = places.reduce((m, pl) => pl.visits.reduce((mm, v) => Math.max(mm, v.n), m), 1);
  return { year, n, daySp: daySp.map(s => s.size), cum, places, maxN };
}
/** Draws the state of day `day` (0-based) onto the markers and the bar. */
function tlShow(day) {
  const m = TL_MODEL;
  if (!m) return;
  day = Math.max(0, Math.min(m.n - 1, day));
  S.tl.day = day;
  for (const pl of m.places) {
    if (!pl.dot) pl.dot = pl.marker.getElement()?.firstChild;
    const dot = pl.dot;
    if (!dot) continue;
    let v = null;
    for (let i = pl.visits.length - 1; i >= 0; i--) if (pl.visits[i].di <= day) { v = pl.visits[i]; break; }
    if (!v) { if (pl.state !== "-") { dot.style.display = "none"; pl.state = "-"; } continue; }
    const live = Math.max(0, 1 - (day - v.di) / TL_FADE);  // 1 on the day itself, 0 once faded
    const dia = Math.round(TL_DOT_OLD + (markerDia(v.n / m.maxN) - TL_DOT_OLD) * live);
    const opacity = (0.35 + 0.65 * live).toFixed(2), ring = live > 0 && v.lifer;
    const state = `${dia}|${opacity}|${ring}`;
    if (state === pl.state) continue;
    pl.state = state;
    Object.assign(dot.style, { display: "", width: dia + "px", height: dia + "px", opacity, background: markerColor(v.n / m.maxN) });
    dot.classList.toggle("lifer", ring);
  }
  $("tl-range").value = String(day);
  $("tl-date").textContent = fmtD(tlDate(m.year, day));
  $("tl-stats").textContent = t("tlStats", fmtN(m.daySp[day]), fmtN(m.cum[day]));
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
/** Forget the drawn year (redacting, leaving the mode): the markers are rebuilt on the next visit. */
function tlReset() {
  tlPause();
  if (TL_LAYER) TL_LAYER.clearLayers();
  TL_MODEL = null; TL_KEY = "";
}
// button, bar and map value picker follow the mode
function tlSyncUi() {
  $("m-tl").setAttribute("aria-pressed", String(S.tl.on));
  $("m-tl").classList.toggle("on", S.tl.on);
  $("tl-bar").hidden = !S.tl.on;
  $("m-metric").hidden = S.tl.on;
}
function drawTimelapse() {
  const list = regionObs(baseObs()), years = tlYears(list);
  if (MAP_ROUTE) MAP_ROUTE.clearLayers();
  if (!TL_LAYER) TL_LAYER = L.layerGroup();
  if (!MAP.hasLayer(TL_LAYER)) TL_LAYER.addTo(MAP);
  const legend = MAP_LEGEND.getContainer();
  if (!years.length) { tlReset(); legend.hidden = true; $("tl-bar").hidden = true; $("map-note").textContent = t("tlNone"); return; }
  if (!years.includes(S.tl.year)) S.tl.year = !S.timeAll && years.includes(S.year) ? S.year : years[years.length - 1];
  $("tl-year").innerHTML = years.slice().reverse().map(y => `<option value="${y}">${y}</option>`).join("");
  $("tl-year").value = String(S.tl.year);
  const key = `${S.tl.year}|${S.region}|${S.escaped}|${S.collective}`;
  if (key !== TL_KEY) {
    const fresh = TL_KEY.split("|", 2).join("|") !== key.split("|", 2).join("|");
    tlReset();
    TL_KEY = key;
    TL_MODEL = tlModel(list, S.tl.year);
    if (fresh) TL_POS = 0;
    const bounds = TL_MODEL.places.map(pl => [PL[pl.p].lat, PL[pl.p].lon]);
    // the view first: a marker only gets its element once the map has one
    MAP.fitBounds(bounds, { padding: [30, 30], maxZoom: 15, animate: false });
    for (const pl of TL_MODEL.places) {
      const p = PL[pl.p], dia = markerDia(1), peak = pl.visits.reduce((a, v) => Math.max(a, v.n), 0);
      const icon = L.divIcon({ className: "value-marker tl-marker", html: '<span class="dot"></span>', iconSize: [dia, dia], iconAnchor: [dia / 2, dia / 2] });
      // as on the normal map, the small places lie on top of the big ones
      pl.marker = L.marker([p.lat, p.lon], { icon, interactive: false, keyboard: false, zIndexOffset: Math.round((1 - peak / TL_MODEL.maxN) * 1000) }).addTo(TL_LAYER);
    }
    $("tl-range").max = String(TL_MODEL.n - 1);
  }
  legend.hidden = false;
  legend.innerHTML = `<b>${t("tlKey")}</b><div class="map-legend-row"><span>${markerDot(0.5, 20)}${t("tlKeyVisit")}</span><span>${markerDot(0.25, 16, true)}${t("mapLiferKey")}</span>`
    + `<span><span class="dot" style="width:${TL_DOT_OLD}px;height:${TL_DOT_OLD}px;background:${markerColor(0.5)};opacity:.35"></span>${t("tlKeyOld")}</span></div>`;
  $("map-note").textContent = t("tlNote", TL_MODEL.places.length);
  TL_POS = Math.min(TL_POS, TL_MODEL.n - 1);
  tlShow(Math.floor(TL_POS));
}
