const MIN_TIMED = 5;  // minimum timed sightings before a species gets a typical time of day
const fmtTime = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const median = arr => {
  const a = [...arr].sort((x, y) => x - y), n = a.length;
  return n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2);
};
function renderActivity() {
  const scoped = regionObs(baseObs()).filter(o => S.timeAll || o.y === S.year);
  const timed = scoped.filter(o => o.tm >= 0);
  if (!timed.length) { $("act-out").innerHTML = `<p class="empty">${t("noData")}</p>`; updateToc(); return; }

  const obsH = Array(24).fill(0), spH = Array.from({ length: 24 }, () => new Set()), dayH = Array.from({ length: 24 }, () => new Set());
  const bySpecies = new Map(), monthHour = Array.from({ length: 12 }, () => Array(24).fill(0));
  for (const o of timed) {
    const h = Math.floor(o.tm / 60);
    obsH[h]++; spH[h].add(o.s); dayH[h].add(o.d); monthHour[o.m - 1][h]++;
    if (!bySpecies.has(o.s)) bySpecies.set(o.s, []);
    bySpecies.get(o.s).push(o.tm);
  }
  const series = { obs: obsH, species: spH.map(s => s.size), days: dayH.map(s => s.size) }[S.actMetric];
  const hours = [...Array(24).keys()], hourLabel = h => t("hourRange", h, (h + 1) % 24);
  const peak = obsH.indexOf(Math.max(...obsH));

  // weekday chart counts days, so it uses every sighting of the scope, with or without a time
  const wdDays = Array.from({ length: 7 }, () => new Set());
  for (const o of scoped) wdDays[(new Date(o.d + "T00:00:00Z").getUTCDay() + 6) % 7].add(o.d);

  const stops = dayStops();
  const speciesRows = [...bySpecies].filter(([, a]) => a.length >= MIN_TIMED).map(([s, a]) => ({ s, med: median(a), n: a.length }));
  const speciesTable = rows => `<div class="card"><table><thead><tr><th>${t("name")}</th><th class="num">${t("colMedian")}</th><th class="num">${t("obsShort")}</th></tr></thead><tbody>${rows.map(r =>
    `<tr><td>${speciesLine(SP[r.s])}</td><td class="num"><span class="time-chip" style="background:${dayColor(r.med / 60, stops)}"></span>${fmtTime(r.med)}</td><td class="num">${r.n}</td></tr>`).join("")}</tbody></table></div>`;
  const early = [...speciesRows].sort((a, b) => a.med - b.med).slice(0, 8), late = [...speciesRows].sort((a, b) => b.med - a.med).slice(0, 8);

  const heatMax = Math.max(1, ...monthHour.flat());
  const heat = `<table class="heat"><thead><tr><th></th>${hours.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${monthHour.map((row, m) =>
    `<tr><td class="y">${T.monthsShort[m].replace(".", "")}</td>${row.map((n, h) => n
      ? `<td title="${esc(T.months[m] + ", " + hourLabel(h) + ": " + n)}" style="background:${heatColor(n / heatMax)}"></td>`
      : `<td></td>`).join("")}</tr>`).join("")}</tbody></table>`;

  const metricOptions = [["obs", "actMObs"], ["species", "actMSpecies"], ["days", "actMDays"]]
    .map(([k, l]) => `<option value="${k}"${k === S.actMetric ? " selected" : ""}>${t(l)}</option>`).join("");
  $("act-out").innerHTML = `
    ${infoText(t("actHelp", fmtN(timed.length), fmtN(scoped.length)))}
    <div class="kpis">
      <div class="kpi main"><b>${fmtN(timed.length)}</b><span>${t("actKTimed")}</span></div>
      <div class="kpi"><b>${hourLabel(peak)}</b><span>${t("actKPeak")}</span></div>
    </div>
    <h2 data-toc="${esc(t("tocActHour"))}">${t("actHourTitle")}<label class="ctl">${t("actCountBy")}<select id="a-metric" aria-label="${esc(t("ariaMetric"))}">${metricOptions}</select></label></h2>
    <div class="card" id="hour-card">${barChartSvg(series, hours, hours.map(h => hourLabel(h) + ": " + series[h]), 3)}</div>
    <h2>${t("actWeekday")}<small>${t("actMDays")}</small></h2>
    ${infoText(t("actWeekdayHelp"))}
    <div class="card" id="weekday-card">${barChartSvg(wdDays.map(s => s.size), T.weekdays, T.weekdays.map((w, i) => w + ": " + wdDays[i].size))}</div>
    <h2>${t("actHeat")}</h2>
    ${infoText(t("actHeatHelp"))}
    <div class="card">${heat}</div>
    ${heatLegend(heatMax)}
    <h2 data-toc="${esc(t("tocActSpecies"))}">${t("actSpecies")}</h2>
    ${infoText(t("actSpeciesHelp", MIN_TIMED))}
    <div class="detailgrid"><div><b>${t("actEarly")}</b>${speciesTable(early)}</div><div><b>${t("actLate")}</b>${speciesTable(late)}</div></div>`;
  upgradeDayCurve($("hour-card"), series, hours.map(hourLabel), t({ obs: "actMObs", species: "actMSpecies", days: "actMDays" }[S.actMetric]), stops);
  upgradeBarChart($("weekday-card"), T.weekdays, wdDays.map(s => s.size), T.weekdays.map((w, i) => w + ": " + wdDays[i].size));
  updateToc();
}
