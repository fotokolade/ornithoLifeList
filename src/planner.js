/* ---------- holiday planner ---------- */
// Where and when the species still missing from the life list are most likely to be seen, from GBIF:
// per region and month a species' share of all bird records there (its "reporting share"), stored as
// steps 0-9 on a log scale by tools/fetch_gbif_planner.py (data/gbif_planner_<scope>.json). Two views:
// destinations ranked by how many missing species have a good chance there, and the missing species
// with their best destinations. A month narrows both to that month.
/**
 * @typedef {Object} PlanSpecies
 * @property {string} latin
 * @property {string|null} alias - the ornitho.de name where GBIF's differs
 * @property {string|null} de
 * @property {string|null} en
 * @property {Map<number, number[]>} cells - region index -> 12 steps (January to December)
 * @property {boolean} widespread - possible (or better) in every state or country: no destination needed
 */
/** @typedef {{meta: any, regions: {id: string, name: string, parent: string, country: string}[], totals: number[][], species: PlanSpecies[], oneParent: boolean}} PlanData */
const PLAN_SCOPES = ["de", "eu"].filter(k => RAW.planner && RAW.planner[k]);
/** @type {Object<string, PlanData>} */
const PLAN_CACHE = {};
// a step from here on is a good chance (at least 1 % of all bird records), from PLAN_MAYBE on a possible one (0.2 %)
const PLAN_GOOD = 6, PLAN_MAYBE = 4;
const PLAN_ROWS = 20;
// Names where GBIF's differ from ornitho.de's, or GBIF has no German one; `alias` is ornitho's Latin name,
// so a species on the life list under that name counts as seen. GBIF records Germany's feral pigeons,
// chickens and Muscovy ducks under the wild species.
const PLAN_NAMES = {
  "Columba livia": { de: "Straßentaube (Haustaube)", en: "Feral Pigeon", alias: "Columba livia f. domestica" },
  "Gallus gallus": { de: "Haushuhn (Bankivahuhn)", en: "Domestic Chicken" },
  "Cairina moschata": { de: "Warzenente (Moschusente)", en: "Muscovy Duck", alias: "Cairina moschata f. domestica" },
  "Anser cygnoides": { de: "Höckergans (Schwanengans)", en: "Swan Goose" },
  "Serinus canaria": { de: "Kanarienvogel (Kanarengirlitz)", en: "Atlantic Canary" },
  "Phylloscopus tristis": { de: "Taigazilpzalp", en: "Siberian Chiffchaff", alias: "Phylloscopus collybita tristis" },
  "Curruca iberiae": { alias: "Sylvia iberiae" },
};
// GBIF entries that are other species under an old or wrong name, already in the data under the right one:
// Schwarzkehlchen (Saxicola rubicola), Weidenmeise (Poecile montanus), Silberreiher (Ardea alba)
const PLAN_SKIP = new Set(["Saxicola torquatus", "Parus montanus", "Ardea modesta"]);
/** @returns {PlanData} */
function planData(scope) {
  if (!PLAN_CACHE[scope]) {
    const raw = RAW.planner[scope];
    // the federal states all lie in "Germany": no need to say so under every one
    const oneParent = raw.regions.every(r => r.parent === raw.regions[0].parent);
    PLAN_CACHE[scope] = { meta: raw.meta, regions: raw.regions, totals: raw.totals, oneParent,
      species: raw.species.filter(s => !PLAN_SKIP.has(s.latin)).map(s => ({ latin: s.latin, alias: s.alias, de: s.de, en: s.en, ...PLAN_NAMES[s.latin],
        cells: new Map(Object.entries(s.cells).map(([r, v]) => [+r, [...v].map(Number)])), widespread: false })) };
    // a species possible in every state (country) is possible almost anywhere: which districts the data
    // happen to favour says more about who reports it than about where it lives
    const parents = new Set(raw.regions.map(r => r.parent));
    for (const sp of PLAN_CACHE[scope].species) {
      const where = new Set([...sp.cells].filter(([, cells]) => Math.max(...cells) >= PLAN_MAYBE).map(([r]) => raw.regions[r].parent));
      sp.widespread = parents.size > 1 && where.size === parents.size;
    }
  }
  return PLAN_CACHE[scope];
}
const planName = sp => (S.lang === "en" ? sp.en || sp.de : sp.de || sp.en) || sp.latin;
// what the life list has seen, by Latin binomial and by German/English name: worked out once per render of the
// tab (plannerSection), not again on every search keystroke or click that only redraws the planner's output
/** @type {{seenLatin: Set<string>, seenName: Set<string>}|null} */
let PLAN_SEEN = null;
function planSeen() {
  const stats = speciesStats(baseObs());
  const binomial = latin => latin.split(" ").slice(0, 2).join(" ");
  PLAN_SEEN = { seenLatin: new Set([...stats.keys()].map(s => binomial(SP[s].latin))),
    seenName: new Set([...stats.keys()].flatMap(s => [SP[s].name, SP[s].english].filter(Boolean).map(n => n.toLowerCase()))) };
  return PLAN_SEEN;
}
/** the missing species: never seen (by Latin name, the ornitho.de alias or a German/English name); with the
 *  wishlist source "own" only the ones on the own wishlist @param {PlanData} data */
