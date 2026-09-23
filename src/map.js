let MAP = null, MAP_LAYER = null, mapYearRAF = null;
// combined (year,month) index for the time-travel slider, 0 = January of MIN_Y, one step per calendar month
const mapYMIndex = (y, m) => (y - MIN_Y) * 12 + (m - 1);
const mapYMFromIndex = idx => ({ y: MIN_Y + Math.floor(idx / 12), m: (idx % 12) + 1 });
const mapPeriodLabel = () => S.month === 12 ? String(S.year) : `${T.monthsShort[S.month - 1]} ${S.year}`;
// Leaflet (+ the marker-cluster plugin) is fetched on the first visit of the map tab, so a slow or blocked CDN cannot delay the rest of the page.
const LEAFLET_URL = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min";
const CLUSTER_URL = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js";
const CLUSTER_CSS = ["https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css"];
let leafletLoading = null;
function loadLeaflet() {
  if (typeof L !== "undefined") return Promise.resolve();
  if (!leafletLoading) {
    leafletLoading = new Promise((resolve, reject) => {
      const links = CLUSTER_CSS.map(href => Object.assign(document.createElement("link"), { rel: "stylesheet", href }));
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = LEAFLET_URL + ".css";
      const js = document.createElement("script");
      js.src = LEAFLET_URL + ".js";
      js.onload = () => {
        const cluster = document.createElement("script");
        cluster.src = CLUSTER_URL;
        // clustering is a nice-to-have on top of core Leaflet: if only this CDN request fails, still resolve
        // so the map renders with drawMap()'s plain-layerGroup fallback instead of the whole map being disabled
        cluster.onload = resolve;
        cluster.onerror = resolve;
        document.head.append(cluster);
      };
      js.onerror = () => { leafletLoading = null; css.remove(); reject(new Error("leaflet")); };
      document.head.append(css, ...links, js);
    });
  }
  return leafletLoading;
}
function renderMap() {
  $("map-note").textContent = "";
  updateToc();  // Karte has no <h2> sections, so this just hides the toc left over from another tab
  loadLeaflet().then(() => { if (S.tab === "map") drawMap(); },
    () => { if (!MAP) $("map").innerHTML = `<p class="empty">${t("mapNoLib")}</p>`; });
}
function drawMap() {
  const box = $("map");
  if (!MAP) {
    box.innerHTML = "";
    MAP = L.map(box);
    const esri = "&copy; Esri, HERE, Garmin, OpenStreetMap-Mitwirkende";
    const layers = {
      [t("mapStreets")]: L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: esri }),
      [t("mapTopo")]: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, subdomains: "abc", attribution: "Kartendaten &copy; OpenStreetMap-Mitwirkende, SRTM, Darstellung &copy; OpenTopoMap (CC-BY-SA)" }),
      [t("mapSat")]: L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "&copy; Esri, Maxar, Earthstar Geographics" }),
    };
    Object.values(layers)[0].addTo(MAP);
    L.control.layers(layers, null, { position: "topright" }).addTo(MAP);
    MAP_LAYER = L.markerClusterGroup
      ? L.markerClusterGroup({
          maxClusterRadius: 45,
          iconCreateFunction: cl => L.divIcon({
            html: `<div>${cl.getChildCount()}</div>`, className: "marker-cluster-custom", iconSize: [36, 36],
          }),
        })
      : L.layerGroup();
    MAP_LAYER.addTo(MAP);
  }
  $("m-metric").options[1].text = t("mapYear", mapPeriodLabel());
  $("m-metric").options[2].text = t("mapObs", mapPeriodLabel());
  $("m-metric").options[3].text = t("mapLifer", mapPeriodLabel());
  MAP.invalidateSize();
  MAP_LAYER.clearLayers();
  const regionList = regionObs(baseObs());
  const byPlace = new Map();
  for (const o of regionList) {
    let r = byPlace.get(o.p);
    if (!r) { r = { p: o.p, sp: new Set(), ySp: new Set(), n: 0, yn: 0, first: o.d, last: o.d, visits: new Map(), lifer: 0 }; byPlace.set(o.p, r); }
    r.sp.add(o.s); r.n++; r.last = o.d;
    if (o.y === S.year && o.m <= S.month) { r.ySp.add(o.s); r.yn++; }
    if (!r.visits.has(o.d)) r.visits.set(o.d, []);
    r.visits.get(o.d).push(o);
  }
  // species whose first-ever record (across all years) falls at this place, up to the selected year+month: powers the "lifer time travel" metric.
  // OBS is already date-sorted ascending, so the first entry seen per species here is its earliest record — cheaper than a full speciesStats() pass.
  const firstOfSpecies = new Map();
  for (const o of regionList) if (!firstOfSpecies.has(o.s)) firstOfSpecies.set(o.s, o);
  for (const first of firstOfSpecies.values()) {
    if (first.y > S.year || (first.y === S.year && first.m > S.month)) continue;
    const r = byPlace.get(first.p);
    if (r) r.lifer++;
  }
  const value = r => S.metric === "year" ? r.ySp.size : S.metric === "obs" ? r.yn : S.metric === "lifer" ? r.lifer : r.sp.size;
  const pts = [...byPlace.values()].filter(r => PL[r.p].lat && value(r) > 0).sort((a, b) => value(b) - value(a));
  $("map-note").textContent = t("mapNote", pts.length);
  if (!pts.length) return;
  const max = value(pts[0]);
  const bounds = [];
  for (const r of pts) {
    const p = PL[r.p], v = value(r);
    const visits = [...r.visits].sort((a, b) => byDateDesc(a[0], b[0]));
    const visitList = visits.map(([d, obs]) => `<details><summary>${fmtD(d)} (${obs.length})</summary><ul>${obs
      .map(o => `<li>${esc(speciesName(SP[o.s]))}${o.c ? ` (${o.c})` : ""}${o.ph ? " 📷" : ""}</li>`).join("")}</ul></details>`).join("");
    // a plain div-icon marker (not circleMarker) so the cluster plugin, which only understands L.Marker, can group these
    const dia = Math.round(2 * (5 + 17 * Math.sqrt(v / max)));
    const icon = L.divIcon({
      className: "value-marker",
      html: `<div style="width:${dia}px;height:${dia}px;background:${heatColor(v / max)};opacity:.8;border:1.5px solid rgba(0,0,0,.35);border-radius:50%"></div>`,
      iconSize: [dia, dia], iconAnchor: [dia / 2, dia / 2],
    });
    L.marker([p.lat, p.lon], { icon })
      .bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.muni)}<br>${t("mapSpecies")}: ${r.sp.size}, ${t("observations")}: ${r.n}${r.lifer ? `, ${t("mapLifeHere")}: ${r.lifer}` : ""}<br>${fmtD(r.first)} ${t("to")} ${fmtD(r.last)}
        <div class="visits">${visitList}</div>
        <button class="lnk" data-region="p:${p.i}">${t("mapFilter")}</button>`, { maxWidth: 280 })
      .bindTooltip(`${esc(p.name)}: ${v}`)
      .addTo(MAP_LAYER);
    bounds.push([p.lat, p.lon]);
  }
  MAP.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
}
