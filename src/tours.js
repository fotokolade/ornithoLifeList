/* ---------- tours ---------- */
// Tours are reconstructed from the records themselves: on one day, records with a time that follow each
// other within `gap` minutes and `step` km belong to the same walk or ride. Its stops are the mean
// positions of `win`-minute time windows, merged where they lie within `stop` metres (see tourStops()). A chain with a single stop is a stay, not a tour, and tours shorter than
// `minKm` or `minDur` minutes are left out (an hour is also the span a Beobachtungsliste covers a quadrant
// in). The viewer can change them all in the tab; they are kept in localStorage.
const TOUR_DEFAULTS = { gap: 30, step: 0.5, win: 15, stop: 250, minKm: 1, minDur: 60 };
// [key, min, max, step of the input]
/** @type {["gap"|"step"|"win"|"stop"|"minKm"|"minDur", number, number, number][]} */
const TOUR_LIMITS = [["gap", 1, 240, 1], ["step", 0.1, 50, 0.1], ["win", 1, 120, 1], ["stop", 10, 2000, 10], ["minKm", 0, 50, 0.1], ["minDur", 0, 720, 5]];
const TOURS_SHOWN = 30;
/** @returns {typeof TOUR_DEFAULTS} */
function loadTourCfg() {
  const cfg = { ...TOUR_DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem("lifelist-tour-settings") || "{}");
    for (const [k, min, max] of TOUR_LIMITS) if (typeof saved[k] === "number" && saved[k] >= min && saved[k] <= max) cfg[k] = saved[k];
  } catch (e) { /* no or broken settings: defaults */ }
  return cfg;
}
// data.js builds S before this file's constants exist, so the settings are filled in here
S.tourCfg = loadTourCfg();
function saveTourCfg() {
  try { localStorage.setItem("lifelist-tour-settings", JSON.stringify(S.tourCfg)); } catch (e) { /* private mode may refuse */ }
}
/**
 * @typedef {Object} TourStop
 * @property {number} lat - mean latitude of its records
 * @property {number} lon - mean longitude of its records
 * @property {string} name - the place most of its records name
 * @property {Observation[]} obs
 */
/**
 * @typedef {Object} Tour
 * @property {string} key - stable id: date, start minute and first place
 * @property {string} d - date "YYYY-MM-DD"
 * @property {number} y
 * @property {number} start - minute of the day of the first record
 * @property {number} end - minute of the day of the last record
 * @property {TourStop[]} stops - where the birder stopped, in order
 * @property {number} km - length of the path through the stops
 * @property {Observation[]} obs
 */
