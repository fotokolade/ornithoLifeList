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
 * @returns {{state: "none"|"in"|"soon30"|"soon180"|"out", daysUntil?: number, kind: "breed"|"occ"|"none", start?: string, end?: string}}
 */
function seasonStatus(bzcStart, bzcEnd, occStart, occEnd) {
  const kind = bzcStart ? "breed" : occStart ? "occ" : "none";
  const start = bzcStart || occStart, end = bzcEnd || occEnd;
  if (!start || !end) return { state: "none", kind };
  const todayDoy = doyOf(TODAY_MD), startDoy = doyOf(start), endDoy = doyOf(end);
  const inRange = startDoy <= endDoy ? (todayDoy >= startDoy && todayDoy <= endDoy) : (todayDoy >= startDoy || todayDoy <= endDoy);
  if (inRange) return { state: "in", kind, start, end };
  let daysUntil = startDoy - todayDoy;
  if (daysUntil < 0) daysUntil += 365;
  const state = daysUntil <= 30 ? "soon30" : daysUntil <= 180 ? "soon180" : "out";
  return { state, daysUntil, kind, start, end };
}
// sort key: species already in season first, then soonest-to-start first, "no data" species last
function seasonSortKey(season) {
  if (season.state === "in") return -1;
  if (season.state === "none") return Infinity;
  return season.daysUntil;
}
function seasonText(season) {
  if (season.state === "none") return "";
  const kind = t(season.kind === "breed" ? "wishSeasonKindBreed" : "wishSeasonKindOcc");
  const when = season.state === "in" ? t("wishSeasonNowUntil", shortMD(season.end))
    : season.state === "soon30" ? t("wishSeasonSoon", season.daysUntil)
    : t("wishSeasonFrom", shortMD(season.start));
  return `${esc(when)}<span class="small">${esc(kind)}</span>`;
}
// Jan-Dec strip with the season window filled in and a tick at today; the window may wrap over New Year
function seasonStrip(season) {
  if (season.state === "none") return "";
  const pos = md => doyOf(md) / 365 * 100;
  const from = pos(season.start), to = pos(season.end) + 100 / 365;
  const seg = (a, b) => `<i style="left:${a.toFixed(2)}%;width:${(b - a).toFixed(2)}%"></i>`;
  const title = `${t(season.kind === "breed" ? "wishSeasonKindBreed" : "wishSeasonKindOcc")}: ${shortMD(season.start)} – ${shortMD(season.end)}`;
  return `<span class="season-strip season-${season.kind}" title="${esc(title)}">${from <= to ? seg(from, to) : seg(0, to) + seg(from, 100)}<b style="left:${pos(TODAY_MD).toFixed(2)}%"></b></span>`;
}
const WISH_GROUPS = [["in", "wishGrpIn"], ["soon30", "wishGrpSoon"], ["later", "wishGrpLater"], ["none", "wishGrpNone"]];
const wishGroup = season => season.state === "soon180" || season.state === "out" ? "later" : season.state;
// sorted by season: already in season first, then soonest to start, rows without season data last in either direction
function wishSortRows(rows) {
  const { k, d } = S.wishSort;
  rows.sort((a, b) => {
    if (k === "name") return d * collator.compare(a.name, b.name);
    const av = seasonSortKey(a.season), bv = seasonSortKey(b.season);
    if (av === Infinity || bv === Infinity) return (av === Infinity ? 1 : 0) - (bv === Infinity ? 1 : 0) || collator.compare(a.name, b.name);
    return d * (av - bv) || collator.compare(a.name, b.name);
  });
}
function wishTh(k, label, cls = "") {
  const s = S.wishSort;
  return `<th class="sortable ${cls}${s.k === k ? " sorted" : ""}" data-k="${k}">${label}${s.k === k ? (s.d > 0 ? " ▲" : " ▼") : ""}</th>`;
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
  const row = r => {
    const name = S.lang === "en" && r.english ? r.english : r.name;
    const sub = S.lang === "en" && r.english ? `${r.name}${r.latin ? " · " + r.latin : ""}` : r.latin;
    return `<tr><td>${esc(name)}${sub ? `<span class="latin">${esc(sub)}</span>` : ""}</td>
      <td class="strip-cell">${seasonStrip(r.season)}</td><td>${seasonText(r.season)}</td></tr>`;
  };
  let body;
  if (S.wishSort.k === "season") {
    // grouped by how soon the season starts; the group order follows the sort direction
    const groups = S.wishSort.d > 0 ? WISH_GROUPS : [...WISH_GROUPS.slice(0, 3).reverse(), WISH_GROUPS[3]];
    body = groups.map(([g, label]) => {
      const inGroup = rows.filter(r => wishGroup(r.season) === g);
      return inGroup.length ? `<tr class="grp"><td colspan="3">${t(label)}<small>${inGroup.length}</small></td></tr>` + inGroup.map(row).join("") : "";
    }).join("");
  } else {
    body = rows.map(row).join("");
  }
  const monthHead = `<span class="season-months">${T.monthsShort.map(m => `<span>${esc(m.replace(".", "").slice(0, 1))}</span>`).join("")}</span>`;
  const resultTable = rows.length
    ? `<div class="legend season-legend"><span class="season-key season-breed"></span>${t("wishSeasonKindBreed")}<span class="season-key season-occ"></span>${t("wishSeasonKindOcc")}<span class="season-key season-today"></span>${t("wishToday")}</div>
      <div class="card"><table class="wtable"><thead><tr>${wishTh("name", t("name"))}${wishTh("season", monthHead, "strip-cell")}<th></th></tr></thead><tbody>${body}</tbody></table></div>`
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
