const MIN_TIMED = 5;  // minimum timed sightings before a species gets a typical time of day
const fmtTime = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const median = arr => {
  const a = [...arr].sort((x, y) => x - y), n = a.length;
  return n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2);
};
const hourLabel = h => t("hourRange", h, (h + 1) % 24);
// the tab's observations: region filter, and the time bar's year unless "Gesamt" is on
const activityScope = () => regionObs(baseObs()).filter(o => S.timeAll || o.y === S.year);
// Monday-first weekday index of a "YYYY-MM-DD" date; cached, as it runs for every observation on each redraw
const weekdayCache = new Map();
const weekdayOf = d => {
  let wd = weekdayCache.get(d);
  if (wd === undefined) { wd = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7; weekdayCache.set(d, wd); }
  return wd;
};
// how often each weekday occurs in the period the export covers, limited to the time bar's year unless "Gesamt" is on;
// the denominator for "share of all Saturdays you were out"
function weekdayTotals() {
  let from = OBS[0].d, to = OBS[OBS.length - 1].d;
  if (!S.timeAll) {
    if (from < `${S.year}-01-01`) from = `${S.year}-01-01`;
    if (to > `${S.year}-12-31`) to = `${S.year}-12-31`;
  }
  const totals = Array(7).fill(0);
  for (let ms = Date.parse(from + "T00:00:00Z"), end = Date.parse(to + "T00:00:00Z"); ms <= end; ms += 864e5) totals[(new Date(ms).getUTCDay() + 6) % 7]++;
  return totals;
}
// Werktag/Wochenende split of the observation days as a two-part ring, with the weekend's share of the calendar for comparison
function weekendRing(wdDays, totals) {
  const days = wdDays.map(s => s.size), all = days.reduce((a, b) => a + b, 0);
  if (!all) return "";
  const weekend = days[5] + days[6], share = pctDisplay(weekend, all);
  const calShare = pctDisplay(totals[5] + totals[6], totals.reduce((a, b) => a + b, 0));
  const r = 44, c = 2 * Math.PI * r, arc = weekend / all * c;
  return `<div class="card wd-ring">
    <svg viewBox="0 0 120 120" role="img" aria-label="${esc(t("wdRingAria", share))}">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--bar)" stroke-width="16"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--k2)" stroke-width="16" stroke-dasharray="${arc.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="60" text-anchor="middle" class="wd-ring-n">${share} %</text>
      <text x="60" y="76" text-anchor="middle" class="wd-ring-l">${esc(t("wdWeekend"))}</text>
    </svg>
    <div class="legend wd-legend"><span class="season-key" style="background:var(--bar)"></span>${t("wdWork")}<span class="season-key" style="background:var(--k2)"></span>${t("wdWeekend")}</div>
    <p class="sub">${t("wdRingNote", share, calShare)}</p></div>`;
}
function renderActivity() {
  const scoped = activityScope();
  const timed = scoped.filter(o => o.tm >= 0);
  if (!timed.length) { $("act-out").innerHTML = `<p class="empty">${t("noData")}</p>`; updateToc(); return; }

  const obsH = Array(24).fill(0), spH = Array.from({ length: 24 }, () => new Set()), dayH = Array.from({ length: 24 }, () => new Set());
  const bySpecies = new Map();
  for (const o of timed) {
    const h = Math.floor(o.tm / 60);
    obsH[h]++; spH[h].add(o.s); dayH[h].add(o.d);
    if (!bySpecies.has(o.s)) bySpecies.set(o.s, []);
    bySpecies.get(o.s).push(o.tm);
  }
  const series = { obs: obsH, species: spH.map(s => s.size), days: dayH.map(s => s.size) }[S.actMetric];
  const hours = [...Array(24).keys()];
  const peak = obsH.indexOf(Math.max(...obsH));

  // weekday chart counts days, so it uses every sighting of the scope, with or without a time
  const wdDays = Array.from({ length: 7 }, () => new Set());
  for (const o of scoped) wdDays[weekdayOf(o.d)].add(o.d);
  const wdTotals = weekdayTotals();
  const wdPct = wdDays.map((sd, i) => pctDisplay(sd.size, wdTotals[i]));
  const wdTips = T.weekdays.map((w, i) => t("wdTip", w, wdDays[i].size, wdTotals[i], wdPct[i]));

  const stops = dayStops();
  const speciesRows = [...bySpecies].filter(([, a]) => a.length >= MIN_TIMED).map(([s, a]) => ({ s, med: median(a), n: a.length }));
  const speciesTable = rows => `<div class="card"><table><thead><tr><th>${t("name")}</th><th class="num">${t("colMedian")}</th><th class="num">${t("obsShort")}</th></tr></thead><tbody>${rows.map(r =>
    `<tr><td>${speciesLine(SP[r.s])}</td><td class="num"><span class="time-chip" style="background:${dayColor(r.med / 60, stops)}"></span>${fmtTime(r.med)}</td><td class="num">${r.n}</td></tr>`).join("")}</tbody></table></div>`;
  const early = [...speciesRows].sort((a, b) => a.med - b.med).slice(0, 8), late = [...speciesRows].sort((a, b) => b.med - a.med).slice(0, 8);

  // month x hour and weekday x hour, over the records with a time
  const hourSpec = (names, labels, rowOf) => ({ obs: timed, rows: names.map((_, i) => String(i)), rowLabels: labels.map(esc), rowNames: names,
    colLabels: hours.map(String), colNames: hours.map(hourLabel), rowOf, colOf: o => Math.floor(o.tm / 60), cls: "hours" });

  const metricOptions = [["obs", "actMObs"], ["species", "actMSpecies"], ["days", "actMDays"]]
    .map(([k, l]) => `<option value="${k}"${k === S.actMetric ? " selected" : ""}>${t(l)}</option>`).join("");
  $("act-out").innerHTML = `
    ${infoText(t("actHelp", fmtN(timed.length), fmtN(scoped.length)))}
    <div class="kpis">
      ${kpiTile(fmtN(timed.length), t("actKTimed"), "activity", { main: true })}
      ${kpiTile(hourLabel(peak), t("actKPeak"), "activity")}
    </div>
    <h2 data-toc="${esc(t("tocActHour"))}">${t("actHourTitle")}<label class="ctl">${t("actCountBy")}<select id="a-metric" aria-label="${esc(t("ariaMetric"))}">${metricOptions}</select></label></h2>
    <div class="card" id="hour-card">${barChartSvg(series, hours, hours.map(h => hourLabel(h) + ": " + series[h]), 3)}</div>
    <h2 data-toc="${esc(t("actWeekday"))}">${t("actWeekday")}<small>${t("wdShare")}</small></h2>
    ${infoText(t("actWeekdayHelp"))}
    <div class="wd-grid">
      <div class="card" id="weekday-card">${barChartSvg(wdPct, T.weekdays, wdTips)}</div>
      ${weekendRing(wdDays, wdTotals)}
    </div>
    <h2 data-toc="${esc(t("tocWdHeat"))}">${t("wdHeat")}${heatMetricPick("w")}</h2>
    ${infoText(t("wdHeatHelp"))}
    ${heatSection("w", hourSpec(T.weekdays, T.weekdays, o => weekdayOf(o.d)))}
    <h2>${t("actHeat")}${heatMetricPick("m")}</h2>
    ${infoText(t("actHeatHelp"))}
    ${heatSection("m", hourSpec(T.months, T.monthsShort.map(m => m.replace(".", "")), o => o.m - 1))}
    <h2 data-toc="${esc(t("tocActSpecies"))}">${t("actSpecies")}</h2>
    ${infoText(t("actSpeciesHelp", MIN_TIMED))}
    <div class="detailgrid"><div><b>${t("actEarly")}</b>${speciesTable(early)}</div><div><b>${t("actLate")}</b>${speciesTable(late)}</div></div>`;
  upgradeDayCurve($("hour-card"), series, hours.map(hourLabel), t({ obs: "actMObs", species: "actMSpecies", days: "actMDays" }[S.actMetric]), stops);
  upgradeWeekdayChart($("weekday-card"), T.weekdays, wdPct, wdTips);
  updateToc();
}
