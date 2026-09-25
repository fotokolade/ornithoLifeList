/* ---------- tours ---------- */
// Tours are reconstructed from the records themselves: on one day, records with a time that follow each
// other within TOUR_MAX_GAP_MIN minutes and TOUR_MAX_STEP_M metres belong to the same walk or ride.
// A chain that never leaves one place is a stay, not a tour.
const TOUR_MAX_GAP_MIN = 10, TOUR_MAX_STEP_M = 1000, TOURS_SHOWN = 30;
/**
 * @typedef {Object} Tour
 * @property {string} key - stable id: date, start minute and first place
 * @property {string} d - date "YYYY-MM-DD"
 * @property {number} y
 * @property {number} start - minute of the day of the first record
 * @property {number} end - minute of the day of the last record
 * @property {number[]} path - the places in the order they were visited (indices into PL)
 * @property {number} km - length of the path
 * @property {Observation[]} obs
 */
// great-circle distance in metres
function distM(p, q) {
  const rad = Math.PI / 180, dLat = (q.lat - p.lat) * rad, dLon = (q.lon - p.lon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
}
/** @param {Observation[]} list @returns {Tour[]} newest first */
function findTours(list) {
  const byDay = new Map();
  for (const o of list) {
    if (o.tm < 0 || !PL[o.p].lat) continue;  // needs a time and coordinates (a --redact build has none)
    if (!byDay.has(o.d)) byDay.set(o.d, []);
    byDay.get(o.d).push(o);
  }
  const tours = [];
  const close = (a, b) => b.tm - a.tm <= TOUR_MAX_GAP_MIN && (a.p === b.p || distM(PL[a.p], PL[b.p]) <= TOUR_MAX_STEP_M);
  for (const [d, day] of byDay) {
    day.sort((a, b) => a.tm - b.tm);
    let chain = [day[0]];
    const flush = () => {
      const path = chain.map(o => o.p).filter((p, i, a) => i === 0 || p !== a[i - 1]);
      if (new Set(path).size < 2) return;
      let km = 0;
      for (let i = 1; i < path.length; i++) km += distM(PL[path[i - 1]], PL[path[i]]) / 1000;
      tours.push({ key: `${d}-${chain[0].tm}-${path[0]}`, d, y: chain[0].y, start: chain[0].tm, end: chain[chain.length - 1].tm, path, km, obs: chain });
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
  if (!tours.length) { $("tab-tours").innerHTML = infoText(t("toursHelp", TOUR_MAX_GAP_MIN, fmtKm(TOUR_MAX_STEP_M / 1000))) + `<p class="empty">${t("toursNone")}</p>`; updateToc(); return; }
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
      <td class="num hide-sm">${new Set(tr.path).size}</td><td class="num">${species.size}</td></tr>`;
    if (open) {
      h += `<tr class="detail"><td colspan="6"><div class="tour-path">${tr.path.map(p => esc(placeName(p))).join(" → ")}</div>
        ${speciesChipsOf(tr.obs, isLifer(tr))}
        <p style="margin:10px 0 2px"><button class="btn" type="button" data-route="${tr.key}">${t("tourShowMap")}</button></p></td></tr>`;
    }
    return h;
  }).join("");
  $("tab-tours").innerHTML = `
    ${infoText(t("toursHelp", TOUR_MAX_GAP_MIN, fmtKm(TOUR_MAX_STEP_M / 1000)))}
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
  const pts = tr.path.map(p => [PL[p].lat, PL[p].lon]);
  const accent = cssVar("--accent");
  L.polyline(pts, { color: accent, weight: 4, opacity: 0.85 }).addTo(MAP_ROUTE);
  tr.path.forEach((p, i) => L.marker(pts[i], {
    icon: L.divIcon({ className: "route-stop", html: `<div>${i + 1}</div>`, iconSize: [22, 22] }), zIndexOffset: 3000,
  }).bindTooltip(`${i + 1}. ${esc(PL[p].name)}`).addTo(MAP_ROUTE));
  MAP.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
  $("map-note").innerHTML = `${esc(t("tourOnMap", fmtD(tr.d), new Set(tr.path).size, fmtKm(tr.km)))} <button class="lnk" data-route-off>${t("tourHide")}</button>`;
  return true;
}