function planMissing(data) {
  const { seenLatin, seenName } = PLAN_SEEN || planSeen();
  const known = sp => [sp.latin, sp.alias].some(l => l && seenLatin.has(l)) || [sp.de, sp.en].some(n => n && seenName.has(n.toLowerCase()));
  let list = data.species.filter(sp => !known(sp));
  if (S.targetSrc === "rare") {
    const rare = new Set(RARE_SPECIES.map(e => e.latin).filter(l => !rareIsRegular(l)));
    list = list.filter(sp => rare.has(sp.latin) || (sp.alias && rare.has(sp.alias)));
  }
  if (S.targetSrc === "own") {
    const own = new Set(S.customTargets.flatMap(x => [x.latin, x.name]).filter(Boolean).map(v => v.toLowerCase()));
    list = list.filter(sp => [sp.latin, sp.alias, sp.de, sp.en].some(v => v && own.has(v.toLowerCase())));
  }
  return list;
}
// a species' step in a region: in the chosen month, or its best month
const planLevel = (cells, month) => month ? cells[month - 1] : Math.max(...cells);
function planPct(level, meta) {
  const v = meta.levels[level - 1] * 100;
  return v.toLocaleString(S.lang === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: 2 });
}
const planChance = l => t(l >= PLAN_GOOD ? "planGood" : l >= PLAN_MAYBE ? "planMaybe" : "planRare");
function planLevelText(l, meta) {
  return l ? `${planChance(l)} (${t("planShare", planPct(l, meta))})` : t("planNone");
}
// the months around a species' best one: "Mai–Aug", "Dez–Feb", "ganzjährig"
function planMonths(cells) {
  const best = Math.max(...cells);
  if (!best) return "";
  const from = Math.min(best, Math.max(PLAN_MAYBE, best - 1));
  const on = cells.map(v => v >= from);
  if (on.every(Boolean)) return t("planAllYear");
  const mName = m => T.monthsShort[m].replace(".", "");
  const runs = [];
  for (let m = 0; m < 12; m++) {
    if (!on[m] || on[(m + 11) % 12]) continue;  // a run starts where the month before is off
    let e = m;
    while (on[(e + 1) % 12]) e = (e + 1) % 12;
    runs.push(e === m ? mName(m) : `${mName(m)}–${mName(e)}`);
  }
  return runs.join(", ");
}
// 12 small cells, one per month; `tip(m)` names what cell m shows
function planStrip(values, frac, tip) {
  return `<span class="plan-strip">${values.map((v, m) =>
    `<i${v ? ` style="background:${heatColor(frac(v))}"` : ""}${m === S.plan.month - 1 ? ' class="now"' : ""} data-tip="${esc(`${T.months[m]}: ${tip(m)}`)}"></i>`).join("")}</span>`;
}
function planRegionName(data, r, parent = !data.oneParent) {
  const reg = data.regions[r], total = data.totals[r].reduce((a, b) => a + b, 0);
  return `<span title="${esc(t("planRecords", fmtN(total)))}">${esc(reg.name)}</span>${reg.parent && parent ? `<span class="small">${esc(reg.parent)}</span>` : ""}`;
}
function planDestinations(data, missing) {
  const month = S.plan.month, R = data.regions.length;
  const rows = Array.from({ length: R }, (_, r) => ({ r, good: 0, maybe: 0, perMonth: Array(12).fill(0), sp: [] }));
  for (const sp of missing.filter(x => !x.widespread)) {
    for (const [r, cells] of sp.cells) {
      const row = rows[r], l = planLevel(cells, month);
      if (l >= PLAN_GOOD) row.good++; else if (l >= PLAN_MAYBE) row.maybe++;
      if (l >= PLAN_MAYBE) row.sp.push({ sp, l, cells });
      cells.forEach((v, m) => { if (v >= PLAN_MAYBE) row.perMonth[m]++; });
    }
  }
  return rows.filter(x => x.good + x.maybe);  // sorted by the caller (planSortRows)
}
const planByName = (a, b) => collator.compare(a, b);
// the rows of some destinations (districts, provinces), each opening its missing species; `sub` indents them under their state
function planRegionRows(data, rows, maxGood, maxMonth, sub = false) {
  return rows.map((x, i) => {
    const open = S.plan.open === data.regions[x.r].id;
    const head = `<tr class="row${open ? " open" : ""}${sub ? " plan-sub" : ""}" data-plan-r="${esc(data.regions[x.r].id)}" tabindex="0" aria-expanded="${open}">
      <td class="nr">${i + 1}</td><td>${planRegionName(data, x.r, !sub)}</td>
      <td class="plan-bar"><span class="bar"><i style="width:${x.good / maxGood * 100}%"></i></span></td>
      <td class="num">${x.good}</td><td class="num">${x.maybe}</td>
      <td class="strip-cell hide-sm">${planStrip(x.perMonth, v => v / maxMonth, m => t("planMonthSpecies", x.perMonth[m]))}</td></tr>`;
    if (!open) return head;
    const sps = x.sp.sort((a, b) => b.l - a.l || collator.compare(planName(a.sp), planName(b.sp)));
    return head + `<tr class="detail"><td colspan="6"><table class="plan-sp"><tbody>${sps.map(({ sp, l, cells }) =>
      `<tr><td>${esc(planName(sp))}<span class="latin">${esc(sp.latin)}</span></td><td><span class="small">${esc(planChance(l))}<br>${esc(planMonths(cells))}</span></td>
        <td class="strip-cell">${planStrip(cells, v => v / 9, m => planLevelText(cells[m], data.meta))}</td></tr>`).join("")}</tbody></table></td></tr>`;
  }).join("");
}
/**
 * The states (or countries) with the missing species that have a chance in any of their districts, each
 * counted once: with its best chance there, and shown at its best district (over the year the one where it
 * shows up most reliably, the sum over the months; for one month that month's best).
 */
