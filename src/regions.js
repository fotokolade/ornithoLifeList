const LEVELS = [
  { lvl: "s", title: "grpState", label: p => stateName(p.state || "?") },
  { lvl: "c", title: "grpCounty", label: p => countyName(p.keys.c) },
  { lvl: "m", title: "grpMuni", label: p => p.muni || T.unknown },
  { lvl: "p", title: "grpPlace", label: p => p.name },
];
function regionTable(lv, list, first = false) {
  const map = new Map();
  for (const o of list) {
    const p = PL[o.p], key = p.keys[lv.lvl];
    let r = map.get(key);
    if (!r) { r = { key, name: lv.label(p), life: new Set(), year: new Set(), month: new Set() }; map.set(key, r); }
    r.life.add(o.s);
    if (o.y === S.year) { r.year.add(o.s); if (o.m === S.month) r.month.add(o.s); }
  }
  const rows = [...map.values()];
  const sort = S.regSort[lv.lvl] || { k: "life", d: -1 };
  const val = { life: r => r.life.size, year: r => r.year.size, month: r => r.month.size };
  rows.sort((a, b) => sort.k === "name" ? sort.d * collator.compare(a.name, b.name)
    : sort.d * (val[sort.k](a) - val[sort.k](b)) || collator.compare(a.name, b.name));
  const showAll = S.regAll[lv.lvl], shown = showAll ? rows : rows.slice(0, 10);
  const maxLife = Math.max(1, ...rows.map(r => r.life.size));
  const th = (k, label, cls) => `<th class="sortable ${cls}${sort.k === k ? " sorted" : ""}" data-lvl="${lv.lvl}" data-k="${k}">${label}${sort.k === k ? (sort.d > 0 ? " ▲" : " ▼") : ""}</th>`;
  // the tables' names are the clickable ones: the hint sits with the first of them
  return `<h2 data-toc="${esc(t(lv.title))}">${t("regionsBy", t(lv.title))}<small>${rows.length}</small></h2>${first ? infoText(t("regionsHelp")) : ""}<div class="card"><table class="rtable"><thead><tr>
    <th class="nr">#</th>${th("name", t(lv.title), "")}<th class="rbar"></th>${th("life", t("colLife"), "num")}${th("year", t("colYearShort") + " " + S.year, "num")}${th("month", T.monthsShort[S.month - 1].replace(".", "") + " " + S.year, "num")}</tr></thead><tbody>` +
    shown.map((r, i) => {
      const pct = r.life.size / maxLife * 100;
      return `<tr><td class="nr">${i + 1}</td><td><button class="lnk" data-region="${lv.lvl}:${esc(r.key)}" title="${esc(r.name)}">${esc(r.name)}</button></td>
      <td class="rbar"><div class="bar"><i style="width:${pct}%"></i></div></td><td class="num">${r.life.size}</td><td class="num">${r.year.size}</td><td class="num">${r.month.size}</td></tr>`;
    }).join("") +
    `</tbody></table>${rows.length > 10 ? `<p class="more"><button class="lnk" data-more="${lv.lvl}">${showAll ? t("showLess") : t("showAll", rows.length)}</button></p>` : ""}</div>`;
}
function regionCoverageSection(list) {
  // its own region picker right here (the same choice as the header's), so the section can't be missed or seem unusable
  const picker = `<label class="ctl">${t("regCoveragePick")}<select id="reg-cov" aria-label="${esc(t("regCoveragePick"))}">${$("f-region").innerHTML}</select></label>`;
  const head = `<h2 data-toc="${esc(t("tocRegCoverage"))}">${t("tocRegCoverage")}${picker}</h2>`;
  if (S.region === "all") return head + `<p class="prose">${t("regCoverageHint")}</p>`;
  const here = regionObs(list);
  const fullSpecies = new Set(list.map(o => o.s));
  const hereSpecies = new Set(here.map(o => o.s));
  const missing = [...fullSpecies].filter(s => !hereSpecies.has(s)).sort((a, b) => collator.compare(speciesName(SP[a]), speciesName(SP[b])));
  return head + `<p class="prose">${t("regCoverageHelp", hereSpecies.size, fullSpecies.size, missing.length)}</p>
    ${missing.length ? `<div class="card" style="max-height:260px;overflow:auto"><div class="chips">${missing.map(s => `<span class="chip">${esc(speciesName(SP[s]))}</span>`).join("")}</div></div>` : `<p class="empty">${t("regCoverageDone")}</p>`}`;
}
/* ---------- region x month: where you are out in which month ---------- */
const REG_MONTH_ROWS = 12;
// the levels shown: place levels are hidden while redacted
const visibleLevels = () => LEVELS.filter(lv => !S.redact || lv.lvl === "s" || lv.lvl === "c");
// observations of the region x month table: all regions (it compares them), the time bar's year unless "Gesamt" is on
const regMonthScope = list => list.filter(o => S.timeAll || o.y === S.year);
// the chosen row level, or Landkreis when the choice isn't available (place levels are hidden while redacted)
const regMonthLevel = () => visibleLevels().find(l => l.lvl === S.regMonthLvl) || LEVELS[1];
function regionMonthSection(list) {
  const lv = regMonthLevel();
  const byRegion = new Map();
  for (const o of regMonthScope(list)) {
    const p = PL[o.p], key = p.keys[lv.lvl];
    let r = byRegion.get(key);
    if (!r) { r = { key, name: lv.label(p), days: new Set() }; byRegion.set(key, r); }
    r.days.add(o.d);
  }
  const rows = [...byRegion.values()].sort((a, b) => b.days.size - a.days.size || collator.compare(a.name, b.name)).slice(0, REG_MONTH_ROWS);
  const levelPick = `<label class="ctl">${t("rmLevel")}<select id="rm-level" aria-label="${esc(t("rmLevel"))}">${visibleLevels().map(l =>
    `<option value="${l.lvl}"${l === lv ? " selected" : ""}>${t(l.title)}</option>`).join("")}</select></label>`;
  const head = `<h2 data-toc="${esc(t("tocRegMonth"))}">${t("rmTitle")}${levelPick}${heatMetricPick("rm")}</h2>${infoText(t("rmHelp"))}`;
  if (!rows.length) return head + `<p class="empty">${t("noData")}</p>`;
  // the rows are the regions with the most days out; the table itself counts by its own metric
  const index = new Map(rows.map((r, i) => [r.key, i]));
  return head + heatSection("rm", { obs: regMonthScope(list), rows: rows.map(r => r.key), rowLabels: rows.map(r => esc(r.name)), rowNames: rows.map(r => r.name),
    colLabels: monthColLabels(), colNames: T.months, rowOf: o => index.get(PL[o.p].keys[lv.lvl]) ?? -1, colOf: o => o.m - 1, numbers: true, cls: "months rm" });
}
function renderRegions() {
  const list = baseObs();
  $("tab-regions").innerHTML = topPlacesSection(regionObs(list))
    + regionCoverageSection(list)
    + regionMonthSection(list)
    + visibleLevels().map((lv, i) => regionTable(lv, list, i === 0)).join("");
  $("reg-cov").value = S.region;
  updateToc();
}
