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
  const scale = heatScale(max);
  const liferDays = new Set([...statsAll.values()].filter(r => r.first.y === year).map(r => r.first.d));
  const dowLetters = T.weekdays.map(w => w[0]);
  // the year as one continuous run of weeks (a column each, Monday on top): the months flow into each other
  // instead of standing as separate blocks. Every other month is a shade darker (m-odd; the empty days too), and the
  // edge between two months is one stepped line over the grid (an SVG in week/weekday units), not a border per day.
  // The gap between two days belongs to the days (a transparent border), so the pointer is never "between" them.
  // Hovering a day lights up its whole month (app.js).
  const startDow = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7;  // 0 = Monday
  let cells = `<div class="cal-day cal-empty"></div>`.repeat(startDow), idx = startDow;
  const monthLabels = [], edges = [];
  for (let mi = 0; mi < 12; mi++) {
    const m = mi + 1, daysInMonth = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
    monthLabels.push(`<span style="--w:${Math.floor(idx / 7) + 1}">${esc(T.monthsShort[mi].replace(".", ""))}</span>`);
    if (mi) {
      // the 1st sits in column c at weekday r: the month before ends above it (and to its left), so the line runs down
      // the right of column c's first r days, along the top of the 1st, and down the left of the rest of the column
      const c = Math.floor(idx / 7), r = idx % 7;
      edges.push(r ? `M${c + 1} 0V${r}H${c}V7` : `M${c} 0V7`);
    }
    for (let day = 1; day <= daysInMonth; day++, idx++) {
      const dateStr = `${year}-${pad(m)}-${pad(day)}`;
      const sp = dayData.get(dateStr);
      const n = sp ? sp.size : 0;
      const lifer = liferDays.has(dateStr);
      const bg = n ? scale.color(scale.step(n)) : mi % 2 ? "var(--cal-empty-alt)" : "var(--cal-empty)";
      const odd = mi % 2 ? " m-odd" : "";
      const title = n ? `${fmtD(dateStr)}: ${n} ${t("mapSpecies")}${lifer ? " · " + t("newBadge") : ""}` : fmtD(dateStr);
      cells += n
        ? `<button type="button" class="cal-day${lifer ? " cal-lifer" : ""}${S.calDay === dateStr ? " cal-sel" : ""}${odd}" data-day="${dateStr}" data-m="${m}" style="background-color:${bg}" data-tip="${esc(title)}" aria-label="${esc(title)}" aria-pressed="${S.calDay === dateStr}"></button>`
        : `<div class="cal-day${odd}" data-m="${m}" style="background-color:${bg}" data-tip="${esc(title)}"></div>`;
    }
  }
  const weeks = Math.ceil(idx / 7);
  const months = `<div class="cal-scroll"><div class="cal-flow" style="--weeks:${weeks}">
      <div class="cal-months">${monthLabels.join("")}</div>
      <div class="cal-dows">${dowLetters.map(l => `<span>${l}</span>`).join("")}</div>
      <div class="cal-days">${cells}<svg class="cal-edges" viewBox="0 0 ${weeks} 7" preserveAspectRatio="none" aria-hidden="true">${edges.map(d => `<path d="${d}"/>`).join("")}</svg></div></div></div>`;
  return `<h2 data-toc="${esc(t("tocCal"))}">${t("calTitle", year)}</h2>
    ${infoText(t("calHelp"))}
    <div class="card">${months}${dayData.has(S.calDay || "") ? calDayPanel(list, statsAll, S.calDay) : ""}</div>
    ${scale.legend}`;
}
// what was seen on one calendar day, grouped by place; each species opens its row in the life list
function calDayPanel(list, statsAll, day) {
  const byPlace = new Map();
  for (const o of list) {
    if (o.d !== day) continue;
    if (!byPlace.has(o.p)) byPlace.set(o.p, new Set());
    byPlace.get(o.p).add(o.s);
  }
  const all = new Set([...byPlace.values()].flatMap(sp => [...sp]));
  const lifers = [...all].filter(s => statsAll.get(s)?.first.d === day).length;
  const places = [...byPlace].sort((a, b) => b[1].size - a[1].size).map(([p, sp]) =>
    `<div class="cal-place"><b>${esc(placeName(p))}</b><div class="chips">${[...sp].sort((a, b) => SP[a].order - SP[b].order).map(s =>
      speciesChip(s, "", statsAll.get(s)?.first.d === day)).join("")}</div></div>`).join("");
  return cellPanel(fmtD(day), t("calDaySummary", all.size, byPlace.size) + (lifers ? " · " + t("calDayLifers", lifers) : ""), `data-day="${day}"`, places);
}
// The key figures of every year (MIN_Y..MAX_Y); `md` cuts each year at that day, e.g. today's, to set the
// running year against the same part of the year before.
/** @param {Observation[]} list @param {Map<number, {first: Observation}>} stats @param {string} [md] */
function yearFigures(list, stats, md = "12-31") {
  const per = new Map();
  for (let y = MIN_Y; y <= MAX_Y; y++) per.set(y, { y, obs: 0, days: new Set(), places: new Set(), species: new Set(), lifers: 0 });
  for (const o of list) {
    if (o.md > md) continue;
    const r = per.get(o.y);
    r.obs++; r.days.add(o.d); r.places.add(o.p); r.species.add(o.s);
  }
  for (const st of stats.values()) if (st.first.md <= md) per.get(st.first.y).lifers++;
  return [...per.values()].map(r => ({ y: r.y, obs: r.obs, days: r.days.size, places: r.places.size, species: r.species.size, lifers: r.lifers }));
}
// The tiles on top of the overview: everything since the start in large, and under it the chosen year against the
// year before (an arrow and the difference, so it reads without the colour), with all the years as small bars.
/** @param {Observation[]} list @param {Map<number, {first: Observation}>} stats @param {number} new30 */
/** @param {Map<number, {first: Observation, s: number}>} stats */
const latestLifer = stats => [...stats.values()].reduce((a, b) => b.first.d > a.first.d ? b : a);
// the life species from which each level starts (T.levels), and which of the four ranks (T.tiers) it belongs to
const LEVEL_FROM = [0, 25, 50, 100, 150, 200, 250, 300];
const LEVEL_TIER = [0, 0, 1, 1, 2, 2, 2, 3];
/** @param {number} n life species @returns {number} the level reached, 0-based */
const birderLevel = n => LEVEL_FROM.filter(f => n >= f).length - 1;
// the birder's level: name and line, the rank, how far to the next level, and the way through all of them
/** @param {number} n life species */
function levelCard(n) {
  const lv = birderLevel(n), last = LEVEL_FROM.length - 1;
  const [name, line] = T.levels[lv];
  const next = lv < last ? t("levelNext", fmtN(LEVEL_FROM[lv + 1] - n), T.levels[lv + 1][0]) : t("levelTop");
  const segs = LEVEL_FROM.map((from, i) => {
    const to = i < last ? LEVEL_FROM[i + 1] : from;
    const fill = n >= to && i < last ? 100 : i === lv ? (i < last ? (n - from) / (to - from) * 100 : 100) : 0;
    const tip = esc(t("levelTip", i + 1, T.levels[i][0], fmtN(from)));
    return `<span class="lv-seg${i === lv ? " cur" : ""}" data-tip="${tip}" aria-label="${tip}"><i style="width:${fill.toFixed(1)}%"></i></span>`;
  }).join("");
  const tiers = T.tiers.map((tier, k) => `<span class="${LEVEL_TIER[lv] === k ? "cur" : ""}" style="grid-column:span ${LEVEL_TIER.filter(x => x === k).length}">${esc(tier)}</span>`).join("");
  return `<div class="level t-species" data-level="${lv + 1}">
      <div class="level-head"><div><div class="stat-lbl"><i></i>${t("levelTitle")}</div>
        <b>${esc(name)}</b><div class="stat-sub">${esc(line)}</div></div>
        <div class="level-rank"><span class="tag">${esc(T.tiers[LEVEL_TIER[lv]])}</span><div class="stat-sub">${t("levelOf", lv + 1, last + 1, next)}</div></div></div>
      <div class="lv-bar" role="img" aria-label="${esc(t("levelOf", lv + 1, last + 1, next))}">${segs}</div>
      <div class="lv-tiers">${tiers}</div>
    </div>`;
}
function overviewTiles(list, stats, new30) {
  const full = yearFigures(list, stats);
  // the running year has only got to today: compare it with the year before up to the same day
  const running = S.year === TODAY_Y;
  const cmp = running ? yearFigures(list, stats, TODAY_MD) : full;
  const cur = cmp.find(r => r.y === S.year), before = cmp.find(r => r.y === S.year - 1);
  const vs = before ? running ? t("kpiVsUntil", before.y, shortMD(TODAY_MD)) : t("kpiVs", before.y) : "";
  // "2025: 2.179", under it "▲ +45 vs 2024"; without `value` only the comparison (for a tile whose large number is the year's)
  /** @param {"obs"|"days"|"places"|"species"|"lifers"} k @param {string} [sign] @param {boolean} [value] */
  const yearLine = (k, sign = "", value = true) => {
    if (!cur) return "";
    const a = cur[k], others = full.filter(r => r.y !== S.year && r[k]);
    const record = others.length && a > Math.max(...others.map(r => r[k])) ? ` <span class="tag">${t("kpiRecord")}</span>` : "";
    const head = value ? `<div>${S.year}: ${sign}${fmtN(a)}${before ? "" : record}</div>` : "";
    if (!before) return head || record;
    const dv = a - before[k];
    const delta = dv > 0 ? `<span class="delta up">▲ +${fmtN(dv)}</span>` : dv < 0 ? `<span class="delta down">▼ −${fmtN(-dv)}</span>` : `<span class="delta">±0</span>`;
    return `${head}<div>${delta} ${vs}${record}</div>`;
  };
  /** @param {"obs"|"days"|"places"|"lifers"} k @param {string} [sign] */
  const spark = (k, sign = "") => {
    const max = Math.max(1, ...full.map(r => r[k]));
    return `<svg class="spark" viewBox="0 0 ${full.length * 10} 28" preserveAspectRatio="none" aria-hidden="true">${full.map((r, i) => {
      const h = Math.max(r[k] ? 2 : 0, r[k] / max * 28), op = r.y === S.year ? 1 : r.y === S.year - 1 ? .55 : .3;
      return `<rect x="${i * 10 + 1.5}" y="${28 - h}" width="7" height="${h}" opacity="${op}"><title>${r.y}: ${sign}${fmtN(r[k])}</title></rect>`;
    }).join("")}</svg>`;
  };
  /** @param {string} theme @param {string} label @param {string} value @param {string} sub @param {string} [extra] */
  const tile = (theme, label, value, sub, extra = "") =>
    `<div class="stat t-${theme}"><div class="stat-lbl"><i></i>${label}</div><b>${value}</b><div class="stat-sub">${sub}</div>${extra}</div>`;
  const photos = list.filter(o => o.ph).length, photoPct = pctDisplay(photos, list.length);
  const daySp = new Map();
  for (const o of list) if (o.y === S.year) { if (!daySp.has(o.d)) daySp.set(o.d, new Set()); daySp.get(o.d).add(o.s); }
  let bestDay = "", bestCount = 0;
  for (const [d, sp] of daySp) if (sp.size > bestCount) { bestCount = sp.size; bestDay = d; }
  return `<div class="kpis k4 stats">
      ${tile("species", t("speciesLife"), fmtN(stats.size), yearLine("lifers", "+"), spark("lifers", "+"))}
      ${tile("activity", t("observations"), fmtN(list.length), yearLine("obs"), spark("obs"))}
      ${tile("activity", t("days"), fmtN(new Set(list.map(o => o.d)).size), yearLine("days"), spark("days"))}
      ${tile("places", t("places"), fmtN(new Set(list.map(o => o.p)).size), yearLine("places"), spark("places"))}
    </div>
    <div class="kpis stats minor">
      ${cur ? tile("species", t("speciesInYear", S.year), fmtN(cur.species), yearLine("species", "", false)) : ""}
      ${new30 ? tile("species", t("newLast30"), `+${fmtN(new30)}`, t("curveLast", esc(speciesName(SP[latestLifer(stats).s])))) : ""}
      ${tile("photos", t("photoShare"), `${photoPct}%`, t("photoOf", fmtN(photos), fmtN(list.length)), `<div class="meter"><i style="width:${photoPct}%"></i></div>`)}
      ${bestCount ? tile("activity", t("bestDay", S.year), `${fmtN(bestCount)} <small>${t(bestCount === 1 ? "speciesWordOne" : "speciesWord")}</small>`,
        `${fmtD(bestDay)}<span class="to-cal"> · <button type="button" class="linkbtn" data-show-day="${bestDay}">${t("showInCal")}</button></span>`) : ""}
    </div>
    ${infoText(t("kpiHelp"))}
    ${levelCard(stats.size)}
    ${infoText(t("levelHelp"))}`;
}
function renderOverview() {
  const list = regionObs(baseObs());
  if (!list.length) { $("tab-overview").innerHTML = `<p class="empty">${t("noData")}</p>`; updateToc(); return; }
  const stats = speciesStats(list);
  const days = new Set(list.map(o => o.d)).size, places = new Set(list.map(o => o.p)).size;
  const rows = yearRows(list, stats);
  const c30 = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 30);  // local dates, like the export
  const cutoff = c30.getFullYear() + "-" + pad(c30.getMonth() + 1) + "-" + pad(c30.getDate());
  const new30 = [...stats.values()].filter(r => r.first.d >= cutoff).length;
  const first = list[0].d, last = list[list.length - 1].d;
  const chrono = numberLifers(stats);
  const latest = chrono.slice(-10).reverse();
  const monthLabel = T.months[S.month - 1];
  const years = Array.from({ length: MAX_Y - MIN_Y + 1 }, (_, i) => String(MAX_Y - i));
  $("tab-overview").innerHTML = `
    ${overviewTiles(list, stats, new30)}
    <p class="sub" style="margin-top:8px">${t("period")}: ${fmtD(first)} ${t("to")} ${fmtD(last)}</p>
    ${calendarSection(list, stats)}
    <h2>${t("curve")}</h2>
    ${infoText(t("curveHelp"))}
    <div class="card">${curveSvg(chrono)}</div>
    <h2>${t("latest")}</h2>
    ${infoText(t("latestHelp"))}
    <div class="card"><table><tbody>${latest.map(r => `<tr class="row" data-sp="${r.s}" tabindex="0"><td class="nr">${r.nr}</td>
      <td>${speciesLine(SP[r.s])}</td>
      <td class="num">${fmtD(r.first.d)}<span class="small">${esc(placeName(r.first.p))}</span></td></tr>`).join("")}</tbody></table></div>
    <h2 data-toc="${esc(t("tocPerYear"))}">${t("perYear")}</h2>
    ${infoText(t("perYearHelp", shortMD(TODAY_MD)))}
    ${renderYearBlock(rows, { showYtd: true, showNew: true })}
    <h2 data-toc="${esc(t("tocPerMonth"))}">${t("perMonth", monthLabel)}</h2>
    ${renderYearBlock(monthRows(list), { showYtd: S.month === TODAY_M, showNew: false })}
    <h2 data-toc="${esc(t("tocHeat"))}">${t("heat")}${heatMetricPick("ym")}</h2>
    ${infoText(t("heatHelp"))}
    ${heatSection("ym", { obs: list, rows: years, rowLabels: years, rowNames: years, colLabels: monthColLabels(), colNames: T.months,
      rowOf: o => MAX_Y - o.y, colOf: o => o.m - 1, numbers: true, cls: "months" })}`;
  updateToc();
}
