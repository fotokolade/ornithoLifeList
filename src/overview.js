/**
 * Distinct species per year (whole year and up to today's date); `keep` narrows the observations, e.g. to one month.
 * @param {Observation[]} list
 * @param {(o: Observation) => boolean} [keep]
 */
function yearSets(list, keep = () => true) {
  const ys = new Map();
  for (let y = MIN_Y; y <= MAX_Y; y++) ys.set(y, { y, all: new Set(), ytd: new Set(), lifers: 0 });
  for (const o of list) {
    if (!keep(o)) continue;
    const r = ys.get(o.y);
    r.all.add(o.s);
    if (o.md <= TODAY_MD) r.ytd.add(o.s);
  }
  return [...ys.values()].sort((a, b) => b.y - a.y);
}
function yearRows(list, stats) {
  const rows = yearSets(list);
  for (const st of stats.values()) rows.find(r => r.y === st.first.y).lifers++;
  return rows;
}
const monthRows = list => yearSets(list, o => o.m === S.month);
function renderYearBlock(rows, opts) {
  const max = Math.max(1, ...rows.map(r => r.all.size));
  const head = `<div class="yhead"><span>${t("colYear")}</span><span>${opts.showYtd ? t("colUntil", shortMD(TODAY_MD)) : ""}</span><span></span><span>${t("colTotal")}</span><span>${opts.showNew ? t("colNew") : ""}</span></div>`;
  return `<div class="card">${head}` + rows.map(r => {
    const tot = r.all.size, ytd = r.ytd.size;
    const cur = r.y === S.year ? " cur" : "";
    const wTot = tot / max * 100, wYtd = opts.showYtd ? ytd / max * 100 : wTot;
    const c = r.y === S.year ? "var(--accent)" : "var(--bar)";
    const grad = `linear-gradient(90deg,color-mix(in srgb,${c} 45%,transparent),${c})`;
    return `<div class="yrow${cur}"><span class="y">${r.y}</span>
      <span class="ytd">${opts.showYtd ? ytd : ""}</span>
      <div class="bar"><i style="width:${wYtd}%;background:${grad}"></i>${opts.showYtd ? `<i style="width:${wTot}%;opacity:.28;background:${grad}"></i>` : ""}</div>
      <span class="tot">${tot}</span>
      <span class="new">${opts.showNew && r.lifers ? "+" + r.lifers : ""}</span></div>`;
  }).join("") + `</div>`;
}
// One numbering for every view: first sighting date, ties by taxonomic order.
function numberLifers(stats) {
  const chrono = [...stats.values()].sort((a, b) => (a.first.d < b.first.d ? -1 : a.first.d > b.first.d ? 1 : 0) || SP[a.s].order - SP[b.s].order);
  chrono.forEach((r, i) => { r.nr = i + 1; });
  return chrono;
}
function topPlacesSection(list) {
  if (S.redact) return "";
  const byPlace = new Map();
  for (const o of list) {
    let r = byPlace.get(o.p);
    if (!r) { r = { p: o.p, sp: new Set() }; byPlace.set(o.p, r); }
    r.sp.add(o.s);
  }
  const rows = [...byPlace.values()].sort((a, b) => b.sp.size - a.sp.size).slice(0, 10);
  if (!rows.length) return "";
  const max = rows[0].sp.size;
  return `<h2>${t("topPlaces")}</h2>
    ${infoText(t("topPlacesHelp"))}
    <div class="card hbar">${rows.map(r =>
      `<div class="hbar-row"><span class="lbl" title="${esc(placeName(r.p))}">${esc(placeName(r.p))}</span><div class="bar"><i style="width:${r.sp.size / max * 100}%"></i></div><span class="num">${r.sp.size}</span></div>`).join("")}</div>`;
}
function calendarSection(list, statsAll) {
  const year = S.year;
  const dayData = new Map();
  for (const o of list) {
    if (o.y !== year) continue;
    if (!dayData.has(o.d)) dayData.set(o.d, new Set());
    dayData.get(o.d).add(o.s);
  }
  if (!dayData.size) return "";
  let max = 1;
  for (const sp of dayData.values()) max = Math.max(max, sp.size);
  const liferDays = new Set([...statsAll.values()].filter(r => r.first.y === year).map(r => r.first.d));
  const dowLetters = T.weekdays.map(w => w[0]);
  const months = T.months.map((name, mi) => {
    const m = mi + 1;
    const first = new Date(Date.UTC(year, mi, 1));
    const startDow = (first.getUTCDay() + 6) % 7;  // 0 = Monday
    const daysInMonth = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-day cal-empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${pad(m)}-${pad(day)}`;
      const sp = dayData.get(dateStr);
      const n = sp ? sp.size : 0;
      const lifer = liferDays.has(dateStr);
      const bg = n ? heatColor(n / max) : "var(--line)";
      const title = n ? `${fmtD(dateStr)}: ${n} ${t("mapSpecies")}${lifer ? " · " + t("newBadge") : ""}` : fmtD(dateStr);
      cells += `<div class="cal-day${lifer ? " cal-lifer" : ""}" style="background:${bg}" title="${esc(title)}"></div>`;
    }
    // always pad to 6 full weeks (42 cells): keeps every month's grid the same height, so the
    // section doesn't jump as S.year changes (some years need 6 rows for a month, others only 4-5)
    for (let i = startDow + daysInMonth; i < 42; i++) cells += `<div class="cal-day cal-empty"></div>`;
    return `<div class="cal-month"><h4>${name}</h4>
      <div class="cal-grid">${dowLetters.map(l => `<span class="cal-dow">${l}</span>`).join("")}${cells}</div></div>`;
  }).join("");
  return `<h2 data-toc="${esc(t("tocCal"))}">${t("calTitle", year)}</h2>
    ${infoText(t("calHelp"))}
    <div class="card"><div class="cal-months-wrap">${months}</div></div>
    ${heatLegend(max)}`;
}
function renderOverview() {
  const list = regionObs(baseObs());
  if (!list.length) { $("tab-overview").innerHTML = `<p class="empty">${t("noData")}</p>`; updateToc(); return; }
  const stats = speciesStats(list);
  const days = new Set(list.map(o => o.d)).size, places = new Set(list.map(o => o.p)).size;
  const rows = yearRows(list, stats);
  const newYear = rows.find(r => r.y === S.year)?.lifers || 0;
  const c30 = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 30);  // local dates, like the export
  const cutoff = c30.getFullYear() + "-" + pad(c30.getMonth() + 1) + "-" + pad(c30.getDate());
  const new30 = [...stats.values()].filter(r => r.first.d >= cutoff).length;
  const first = list[0].d, last = list[list.length - 1].d;
  const chrono = numberLifers(stats);
  const latest = chrono.slice(-10).reverse();
  const monthLabel = T.months[S.month - 1];
  const photoPct = pctDisplay(list.filter(o => o.ph).length, list.length);
  const dayMap = new Map();
  for (const o of list) { if (!dayMap.has(o.d)) dayMap.set(o.d, new Set()); dayMap.get(o.d).add(o.s); }
  let bestDay = list[0].d, bestCount = 0;
  for (const [d, sp] of dayMap) if (sp.size > bestCount) { bestCount = sp.size; bestDay = d; }
  const heatT = heatTable(list);
  $("tab-overview").innerHTML = `
    <div class="kpis k8">
      <div class="kpi main"><b>${fmtN(stats.size)}</b><span>${t("speciesLife")}</span></div>
      <div class="kpi"><b>${fmtN(list.length)}</b><span>${t("observations")}</span></div>
      <div class="kpi"><b>${fmtN(days)}</b><span>${t("days")}</span></div>
      <div class="kpi"><b>${fmtN(places)}</b><span>${t("places")}</span></div>
      <div class="kpi"><b>+${newYear}</b><span>${t("newInYear", S.year)}</span></div>
      <div class="kpi"><b>+${new30}</b><span>${t("newLast30")}</span></div>
      <div class="kpi"><b>${photoPct}%</b><span>${t("photoShare")}</span></div>
      <div class="kpi"><b>${bestCount}</b><span>${t("bestDay", fmtD(bestDay))}</span></div>
    </div>
    <p class="sub" style="margin-top:8px">${t("period")}: ${fmtD(first)} ${t("to")} ${fmtD(last)}</p>
    ${calendarSection(list, stats)}
    <h2>${t("curve")}</h2>
    ${infoText(t("curveHelp"))}
    <div class="card">${curveSvg(chrono)}</div>
    <h2>${t("latest")}</h2>
    ${infoText(t("latestHelp"))}
    <div class="card"><table><tbody>${latest.map(r => `<tr><td class="nr">${r.nr}</td>
      <td>${speciesLine(SP[r.s])}</td>
      <td class="num">${fmtD(r.first.d)}<span class="small">${esc(placeName(r.first.p))}</span></td></tr>`).join("")}</tbody></table></div>
    <h2 data-toc="${esc(t("tocPerYear"))}">${t("perYear")}</h2>
    ${infoText(t("perYearHelp", shortMD(TODAY_MD)))}
    ${renderYearBlock(rows, { showYtd: true, showNew: true })}
    <h2 data-toc="${esc(t("tocPerMonth"))}">${t("perMonth", monthLabel)}</h2>
    ${renderYearBlock(monthRows(list), { showYtd: S.month === TODAY_M, showNew: false })}
    <h2 data-toc="${esc(t("tocHeat"))}">${t("heat")}</h2>
    <div class="card">${heatT.html}</div>
    ${heatLegend(heatT.max)}`;
  updateToc();
}
