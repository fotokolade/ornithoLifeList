function atlasBadge(r) {
  if (!r.ac) return "";
  return `<span class="ab ab-${r.ac[0]}" title="${esc(atlasText(r.ac))}">${esc(r.ac)}</span>`;
}
function atlasDesc(code) {
  return T.atlasCodes[code] ?? T.atlasCats[code] ?? "";
}
function atlasText(code) {
  return code + ": " + atlasDesc(code);
}
function renderList() {
  const list = regionObs(baseObs());
  const stats = speciesStats(list);
  // life number by first date (ties broken by taxonomic order)
  const chrono = numberLifers(stats);
  const q = S.q.trim().toLowerCase();
  const af = S.atlasF;
  let rows = chrono.filter(r => (!q || SP[r.s].name.toLowerCase().includes(q) || SP[r.s].latin.toLowerCase().includes(q) || (SP[r.s].english && SP[r.s].english.toLowerCase().includes(q)))
    && (af === "all" || (af === "any" ? r.ac : af === "none" ? !r.ac : r.ac[0] === af)));
  const cmp = {
    nr: (a, b) => a.nr - b.nr,
    first: (a, b) => (a.first.d < b.first.d ? -1 : a.first.d > b.first.d ? 1 : 0) || a.nr - b.nr,
    taxon: (a, b) => SP[a.s].order - SP[b.s].order,
    name: (a, b) => collator.compare(speciesName(SP[a.s]), speciesName(SP[b.s])),
    last: (a, b) => a.last.d < b.last.d ? -1 : a.last.d > b.last.d ? 1 : 0,
    n: (a, b) => a.n - b.n,
    max: (a, b) => a.max - b.max,
    years: (a, b) => a.years.size - b.years.size,
    atlas: (a, b) => a.ar - b.ar,
  }[S.sort];
  rows.sort((a, b) => S.dir * cmp(a, b));
  const th = (key, label, cls = "") => `<th class="sortable ${cls}${S.sort === key ? " sorted" : ""}" data-sort="${key}">${label}${S.sort === key ? (S.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  let h = `<p class="sub" style="margin:4px 4px 6px">${t("hits", rows.length, stats.size)}</p>
    <table><thead><tr>${th("nr", t("nr"))}${th("name", t("name"))}${th("first", t("first"), "hide-sm")}${th("last", t("last"), "hide-sm")}${th("n", t("obsShort"), "num")}${th("max", t("max"), "num hide-sm")}${th("years", t("yearsShort"), "num hide-sm")}${th("atlas", t("colAtlas"))}</tr></thead><tbody>`;
  for (const r of rows) {
    const sp = SP[r.s], open = S.open.has(r.s);
    h += `<tr class="row" data-sp="${r.s}"><td class="nr">${r.nr}</td>
      <td>${esc(speciesName(sp))}${r.first.y === S.year ? `<span class="new-badge">${t("newBadge")}</span>` : ""}<span class="latin">${esc(speciesSub(sp))}</span></td>
      <td class="hide-sm">${fmtD(r.first.d)}<span class="small">${esc(placeName(r.first.p))}</span></td>
      <td class="hide-sm">${fmtD(r.last.d)}</td>
      <td class="num">${r.n}</td><td class="num hide-sm">${r.max || "x"}</td><td class="num hide-sm">${r.years.size}</td><td>${atlasBadge(r)}</td></tr>`;
    if (open) h += `<tr class="detail"><td colspan="8">${detailHtml(r)}</td></tr>`;
  }
  $("q-sort").value = ["nr", "taxon", "name"].includes(S.sort) ? S.sort : "";
  $("list-out").innerHTML = h + `</tbody></table>`;
  $("list-curve").innerHTML = `<h2>${t("curve")}</h2>
    ${infoText(t("curveHelp"))}
    <div class="card">${curveSvg(chrono)}</div>`;
  updateToc();
}
const PHENO_SEASON = ["--k3", "--k3", "--k1", "--k1", "--k1", "--k2", "--k2", "--k2", "--k5", "--k5", "--k5", "--k3"];  // winter/spring/summer/autumn
// shortest contiguous (wrap-around) run of months covering at least 80% of observations
function typicalWindow(months) {
  const total = months.reduce((a, b) => a + b, 0);
  if (!total) return null;
  for (let size = 1; size <= 12; size++) {
    for (let start = 0; start < 12; start++) {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += months[(start + i) % 12];
      if (sum / total >= 0.8) return { start, size };
    }
  }
  return { start: 0, size: 12 };
}
function detailHtml(r) {
  const maxM = Math.max(1, ...r.months);
  const top = [...r.places].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const yrs = [...r.years].sort((a, b) => a[0] - b[0]);
  const win = typicalWindow(r.months);
  const winLabel = win ? (win.size >= 12 ? t("calYearRound")
    : win.size === 1 ? T.months[win.start]
    : t("windowRange", T.months[win.start], T.months[(win.start + win.size - 1) % 12])) : "";
  const gapYears = [];
  for (let y = r.first.y; y <= MAX_Y; y++) if (!r.years.has(y)) gapYears.push(y);
  return `<div class="detailgrid">
    <div><b>${t("detailPheno")}</b>
      <div class="pheno" style="margin-top:8px">${r.months.map((n, i) => `<div style="height:${n / maxM * 100}%;background:linear-gradient(180deg,var(${PHENO_SEASON[i]}),color-mix(in srgb,var(${PHENO_SEASON[i]}) 55%,transparent))" title="${T.months[i]}: ${n}"></div>`).join("")}</div>
      <div class="pheno-l">${T.monthsShort.map(m => `<span>${m[0]}</span>`).join("")}</div>
      <span class="small" style="margin-top:6px">${t("detailWindow")}</span>${winLabel}</div>
    <div><b>${t("detailYears")}</b><div class="chips">${yrs.map(([y, n]) => `<span class="chip">${y} (${n})</span>`).join("")}</div>
      ${gapYears.length ? `<b>${t("detailGapYears")}</b><div class="chips">${gapYears.map(y => `<span class="chip" style="opacity:.55">${y}</span>`).join("")}</div>` : ""}
      ${r.codes.size ? `<b>${t("atlasCodesTitle")}</b><div class="chips">${[...r.codes].sort((a, b) => atlasRank(b[0]) - atlasRank(a[0])).map(([c, n]) => `<span class="chip" title="${esc(atlasText(c))}">${esc(c)} (${n})</span>`).join("")}</div>` : ""}
      <b>${t("detailPlaces")}</b><div class="chips">${top.map(([p, n]) => `<span class="chip">${esc(placeName(p))} (${n})</span>`).join("")}</div></div>
    <div><span class="small">${t("detailFirst")}</span>${fmtD(r.first.d)}, ${esc(placeName(r.first.p))}
      <span class="small" style="margin-top:6px">${t("detailLast")}</span>${fmtD(r.last.d)}, ${esc(placeName(r.last.p))}
      <span class="small" style="margin-top:6px">${t("detailMax")}</span>${r.max || "x"}
      <span class="small" style="margin-top:6px">${t("detailPhotos")}</span>${r.photos}</div></div>`;
}
