/* ---------- tours ---------- */
// Tours are reconstructed from the records themselves: on one day, records with a time that follow each
// other within TOUR_MAX_GAP_MIN minutes and TOUR_MAX_STEP_M metres belong to the same walk or ride.
// Records in a row within TOUR_STOP_RADIUS_M of each other are one stop (several species reported at
// one spot): the stop sits at the mean position of its records. A chain with a single stop is a stay,
// not a tour.
const TOUR_MAX_GAP_MIN = 10, TOUR_MAX_STEP_M = 1000, TOUR_STOP_RADIUS_M = 150, TOURS_SHOWN = 30;
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
 * Groups a tour's records in a row into stops: a record within TOUR_STOP_RADIUS_M of the current stop's
 * mean position joins it and moves that mean, weighted by records; a farther one starts the next stop.
 * @param {Observation[]} chain @returns {TourStop[]}
 */
function tourStops(chain) {
  /** @type {(TourStop & {sumLat: number, sumLon: number})[]} */
  const stops = [];
  for (const o of chain) {
    const p = obsPos(o), cur = stops[stops.length - 1];
    if (cur && distM(cur, p) <= TOUR_STOP_RADIUS_M) {
      cur.obs.push(o);
      cur.sumLat += p.lat; cur.sumLon += p.lon;
      cur.lat = cur.sumLat / cur.obs.length; cur.lon = cur.sumLon / cur.obs.length;
    } else {
      stops.push({ lat: p.lat, lon: p.lon, sumLat: p.lat, sumLon: p.lon, name: "", obs: [o] });
    }
  }
  for (const st of stops) {
    const n = new Map();
    for (const o of st.obs) n.set(o.p, (n.get(o.p) || 0) + 1);
    st.name = placeName([...n].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return stops;
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
  const close = (a, b) => b.tm - a.tm <= TOUR_MAX_GAP_MIN && distM(obsPos(a), obsPos(b)) <= TOUR_MAX_STEP_M;
  for (const [d, day] of byDay) {
    day.sort((a, b) => a.tm - b.tm);
    let chain = [day[0]];
    const flush = () => {
      const stops = tourStops(chain);
      if (stops.length < 2) return;
      let km = 0;
      for (let i = 1; i < stops.length; i++) km += distM(stops[i - 1], stops[i]) / 1000;
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
function renderTours() {
  const tours = visibleTours();
  if (!tours.length) { $("tab-tours").innerHTML = infoText(t("toursHelp", TOUR_MAX_GAP_MIN, fmtKm(TOUR_MAX_STEP_M / 1000), TOUR_STOP_RADIUS_M)) + `<p class="empty">${t("toursNone")}</p>`; updateToc(); return; }
  const stats = speciesStats(baseObs());
  const isLifer = tr => s => tr.obs.includes(stats.get(s)?.first);
  const km = tours.reduce((a, tr) => a + tr.km, 0);
  const longest = tours.reduce((a, tr) => tr.km > a.km ? tr : a);
  const richest = tours.reduce((a, tr) => new Set(tr.obs.map(o => o.s)).size > new Set(a.obs.map(o => o.s)).size ? tr : a);
  const shown = S.tourAll ? tours : tours.slice(0, TOURS_SHOWN);
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
    ${infoText(t("toursHelp", TOUR_MAX_GAP_MIN, fmtKm(TOUR_MAX_STEP_M / 1000), TOUR_STOP_RADIUS_M))}
    <div class="kpis k4">
      <div class="kpi main"><b>${fmtN(tours.length)}</b><span>${t("toursKCount")}</span></div>
      <div class="kpi"><b>${fmtKm(km)}</b><span>${t("toursKKm")}</span></div>
      <div class="kpi"><b>${fmtKm(longest.km)}</b><span>${t("toursKLongest", fmtD(longest.d))}</span></div>
      <div class="kpi"><b>${new Set(richest.obs.map(o => o.s)).size}</b><span>${t("toursKRichest", fmtD(richest.d))}</span></div>
    </div>
    <h2>${t("toursTitle")}<small>${tours.length}</small></h2>
    <div class="card"><table><thead><tr><th>${t("colDate")}</th><th class="hide-sm">${t("colTime")}</th><th class="num">${t("colDuration")}</th>
      <th class="num">${t("colDistance")}</th><th class="num hide-sm">${t("colPlaces")}</th><th class="num">${t("mapSpecies")}</th></tr></thead><tbody>${rows}</tbody></table>
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
