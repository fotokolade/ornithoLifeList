const LEVELS = [
  { lvl: "s", title: "grpState", label: p => stateName(p.state || "?") },
  { lvl: "c", title: "grpCounty", label: p => countyName(p.keys.c) },
  { lvl: "m", title: "grpMuni", label: p => p.muni || T.unknown },
  { lvl: "p", title: "grpPlace", label: p => p.name },
];
function regionTable(lv, list) {
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
  return `<h2 data-toc="${esc(t(lv.title))}">${t("regionsBy", t(lv.title))}<small>${rows.length}</small></h2><div class="card"><table class="rtable"><thead><tr>
    <th class="nr">#</th>${th("name", t("name"), "")}${th("life", t("colLife"), "num")}${th("year", t("colYearShort") + " " + S.year, "num")}${th("month", T.monthsShort[S.month - 1].replace(".", "") + " " + S.year, "num")}</tr></thead><tbody>` +
    shown.map((r, i) => {
      const pct = Math.round(r.life.size / maxLife * 100);
      return `<tr><td class="nr">${i + 1}</td><td><button class="lnk" data-region="${lv.lvl}:${esc(r.key)}">${esc(r.name)}</button></td>
      <td class="num" style="background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 16%,transparent) ${pct}%,transparent ${pct}%)">${r.life.size}</td><td class="num">${r.year.size}</td><td class="num">${r.month.size}</td></tr>`;
    }).join("") +
    `</tbody></table>${rows.length > 10 ? `<p class="more"><button class="lnk" data-more="${lv.lvl}">${showAll ? t("showLess") : t("showAll", rows.length)}</button></p>` : ""}</div>`;
}
function regionCoverageSection(list) {
  if (S.region === "all") return `<p class="prose">${t("regCoverageHint")}</p>`;
  const here = regionObs(list);
  const fullSpecies = new Set(list.map(o => o.s));
  const hereSpecies = new Set(here.map(o => o.s));
  const missing = [...fullSpecies].filter(s => !hereSpecies.has(s)).sort((a, b) => collator.compare(speciesName(SP[a]), speciesName(SP[b])));
  const label = $("f-region").selectedOptions[0] ? $("f-region").selectedOptions[0].text.replace(/\s*\(\d+\)$/, "") : "";
  return `<h2 data-toc="${esc(t("tocRegCoverage"))}">${t("regCoverage", label)}</h2>
    <p class="prose">${t("regCoverageHelp", hereSpecies.size, fullSpecies.size, missing.length)}</p>
    ${missing.length ? `<div class="card" style="max-height:260px;overflow:auto"><div class="chips">${missing.map(s => `<span class="chip">${esc(speciesName(SP[s]))}</span>`).join("")}</div></div>` : `<p class="empty">${t("regCoverageDone")}</p>`}`;
}
function renderRegions() {
  const list = baseObs();
  $("tab-regions").innerHTML = infoText(t("regionsHelp"))
    + topPlacesSection(regionObs(list))
    + regionCoverageSection(list)
    + LEVELS.filter(lv => !S.redact || lv.lvl === "s" || lv.lvl === "c").map(lv => regionTable(lv, list)).join("");
  updateToc();
}
