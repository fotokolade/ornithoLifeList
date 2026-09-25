/* ---------- tours ---------- */
// Tours are reconstructed from the records themselves: on one day, records with a time that follow each
// other within `gap` minutes belong to the same walk or ride if they are no farther apart than `step` km
// plus what `speed` km/h covers in the time between them. Its stops are the mean positions of `win`-minute
// time windows, merged where they lie within `stop` metres (see tourStops()). A chain with a single stop is
// a stay, not a tour, and tours shorter than `minKm` or `minDur` minutes are left out (an hour is also the
// span a Beobachtungsliste covers a quadrant in).
// The viewer describes the outing in four choices (TOUR_CHOICES: getting about, pace, length and number
// of pauses), which fill in all numbers; each number can then be fine-tuned. Everything is kept in localStorage.
/** @typedef {{mode: string, pace: string, pauseLen: string, pauseFreq: string, gap: number, step: number, speed: number, win: number, stop: number, minKm: number, minDur: number}} TourCfg */
const TOUR_MODES = {
  foot: { speed: 4, step: 0.5, stop: 250, win: 15, gap: 30, minKm: 1, minDur: 60 },
  bike: { speed: 12, step: 1, stop: 400, win: 5, gap: 30, minKm: 5, minDur: 60 },
};
const TOUR_PACES = { snail: 0.5, easy: 1, brisk: 1.5, jaguar: 2.5 };  // factor on the mode's speed
const TOUR_PAUSE_LEN = { short: 30, long: 60 };  // max. pause in minutes: long breaks, e.g. a picnic or a long watch without a record
const TOUR_PAUSE_FREQ = { few: 1, often: 0.7 };  // factor on the speed: stopping often lowers the average
/** @type {Object<string, Object<string, any>>} the choices of the settings menu, first one each is the default */
const TOUR_CHOICES = { mode: TOUR_MODES, pace: TOUR_PACES, pauseLen: TOUR_PAUSE_LEN, pauseFreq: TOUR_PAUSE_FREQ };
/** @param {{mode: string, pace: string, pauseLen: string, pauseFreq: string}} sel @returns {TourCfg} */
function tourPreset({ mode, pace, pauseLen, pauseFreq }) {
  const m = TOUR_MODES[mode];
  return { mode, pace, pauseLen, pauseFreq, ...m, gap: TOUR_PAUSE_LEN[pauseLen],
    speed: Math.round(m.speed * TOUR_PACES[pace] * TOUR_PAUSE_FREQ[pauseFreq] * 10) / 10 };
}
const TOUR_DEFAULTS = tourPreset({ mode: "foot", pace: "easy", pauseLen: "short", pauseFreq: "few" });
// [key, min, max, step of its slider]
/** @type {["gap"|"step"|"speed"|"win"|"stop"|"minKm"|"minDur", number, number, number][]} */
const TOUR_LIMITS = [["gap", 5, 120, 5], ["step", 0, 5, 0.1], ["speed", 0, 100, 0.5], ["win", 1, 60, 1], ["stop", 50, 2000, 50], ["minKm", 0, 50, 0.5], ["minDur", 0, 240, 5]];
const TOURS_SHOWN = 30;
/** @returns {TourCfg} */
function loadTourCfg() {
  const cfg = { ...TOUR_DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem("lifelist-tour-settings") || "{}");
    const sel = Object.fromEntries(Object.entries(TOUR_CHOICES).map(([id, opts]) => [id, saved[id] in opts ? saved[id] : TOUR_DEFAULTS[id]]));
    Object.assign(cfg, tourPreset(/** @type {any} */ (sel)));
    for (const [k, min, max] of TOUR_LIMITS) if (typeof saved[k] === "number" && saved[k] >= min && saved[k] <= max) cfg[k] = saved[k];
  } catch (e) { /* no or broken settings: defaults */ }
  return cfg;
}
// data.js builds S before this file's constants exist, so the settings are filled in here
S.tourCfg = loadTourCfg();
function saveTourCfg() {
  try { localStorage.setItem("lifelist-tour-settings", JSON.stringify(S.tourCfg)); } catch (e) { /* private mode may refuse */ }
}
// true when a number was changed by hand after making the choices
const tourCfgTuned = () => { const p = tourPreset(S.tourCfg); return TOUR_LIMITS.some(([k]) => p[k] !== S.tourCfg[k]); };
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
  const { gap, step, speed, minKm, minDur } = S.tourCfg;
  // the longer the time between two records, the farther the birder may have got meanwhile
  const close = (a, b) => b.tm - a.tm <= gap && distM(obsPos(a), obsPos(b)) <= step * 1000 + speed * 1000 / 60 * (b.tm - a.tm);
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
// one "Einstellungen" menu: the way of getting about and the pace, and a slider for every number
const TOUR_UNITS = { gap: "min", step: "km", speed: "km/h", win: "min", stop: "m", minKm: "km", minDur: "min" };
const tourCfgValue = k => `${k === "step" || k === "minKm" ? fmtKm(S.tourCfg[k]) : fmtN(S.tourCfg[k])} ${TOUR_UNITS[k]}`;
const tourCfgSummary = () => `${t("tourCfg")}: ${Object.keys(TOUR_CHOICES).map(id => t(`tour_${id}_${S.tourCfg[id]}`)).join(" · ")}${tourCfgTuned() ? ` (${t("tourCfgTuned")})` : ""}`;
function tourSettingsHtml() {
  const pick = (id, keys) => `<select data-tour-preset="${id}" aria-label="${esc(t("tourCfg_" + id))}">${keys.map(k =>
    `<option value="${k}"${k === S.tourCfg[id] ? " selected" : ""}>${t(`tour_${id}_${k}`)}</option>`).join("")}</select>`;
  return `<details class="tour-settings"${S.tourSetOpen ? " open" : ""}><summary id="tour-cfg-sum">${esc(tourCfgSummary())}</summary>
    <div class="tour-presets">${Object.entries(TOUR_CHOICES).map(([id, opts]) => `<label>${t("tourCfg_" + id)} ${pick(id, Object.keys(opts))}</label>`).join("")}
      <button class="lnk" type="button" data-tour-reset>${t("tourCfgReset")}</button></div>
    <div class="tour-sliders">${TOUR_LIMITS.map(([k, min, max, step]) => `<label for="tour-cfg-${k}">${t("tourCfg_" + k)}</label>
      <input type="range" id="tour-cfg-${k}" data-tour-cfg="${k}" min="${min}" max="${max}" step="${step}" value="${S.tourCfg[k]}">
      <output id="tour-cfg-${k}-v" for="tour-cfg-${k}">${tourCfgValue(k)}</output>`).join("")}</div></details>`;
}
// after a preset or reset: move every slider and its value to the new settings
function syncTourSettings() {
  for (const [k] of TOUR_LIMITS) { $(`tour-cfg-${k}`).value = S.tourCfg[k]; $(`tour-cfg-${k}-v`).textContent = tourCfgValue(k); }
  for (const id of Object.keys(TOUR_CHOICES)) $$(`[data-tour-preset="${id}"]`).value = S.tourCfg[id];
  $("tour-cfg-sum").textContent = tourCfgSummary();
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
// the whole tab: help, settings menu and the results; the sliders only redraw the results (renderTourOut)
function renderTours() {
  $("tab-tours").innerHTML = infoText(t("toursHelp")) + tourSettingsHtml() + `<div id="tour-out"></div>`;
  renderTourOut();
}
function renderTourOut() {
  const tours = visibleTours();
  if (!tours.length) { $("tour-out").innerHTML = `<p class="empty">${t("toursNone")}</p>`; updateToc(); return; }
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
  $("tour-out").innerHTML = `
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