function planGroups(data, missing) {
  const month = S.plan.month, groups = new Map();
  const better = (x, y) => month ? x.l > y.l || (x.l === y.l && x.sum > y.sum) : x.sum > y.sum || (x.sum === y.sum && x.l > y.l);
  for (const sp of missing.filter(x => !x.widespread)) {
    for (const [r, cells] of sp.cells) {
      const name = data.regions[r].parent;
      let g = groups.get(name);
      if (!g) { g = { name, sp: new Map(), months: Array.from({ length: 12 }, () => new Set()) }; groups.set(name, g); }
      cells.forEach((v, m) => { if (v >= PLAN_MAYBE) g.months[m].add(sp); });
      const here = { r, cells, l: planLevel(cells, month), sum: cells.reduce((a, v) => a + v, 0) };
      if (here.l < PLAN_MAYBE) continue;
      const cur = g.sp.get(sp);
      if (!cur) g.sp.set(sp, { sp, l: here.l, best: here });
      else { cur.l = Math.max(cur.l, here.l); if (better(here, cur.best)) cur.best = here; }
    }
  }
  return [...groups.values()].map(g => {
    const sps = [...g.sp.values()];
    return { name: g.name, sps, good: sps.filter(x => x.l >= PLAN_GOOD).length, maybe: sps.filter(x => x.l < PLAN_GOOD).length, perMonth: g.months.map(x => x.size) };
  }).filter(g => g.sps.length);
}
const planSortRows = (rows, name) => rows.sort((a, b) => S.plan.sort === "name" ? planByName(name(a), name(b))
  : b.good - a.good || b.maybe - a.maybe || planByName(name(a), name(b)));
