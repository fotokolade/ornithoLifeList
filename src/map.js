let MAP = null, MAP_LAYER = null, MAP_LEGEND = null;
const markerDia = frac => Math.round(2 * (5 + 17 * Math.sqrt(frac)));
// warm sequential scale (light amber = low, burnt orange = high) that stays visible on every tile layer
const markerColor = frac => `color-mix(in srgb, var(--mk-hi) ${Math.round(15 + frac * 85)}%, var(--mk-lo))`;
const markerDot = (frac, dia = markerDia(frac)) => `<div class="dot" style="width:${dia}px;height:${dia}px;background:${markerColor(frac)}"></div>`;
const popupStat = (n, label) => `<span><b>${fmtN(n)}</b>${esc(label)}</span>`;
const CLUSTER_OFF_ZOOM = 13;
// Leaflet and the marker-cluster plugin are vendored into the page (see lifelist.py's vendor-JS embedding),
// not fetched from a CDN, so they're always present; this is just a defensive check against a broken build.
function renderMap() {
  $("map-note").textContent = "";
  updateToc();  // Karte has no <h2> sections, so this just hides the toc left over from another tab
  if (typeof L === "undefined") { $("map").innerHTML = `<p class="empty">${t("mapNoLib")}</p>`; return; }
  drawMap();
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
    layers[t("mapTopo")].addTo(MAP);
    L.control.layers(layers, null, { position: "topright" }).addTo(MAP);
    MAP_LAYER = L.markerClusterGroup
      ? L.markerClusterGroup({
          maxClusterRadius: 40, disableClusteringAtZoom: CLUSTER_OFF_ZOOM, showCoverageOnHover: false,
          iconCreateFunction: cl => {
            const n = cl.getChildCount(), size = Math.round(24 + 4 * Math.log2(n));
            return L.divIcon({ html: `<div>${n}</div>`, className: "marker-cluster-custom", iconSize: [size, size] });
          },
        })
      : L.layerGroup();
    MAP_LAYER.addTo(MAP);
    MAP_LEGEND = L.control({ position: "bottomleft" });
    MAP_LEGEND.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    MAP_LEGEND.addTo(MAP);
    // the cluster key only makes sense while clusters can appear at all
    const syncClusterKey = () => MAP_LEGEND.getContainer().classList.toggle("no-cluster", !L.markerClusterGroup || MAP.getZoom() >= CLUSTER_OFF_ZOOM);
    MAP.on("zoomend", syncClusterKey);
    MAP.whenReady(syncClusterKey);
  }
  $("m-metric").options[0].text = cutoffLabel("mapLiferAll", "mapLifer");
  $("m-metric").options[1].text = t("mapYear", timePeriodLabel());
  $("m-metric").options[2].text = t("mapObs", timePeriodLabel());
  $("m-metric").options[3].text = cutoffLabel("mapNewHereAll", "mapNewHere");
  MAP.invalidateSize();
  MAP_LAYER.clearLayers();
  const regionList = regionObs(baseObs());
  // true when (y,m) falls on/before the selected time-bar cutoff, or "Gesamt" is active (no cutoff);
  // shared by both cumulative map metrics ("life": species seen here; "lifer": species first seen here)
  const withinCutoff = (y, m) => S.timeAll || y < S.year || (y === S.year && m <= S.month);
  const byPlace = new Map();
  for (const o of regionList) {
    let r = byPlace.get(o.p);
    if (!r) { r = { p: o.p, sp: new Set(), cum: new Set(), ySp: new Set(), n: 0, yn: 0, first: o.d, last: o.d, visits: new Map(), lifer: 0 }; byPlace.set(o.p, r); }
    r.sp.add(o.s); r.n++; r.last = o.d;
    if (withinCutoff(o.y, o.m)) r.cum.add(o.s);
    if (o.y === S.year && o.m <= S.month) { r.ySp.add(o.s); r.yn++; }
    if (!r.visits.has(o.d)) r.visits.set(o.d, []);
    r.visits.get(o.d).push(o);
  }
  // species whose first-ever record (across all years) falls at this place, up to the cutoff: powers the "new here" metric.
  // OBS is already date-sorted ascending, so the first entry seen per species here is its earliest record — cheaper than a full speciesStats() pass.
  const firstOfSpecies = new Map();
  for (const o of regionList) if (!firstOfSpecies.has(o.s)) firstOfSpecies.set(o.s, o);
  for (const first of firstOfSpecies.values()) {
    if (!withinCutoff(first.y, first.m)) continue;
    const r = byPlace.get(first.p);
    if (r) r.lifer++;
  }
  const value = r => S.metric === "year" ? r.ySp.size : S.metric === "obs" ? r.yn : S.metric === "lifer" ? r.lifer : r.cum.size;
  const pts = [...byPlace.values()].filter(r => PL[r.p].lat && value(r) > 0).sort((a, b) => value(b) - value(a));
  $("map-note").textContent = t("mapNote", pts.length);
  const legend = MAP_LEGEND.getContainer();
  if (!pts.length) { legend.hidden = true; return; }
  const max = value(pts[0]);
  const steps = [...new Set([max, Math.round(max / 2), 1])].filter(v => v > 0);
  legend.hidden = false;
  legend.innerHTML = `<b>${esc($("m-metric").selectedOptions[0].text)}</b><div class="map-legend-row">${steps.map(v =>
    `<span>${markerDot(v / max)}${fmtN(v)}</span>`).join("")}<span class="cluster-key"><i class="map-legend-cluster"></i>${t("mapClusterKey")}</span></div>`;
  const bounds = [];
  for (const r of pts) {
    const p = PL[r.p], v = value(r);
    const visits = [...r.visits].sort((a, b) => byDateDesc(a[0], b[0]));
    const visitList = visits.map(([d, obs]) => `<details><summary>${fmtD(d)} (${obs.length})</summary><ul>${obs
      .map(o => `<li>${esc(speciesName(SP[o.s]))}${o.c ? ` (${o.c})` : ""}${o.ph ? " 📷" : ""}</li>`).join("")}</ul></details>`).join("");
    // a plain div-icon marker (not circleMarker) so the cluster plugin, which only understands L.Marker, can group these
    const dia = markerDia(v / max);
    const icon = L.divIcon({ className: "value-marker", html: markerDot(v / max, dia), iconSize: [dia, dia], iconAnchor: [dia / 2, dia / 2] });
    // smaller circles on top, so a big neighbour never hides one completely
    const marker = L.marker([p.lat, p.lon], { icon, zIndexOffset: Math.round((1 - v / max) * 1000) })
      .bindPopup(`<div class="pop-h">${esc(p.name)}</div><div class="pop-sub">${esc(p.muni)}</div>
        <div class="pop-stats">${popupStat(r.sp.size, t("mapSpecies"))}${popupStat(r.n, t("obsShort"))}${r.lifer ? popupStat(r.lifer, t("mapLifeHere")) : ""}</div>
        <div class="pop-sub">${fmtD(r.first)} ${t("to")} ${fmtD(r.last)}</div>
        <div class="visits">${visitList}</div>
        <button class="lnk" data-region="p:${p.i}">${t("mapFilter")}</button>`, { maxWidth: 300, minWidth: 220 })
      .bindTooltip(`${esc(p.name)}: ${fmtN(v)}`, { direction: "top", offset: [0, -dia / 2] })
      .addTo(MAP_LAYER);
    marker.on("popupopen", () => marker.closeTooltip());
    bounds.push([p.lat, p.lon]);
  }
  MAP.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
}