// where a record was made: its own position if the export has one (GPS or a point set by hand), else its place's
const obsPos = o => o.la ? { lat: o.la, lon: o.lo } : PL[o.p];
// great-circle distance in metres
function distM(p, q) {
  const rad = Math.PI / 180, dLat = (q.lat - p.lat) * rad, dLon = (q.lon - p.lon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
}
/**
 * Mean position of some records, from the best source they have: the phone's GPS (where the birder
 * stood) if any record has it, else points set by hand (mostly where the birds were), else the places.
 * Mixing the kinds would pull a stop towards the birds.
 * @param {Observation[]} obs @returns {{lat: number, lon: number}}
 */
function meanPos(obs) {
  const gps = obs.filter(o => o.ls === 1), set = gps.length ? gps : obs.filter(o => o.ls === 2);
  const use = set.length ? set : obs;
  let lat = 0, lon = 0;
  for (const o of use) { const p = obsPos(o); lat += p.lat; lon += p.lon; }
  return { lat: lat / use.length, lon: lon / use.length };
}
/**
 * The birder's way through a tour. Record positions are often where the bird was, scattered all round
 * the birder, so joining them one by one zigzags. Instead the records are cut into time windows of
 * `win` minutes, each placed at the mean of its records (an estimate of where the birder stood), and
 * neighbouring windows whose means lie within the stop radius merge into one stop.
 * @param {Observation[]} chain @returns {TourStop[]}
 */
function tourStops(chain) {
  const { win, stop } = S.tourCfg;
  /** @type {Observation[][]} */
  const windows = [];
  for (const o of chain) {
    const cur = windows[windows.length - 1];
    if (cur && o.tm - cur[0].tm < win) cur.push(o); else windows.push([o]);
  }
  /** @type {Observation[][]} */
  const groups = [];
  for (const w of windows) {
    const cur = groups[groups.length - 1];
    if (cur && distM(meanPos(cur), meanPos(w)) <= stop) cur.push(...w); else groups.push([...w]);
  }
  return groups.map(obs => {
    const n = new Map();
    for (const o of obs) n.set(o.p, (n.get(o.p) || 0) + 1);
    return { ...meanPos(obs), name: placeName([...n].sort((a, b) => b[1] - a[1])[0][0]), obs };
  });
}
/** @param {Observation[]} list @returns {Tour[]} newest first */
function findTours(list) {
  const byDay = new Map();
  for (const o of list) {
    if (o.tm < 0 || !obsPos(o).lat) continue;  // needs a time and coordinates (a --redact build has none)
    if (!byDay.has(o.d)) byDay.set(o.d, []);
    byDay.get(o.d).push(o);
  }
  const tours = [];
  const { gap, step, minKm, minDur } = S.tourCfg;
  const close = (a, b) => b.tm - a.tm <= gap && distM(obsPos(a), obsPos(b)) <= step * 1000;
  for (const [d, day] of byDay) {
    day.sort((a, b) => a.tm - b.tm);
    let chain = [day[0]];
    const flush = () => {
      const stops = tourStops(chain);
      if (stops.length < 2) return;
      let km = 0;
      for (let i = 1; i < stops.length; i++) km += distM(stops[i - 1], stops[i]) / 1000;
      if (km < minKm || chain[chain.length - 1].tm - chain[0].tm < minDur) return;
      tours.push({ key: `${d}-${chain[0].tm}-${chain[0].p}`, d, y: chain[0].y, start: chain[0].tm, end: chain[chain.length - 1].tm, stops, km, obs: chain });
    };
    for (let i = 1; i < day.length; i++) {
      if (close(day[i - 1], day[i])) chain.push(day[i]);
      else { flush(); chain = [day[i]]; }
    }
    flush();
  }
  return tours.sort((a, b) => byDateDesc(a.d, b.d) || b.start - a.start);
}
// the tours the page's filters let through: the time bar's year (unless "Gesamt") and tours touching the selected region
function visibleTours() {
  const inRegion = new Set(regionObs(baseObs()));
  return findTours(baseObs()).filter(tr => (S.timeAll || tr.y === S.year) && tr.obs.some(o => inRegion.has(o)));
}
const fmtKm = km => km.toLocaleString(S.lang === "en" ? "en-GB" : "de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDuration = min => `${Math.floor(min / 60)}:${pad(min % 60)} h`;
// the four limits as inputs; a change re-renders the tab (see the "change" handler in app.js)
function tourSettingsHtml() {
  const unit = { gap: "min", step: "km", win: "min", stop: "m", minKm: "km", minDur: "min" };
  return `<div class="tour-cfg">${TOUR_LIMITS.map(([k, min, max, step]) =>
    `<label>${t("tourCfg_" + k)} <input type="number" data-tour-cfg="${k}" min="${min}" max="${max}" step="${step}" value="${S.tourCfg[k]}"> ${unit[k]}</label>`).join("")}
    <button class="lnk" type="button" data-tour-reset>${t("tourCfgReset")}</button></div>`;
}
// sortable columns, like the life list: a click sorts, a second click turns the order round
const TOUR_SORT = {
  date: tr => tr.d + String(tr.start).padStart(4, "0"),
  time: tr => tr.start,
  dur: tr => tr.end - tr.start,
  km: tr => tr.km,
  stops: tr => tr.stops.length,
  species: tr => new Set(tr.obs.map(o => o.s)).size,
};
/** @param {Tour[]} tours */
function sortTours(tours) {
  const { k, d } = S.tourSort, key = TOUR_SORT[k];
  return [...tours].sort((a, b) => {
    const va = key(a), vb = key(b);
    return d * (va < vb ? -1 : va > vb ? 1 : 0) || byDateDesc(a.d, b.d);
  });
}
function tourTh(k, label, cls = "") {
  const s = S.tourSort;
  return `<th class="sortable ${cls}${s.k === k ? " sorted" : ""}" data-tour-sort="${k}">${label}${s.k === k ? (s.d > 0 ? " ▲" : " ▼") : ""}</th>`;
}
function renderTours() {
  const tours = visibleTours();
  const { gap, step, win, stop, minKm, minDur } = S.tourCfg;
  const help = infoText(t("toursHelp", gap, fmtKm(step), stop, fmtKm(minKm), minDur, win)) + tourSettingsHtml();
  if (!tours.length) { $("tab-tours").innerHTML = help + `<p class="empty">${t("toursNone")}</p>`; updateToc(); return; }
  const stats = speciesStats(baseObs());
  const isLifer = tr => s => tr.obs.includes(stats.get(s)?.first);
  const km = tours.reduce((a, tr) => a + tr.km, 0);
  const longest = tours.reduce((a, tr) => tr.km > a.km ? tr : a);
  const richest = tours.reduce((a, tr) => new Set(tr.obs.map(o => o.s)).size > new Set(a.obs.map(o => o.s)).size ? tr : a);
  const sorted = sortTours(tours);
  const shown = S.tourAll ? sorted : sorted.slice(0, TOURS_SHOWN);
  const rows = shown.map(tr => {
    const species = new Set(tr.obs.map(o => o.s));
    const open = S.tourOpen.has(tr.key);
    let h = `<tr class="row" data-tour="${tr.key}"><td>${fmtD(tr.d)}</td><td class="hide-sm">${fmtTime(tr.start)}–${fmtTime(tr.end)}</td>
      <td class="num">${fmtDuration(tr.end - tr.start)}</td><td class="num">${fmtKm(tr.km)} km</td>
      <td class="num hide-sm">${tr.stops.length}</td><td class="num">${species.size}</td></tr>`;
    if (open) {
      h += `<tr class="detail"><td colspan="6"><div class="tour-path">${tr.stops.map(st => `${esc(st.name)} (${new Set(st.obs.map(o => o.s)).size})`).join(" → ")}</div>
        ${speciesChipsOf(tr.obs, isLifer(tr))}
        <p style="margin:10px 0 2px"><button class="btn" type="button" data-route="${tr.key}">${t("tourShowMap")}</button></p></td></tr>`;
    }
    return h;
  }).join("");
  $("tab-tours").innerHTML = `
    ${help}
    <div class="kpis k4">
      <div class="kpi main"><b>${fmtN(tours.length)}</b><span>${t("toursKCount")}</span></div>
      <div class="kpi"><b>${fmtKm(km)}</b><span>${t("toursKKm")}</span></div>
      <div class="kpi"><b>${fmtKm(longest.km)}</b><span>${t("toursKLongest", fmtD(longest.d))}</span></div>
      <div class="kpi"><b>${new Set(richest.obs.map(o => o.s)).size}</b><span>${t("toursKRichest", fmtD(richest.d))}</span></div>
    </div>
    <h2>${t("toursTitle")}<small>${tours.length}</small></h2>
    <div class="card"><table><thead><tr>${tourTh("date", t("colDate"))}${tourTh("time", t("colTime"), "hide-sm")}${tourTh("dur", t("colDuration"), "num")}
      ${tourTh("km", t("colDistance"), "num")}${tourTh("stops", t("colPlaces"), "num hide-sm")}${tourTh("species", t("mapSpecies"), "num")}</tr></thead><tbody>${rows}</tbody></table>
      ${tours.length > TOURS_SHOWN ? `<p class="more"><button class="lnk" data-tours-all>${S.tourAll ? t("showLess") : t("showAll", tours.length)}</button></p>` : ""}</div>`;
  updateToc();
}
// the tour's path on the map, numbered from its start
let MAP_ROUTE = null;
function drawTourRoute() {
  if (MAP_ROUTE) MAP_ROUTE.clearLayers();
  const tr = S.tourRoute && findTours(baseObs()).find(x => x.key === S.tourRoute);
  if (!tr) { S.tourRoute = null; return false; }
  if (!MAP_ROUTE) MAP_ROUTE = L.layerGroup().addTo(MAP);
  const pts = tr.stops.map(st => [st.lat, st.lon]);
  const accent = cssVar("--accent");
  L.polyline(pts, { color: accent, weight: 4, opacity: 0.85 }).addTo(MAP_ROUTE);
  tr.stops.forEach((st, i) => L.marker(pts[i], {
    icon: L.divIcon({ className: "route-stop", html: `<div>${i + 1}</div>`, iconSize: [22, 22] }), zIndexOffset: 3000,
  }).bindTooltip(`${i + 1}. ${esc(st.name)}: ${new Set(st.obs.map(o => o.s)).size} ${esc(t("mapSpecies"))}`).addTo(MAP_ROUTE));
  MAP.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
  $("map-note").innerHTML = `${esc(t("tourOnMap", fmtD(tr.d), tr.stops.length, fmtKm(tr.km)))} <button class="lnk" data-route-off>${t("tourHide")}</button>`;
  return true;
}