function planDestHtml(data, missing) {
  const q = S.plan.q.trim().toLowerCase();
  let rows = planDestinations(data, missing);
  if (q) rows = rows.filter(x => [data.regions[x.r].name, data.regions[x.r].parent].some(v => v.toLowerCase().includes(q)));
  if (!rows.length) return `<p class="empty">${t("planNoDest")}</p>`;
  planSortRows(rows, x => data.regions[x.r].name);
  // districts and provinces under their state or country; a search lists the matching ones plainly
  if (!data.oneParent && !q) return planGroupedHtml(data, missing, rows);
  const maxGood = Math.max(1, ...rows.map(x => x.good)), maxMonth = Math.max(1, ...rows.flatMap(x => x.perMonth));
  const shown = S.plan.all || q ? rows : rows.slice(0, PLAN_ROWS);
  const body = planRegionRows(data, shown, maxGood, maxMonth);
  return `<div class="card"><table class="plan-t">${planHead(t("planDest"))}<tbody>${body}</tbody></table>
    ${rows.length > PLAN_ROWS && !q ? `<p class="more"><button class="lnk" data-plan-more>${S.plan.all ? t("showLess") : t("showAll", rows.length)}</button></p>` : ""}</div>`;
}
const planHead = first => `<thead><tr><th class="nr">#</th><th>${first}</th><th></th>
  <th class="num" title="${esc(t("planGoodHelp"))}">${t("planGoodCol")}</th><th class="num" title="${esc(t("planMaybeHelp"))}">${t("planMaybeCol")}</th>
  <th class="strip-cell hide-sm">${t("planMonthsCol")}</th></tr></thead>`;
