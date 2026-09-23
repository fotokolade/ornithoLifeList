function loadCustomTargets() {
  try {
    const data = JSON.parse(localStorage.getItem("lifelist-custom-targets") || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(x => x && typeof x.name === "string" && x.name)
      .map(x => ({ name: x.name, latin: typeof x.latin === "string" ? x.latin : null }));
  } catch (e) { return []; }
}
function saveCustomTargets() {
  try { localStorage.setItem("lifelist-custom-targets", JSON.stringify(S.customTargets)); } catch (e) { /* private mode may refuse */ }
}
// day-of-year on a fixed non-leap reference year, just to compare "MM-DD" strings
const doyOf = md => Math.floor((Date.UTC(2001, +md.slice(0, 2) - 1, +md.slice(3)) - Date.UTC(2001, 0, 1)) / 864e5);
/**
 * Rough season status from a date window. Prefers the official ornitho.de breeding-season window
 * (bzcStart/bzcEnd, for species that breed in Germany/Luxembourg); falls back to a typical
 * occurrence window derived from public GBIF records (occStart/occEnd) for passage migrants and
 * visitors that don't breed here — see species_reference.json / wishSeasonHelp.
 * @param {string|null} bzcStart @param {string|null} bzcEnd
 * @param {string|null} [occStart] @param {string|null} [occEnd]
 * @returns {{state: "none"|"in"|"soon30"|"soon180"|"out", daysUntil?: number, kind: "breed"|"occ"|"none"}}
 */
function seasonStatus(bzcStart, bzcEnd, occStart, occEnd) {
  const kind = bzcStart ? "breed" : occStart ? "occ" : "none";
  const start = bzcStart || occStart, end = bzcEnd || occEnd;
  if (!start || !end) return { state: "none", kind };
  const todayDoy = doyOf(TODAY_MD), startDoy = doyOf(start), endDoy = doyOf(end);
  const inRange = startDoy <= endDoy ? (todayDoy >= startDoy && todayDoy <= endDoy) : (todayDoy >= startDoy || todayDoy <= endDoy);
  if (inRange) return { state: "in", kind };
  let daysUntil = startDoy - todayDoy;
  if (daysUntil < 0) daysUntil += 365;
  if (daysUntil <= 30) return { state: "soon30", daysUntil, kind };
  if (daysUntil <= 180) return { state: "soon180", daysUntil, kind };
  return { state: "out", daysUntil, kind };
}
// sort key: species already in season first, then soonest-to-start first, "no data" species last
function seasonSortKey(season) {
  if (season.state === "in") return -1;
  if (season.state === "none") return Infinity;
  return season.daysUntil;
}
// called only for kind "breed"/"occ" rows, i.e. season.state is never "none" here
function seasonBadge(season) {
  const label = season.state === "in" ? t("wishSeasonIn")
    : season.state === "out" ? t("wishSeasonOut")
    : t("wishSeasonSoon", season.daysUntil);
  return `<span class="season-dot season-${season.state}" title="${esc(label)}"></span><span class="small">${esc(label)}</span>`;
}
// sort value for the Brutzeit/Zug-Gast columns: null (rows without that kind of data) always sorts last, in either direction
function wishColSortValue(row, k) {
  if (k === "name") return null;
  if (k === "season") return seasonSortKey(row.season);
  return row.season.kind === k ? seasonSortKey(row.season) : null;
}
function wishSortRows(rows) {
  const { k, d } = S.wishSort;
  rows.sort((a, b) => {
    if (k === "name") return d * collator.compare(a.name, b.name);
    const av = wishColSortValue(a, k), bv = wishColSortValue(b, k);
    if (av === null && bv === null) return collator.compare(a.name, b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    return d * (av - bv) || collator.compare(a.name, b.name);
  });
}
function wishTh(k, label) {
  const s = S.wishSort;
  return `<th class="sortable${s.k === k ? " sorted" : ""}" data-k="${k}">${label}${s.k === k ? (s.d > 0 ? " ▲" : " ▼") : ""}</th>`;
}
function renderTargets() {
  // deliberately unscoped by S.region: "never seen" means never seen anywhere, not just in the currently filtered region
  const list = baseObs();
  const stats = speciesStats(list);
  const seenLatin = new Set([...stats.keys()].map(s => SP[s].latin));
  const seenName = new Set([...stats.keys()].map(s => SP[s].name.toLowerCase()));
  const src = S.targetSrc;
  const pool = [];
  if (src !== "own") for (const e of EURO_SPECIES) pool.push({ latin: e.latin, name: e.de, english: e.en, season: seasonStatus(e.bzcStart, e.bzcEnd, e.occStart, e.occEnd), src: "euro" });
  if (src !== "euro") for (const x of S.customTargets) pool.push({ latin: x.latin, name: x.name, english: null, season: { state: "none", kind: "none" }, src: "own" });
  const seenKey = new Set(), rows = [];
  let totalDistinct = 0, seenCount = 0;
  for (const p of pool) {
    const key = (p.latin || p.name).toLowerCase();
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    totalDistinct++;
    // match by Latin binomial OR German/English name: guards against taxonomic renames between this list and the export
    if ((p.latin && seenLatin.has(p.latin)) || seenName.has(p.name.toLowerCase()) || (p.english && seenName.has(p.english.toLowerCase()))) { seenCount++; continue; }
    rows.push(p);
  }
  wishSortRows(rows);
  const progressPct = pctDisplay(seenCount, totalDistinct);

  const suggestions = euroSuggestionsHtml();
  const chips = S.customTargets.length
    ? `<div class="chips" style="margin-top:10px">${S.customTargets.map((x, i) =>
        `<span class="chip">${esc(x.name)}${x.latin ? `<i class="latin" style="display:inline;font-style:italic"> ${esc(x.latin)}</i>` : ""}
         <button class="lnk" data-remove="${i}" aria-label="${t("wishRemove")}" style="margin-left:4px">×</button></span>`).join("")}</div>`
    : `<p class="empty">${t("wishEmpty")}</p>`;
  const resultTable = rows.length
    ? `<div class="card"><table><thead><tr>${wishTh("name", t("name"))}${wishTh("breed", t("wishSeasonKindBreed"))}${wishTh("occ", t("wishSeasonKindOcc"))}</tr></thead><tbody>${rows.map(r => {
        const name = S.lang === "en" && r.english ? r.english : r.name;
        const sub = S.lang === "en" && r.english ? `${r.name}${r.latin ? " · " + r.latin : ""}` : r.latin;
        return `<tr><td>${esc(name)}${sub ? `<span class="latin">${esc(sub)}</span>` : ""}</td>
          <td>${r.season.kind === "breed" ? seasonBadge(r.season) : ""}</td>
          <td>${r.season.kind === "occ" ? seasonBadge(r.season) : ""}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : `<p class="empty">${pool.length ? t("wishDone") : t("wishEmpty")}</p>`;

  $("tab-targets").innerHTML = `
    ${infoText(`${t("wishHelp")}<br><br>${t("wishSeasonHelp")}`)}
    <p class="sub">${t("wishProgress", seenCount, totalDistinct, progressPct)}</p>
    <div class="bar" style="max-width:360px;margin-bottom:12px"><i style="width:${progressPct}%;background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 45%,transparent),var(--accent))"></i></div>
    <div class="pick">
      <select id="tgt-src" aria-label="${t("wishSrcCol")}">
        <option value="all">${t("wishSrcAll")}</option>
        <option value="euro">${t("wishSrcEuro")}</option>
        <option value="own">${t("wishSrcOwn")}</option>
      </select>
    </div>
    <h2 data-toc="${esc(t("tocWishManage"))}">${t("wishManage")}</h2>
    ${infoText(t("wishManageHelp"))}
    <div class="card">
      <div class="pick" style="margin:0">
        <input type="search" id="tgt-search" list="tgt-suggest" placeholder="${t("wishSearchPh")}" autocomplete="off">
        <datalist id="tgt-suggest">${suggestions}</datalist>
        <button class="btn" id="tgt-add" type="button">${t("wishAdd")}</button>
      </div>
      ${chips}
    </div>
    <h2>${t("wishTitle")}<small>${rows.length}</small></h2>
    ${resultTable}`;
  $("tgt-src").value = src;
  updateToc();
}