function planGroupedHtml(data, missing, regionRows) {
  const groups = planSortRows(planGroups(data, missing), g => g.name);
  const maxGood = Math.max(1, ...groups.map(g => g.good)), maxMonth = Math.max(1, ...groups.flatMap(g => g.perMonth));
  const shown = S.plan.all ? groups : groups.slice(0, PLAN_ROWS);
  const body = shown.map((g, i) => {
    const open = S.plan.openG === g.name;
    const head = `<tr class="row plan-grp${open ? " open" : ""}" data-plan-g="${esc(g.name)}" tabindex="0" aria-expanded="${open}">
      <td class="nr">${i + 1}</td><td><b>${open ? "▾" : "▸"} ${esc(g.name)}</b></td>
      <td class="plan-bar"><span class="bar"><i style="width:${g.good / maxGood * 100}%"></i></span></td>
      <td class="num">${g.good}</td><td class="num">${g.maybe}</td>
      <td class="strip-cell hide-sm">${planStrip(g.perMonth, v => v / maxMonth, m => t("planMonthSpecies", g.perMonth[m]))}</td></tr>`;
    if (!open) return head;
    const gv = S.plan.gview;
    // two clear buttons, not a line of links that reads like a divider
    const areas = t(S.plan.scope === "eu" ? "planGroupProvinces" : "planGroupDistricts", g.name);
    const tabs = `<tr class="plan-sub-tabs"><td></td><td colspan="5"><span class="plan-switch" role="group">
      <button type="button" class="pill${gv === "d" ? " on" : ""}" data-plan-gv="d" aria-pressed="${gv === "d"}">${esc(areas)}</button>
      <button type="button" class="pill${gv === "sp" ? " on" : ""}" data-plan-gv="sp" aria-pressed="${gv === "sp"}">${esc(t("planGroupSpecies", g.name, g.sps.length))}</button></span></td></tr>`;
    if (gv === "sp") {
      const sps = g.sps.sort((a, b) => b.l - a.l || b.best.sum - a.best.sum || planByName(planName(a.sp), planName(b.sp)));
      return head + tabs + `<tr class="detail"><td colspan="6"><table class="plan-sp"><tbody>${sps.map(({ sp, l, best: { cells, r } }) =>
        `<tr><td>${esc(planName(sp))}<span class="latin">${esc(sp.latin)}</span></td><td><span class="small">${esc(planChance(l))}</span></td>
          <td>${esc(data.regions[r].name)} <span class="small-inline">${esc(planMonths(cells))}</span></td>
          <td class="strip-cell">${planStrip(cells, v => v / 9, m => `${data.regions[r].name}, ${planLevelText(cells[m], data.meta)}`)}</td></tr>`).join("")}</tbody></table></td></tr>`;
    }
    const inGroup = regionRows.filter(x => data.regions[x.r].parent === g.name);
    const maxG = Math.max(1, ...inGroup.map(x => x.good)), maxM = Math.max(1, ...inGroup.flatMap(x => x.perMonth));
    const more = inGroup.length > PLAN_ROWS ? `<tr class="plan-sub-tabs"><td></td><td colspan="5"><button type="button" class="lnk" data-plan-gall>${S.plan.gall ? t("showLess") : t("showAll", inGroup.length)}</button></td></tr>` : "";
    return head + tabs + planRegionRows(data, S.plan.gall ? inGroup : inGroup.slice(0, PLAN_ROWS), maxG, maxM, true) + more;
  }).join("");
  return `<div class="card"><table class="plan-t">${planHead(t(S.plan.scope === "eu" ? "planCountry" : "planState"))}<tbody>${body}</tbody></table>
    ${groups.length > PLAN_ROWS ? `<p class="more"><button class="lnk" data-plan-more>${S.plan.all ? t("showLess") : t("showAll", groups.length)}</button></p>` : ""}</div>`;
}
function planSpeciesHtml(data, missing) {
  const month = S.plan.month, q = S.plan.q.trim().toLowerCase();
  let rows = missing.map(sp => {
    // over the whole year the regions where it shows up reliably through a season come first (the sum over
    // the months), not the ones with a single strong month; for one month that month's step decides
    const best = [...sp.cells].map(([r, cells]) => ({ r, cells, l: planLevel(cells, month), sum: cells.reduce((a, v) => a + v, 0) }))
      .filter(x => x.l).sort((a, b) => (month ? b.l - a.l : 0) || b.sum - a.sum || b.l - a.l);
    return { sp, best, l: best.length ? best[0].l : 0, sum: best.length ? best[0].sum : 0 };
  }).filter(x => x.l);
  if (q) rows = rows.filter(x => [x.sp.de, x.sp.en, x.sp.latin, x.sp.alias].some(v => v && v.toLowerCase().includes(q)));
  if (!rows.length) return `<p class="empty">${t("planNoSpecies")}</p>`;
  // the widespread ones last: for them the months matter, not the place
  rows.sort((a, b) => Number(a.sp.widespread) - Number(b.sp.widespread) || b.l - a.l || b.sum - a.sum || collator.compare(planName(a.sp), planName(b.sp)));
  const shown = S.plan.all || q ? rows : rows.slice(0, PLAN_ROWS);
  const body = shown.map(x => {
    if (x.sp.widespread) {
      // per month: in how many of its districts it is possible
      const perMonth = Array.from({ length: 12 }, (_, m) => [...x.sp.cells.values()].filter(c => c[m] >= PLAN_MAYBE).length);
      const most = Math.max(1, ...perMonth);
      return `<tr class="plan-wide"><td>${esc(planName(x.sp))}<span class="latin">${esc(x.sp.latin)}</span></td><td><span class="small">${t("planWide")}</span></td>
        <td><span class="small-inline">${t(S.plan.scope === "eu" ? "planWideWhereEu" : "planWideWhere")}</span></td>
        <td class="strip-cell hide-sm">${planStrip(perMonth, v => v / most, m => t("planWideMonth", perMonth[m]))}</td></tr>`;
    }
    const top = x.best[0];
    const where = x.best.slice(0, 3).map(b => `${esc(data.regions[b.r].name)} <span class="small-inline">${esc(planMonths(b.cells))}</span>`).join("<br>");
    return `<tr><td>${esc(planName(x.sp))}<span class="latin">${esc(x.sp.latin)}</span></td><td><span class="small">${esc(planChance(x.l))}</span></td>
      <td>${where}</td><td class="strip-cell hide-sm">${planStrip(top.cells, v => v / 9, m => `${data.regions[top.r].name}, ${planLevelText(top.cells[m], data.meta)}`)}</td></tr>`;
  }).join("");
  return `<div class="card"><table class="plan-t"><thead><tr><th>${t("name")}</th><th>${t("planChanceCol")}</th><th>${t("planBestDest")}</th>
      <th class="strip-cell hide-sm">${t("planBestFirst")}</th></tr></thead><tbody>${body}</tbody></table>
    ${rows.length > PLAN_ROWS && !q ? `<p class="more"><button class="lnk" data-plan-more>${S.plan.all ? t("showLess") : t("showAll", rows.length)}</button></p>` : ""}</div>`;
}
// the part below the controls: redrawn alone on a search, a click on a destination or "show all", so the search field keeps its focus
function planOutHtml() {
  const data = planData(S.plan.scope), missing = planMissing(data);
  const wide = missing.filter(sp => sp.widespread).length;
  const summary = `<p class="sub">${t("planSummary", fmtN(missing.length))}${wide ? ` · ${t("planWideSummary", fmtN(wide))}` : ""}</p>`;
  return summary + (S.plan.view === "sp" ? planSpeciesHtml(data, missing) : planDestHtml(data, missing));
}
function plannerSection() {
  if (!PLAN_SCOPES.length) return "";
  planSeen();  // the tab is drawn anew: the life list or its filters may have changed
  if (!PLAN_SCOPES.includes(S.plan.scope)) S.plan.scope = PLAN_SCOPES.includes("de") ? "de" : PLAN_SCOPES[0];
  const meta = planData(S.plan.scope).meta;
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  return `<h2 data-toc="${esc(t("tocPlan"))}">${t("planTitle")}</h2>
    ${infoText(`${t("planHelp")}<br><br>${t("planSource", esc(meta.fetched), meta.years[0], meta.years[1])} ${esc(meta.citation)}`)}
    <div class="pick">
      <select id="plan-scope" aria-label="${esc(t("planScope"))}">${PLAN_SCOPES.map(k => opt(k, t("planScope_" + k), S.plan.scope)).join("")}</select>
      <select id="plan-month" aria-label="${esc(t("planMonth"))}">${opt("0", t("planYear"), String(S.plan.month))}${T.months.map((m, i) => opt(String(i + 1), m, String(S.plan.month))).join("")}</select>
      <select id="plan-view" aria-label="${esc(t("planView"))}">${opt("dest", t("planViewDest"), S.plan.view)}${opt("sp", t("planViewSp"), S.plan.view)}</select>
      ${S.plan.view === "dest" ? `<select id="plan-sort" aria-label="${esc(t("planSort"))}">${opt("n", t("planSortCount"), S.plan.sort)}${opt("name", t("planSortName"), S.plan.sort)}</select>` : ""}
      <input type="search" id="plan-q" placeholder="${esc(t(S.plan.view === "sp" ? "wishFilterPh" : "planFilterPh"))}" autocomplete="off" value="${esc(S.plan.q)}">
    </div>
    <div id="plan-out">${planOutHtml()}</div>`;
}
function redrawPlanner() {
  const box = $("plan-out");
  if (box) box.innerHTML = planOutHtml();
}
