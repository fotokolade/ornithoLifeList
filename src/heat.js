/* ---------- heat tables ---------- */
// One builder for the heat tables (year x month, month x hour, weekday x hour, region x month): cells
// counted by the table's own metric (records, species or days), totals for every row and column as bars
// at the edges, a crosshair and tooltip on hover (app.js), and a click on a cell or a total that opens
// its species. Each table registers its spec under a `kind`; a metric change or a click then redraws
// only that table (heatCard), not the tab around it.
/**
 * @typedef {Object} HeatSpec
 * @property {Observation[]} obs
 * @property {string[]} rows - row keys, stable across redraws (so an open cell stays with its row)
 * @property {string[]} rowLabels - HTML of the row label cells
 * @property {string[]} rowNames - row names for tooltips and panels
 * @property {string[]} colLabels - HTML of the column headers
 * @property {string[]} colNames - column names for tooltips and panels
 * @property {(o: Observation) => number} rowOf - a record's row index, -1 to leave it out
 * @property {(o: Observation) => number} colOf - a record's column index, -1 to leave it out
 * @property {boolean} [numbers] - write the value into every cell
 * @property {string} [cls] - extra classes of the table
 */
/** @type {Object<string, HeatSpec>} */
const HEATS = {};
const HEAT_METRICS = [["obs", "actMObs"], ["species", "actMSpecies"], ["days", "actMDays"]];
const heatAcc = () => ({ n: 0, s: new Set(), d: new Set() });
/** @param {{n: number, s: Set<number>, d: Set<string>}} a @param {string} metric */
const heatVal = (a, metric) => metric === "obs" ? a.n : metric === "species" ? a.s.size : a.d.size;
const heatTip = (name, a) => `${name}: ${t("heatTip", fmtN(a.n), fmtN(a.s.size), fmtN(a.d.size))}`;
// a cell key: "<row key>|<column index>", "*" standing for a whole row or column
const heatKey = (row, col) => `${row}|${col}`;
/** @param {string} kind @param {HeatSpec} spec */
function heatSection(kind, spec) {
  HEATS[kind] = spec;
  return `<div class="heat-wrap" id="heat-${kind}">${heatCard(kind)}</div>`;
}
// the "zählen nach" picker for a heading
function heatMetricPick(kind) {
  return `<label class="ctl">${t("actCountBy")}<select data-heat-metric="${kind}" aria-label="${esc(t("ariaMetric"))}">${HEAT_METRICS.map(([k, l]) =>
    `<option value="${k}"${k === S.heatMetric[kind] ? " selected" : ""}>${t(l)}</option>`).join("")}</select></label>`;
}
function redrawHeat(kind) {
  const box = $(`heat-${kind}`);
  if (box && HEATS[kind]) box.innerHTML = heatCard(kind);
}
function heatCard(kind) {
  const spec = HEATS[kind], metric = S.heatMetric[kind], sel = S.heatSel[kind];
  const R = spec.rows.length, C = spec.colLabels.length;
  const cells = Array.from({ length: R }, () => Array.from({ length: C }, heatAcc));
  const rowT = Array.from({ length: R }, heatAcc), colT = Array.from({ length: C }, heatAcc);
  for (const o of spec.obs) {
    const r = spec.rowOf(o), c = spec.colOf(o);
    if (r < 0 || c < 0) continue;
    for (const a of [cells[r][c], rowT[r], colT[c]]) { a.n++; a.s.add(o.s); a.d.add(o.d); }
  }
  const val = a => heatVal(a, metric);
  const max = Math.max(1, ...cells.flat().map(val)), maxR = Math.max(1, ...rowT.map(val)), maxC = Math.max(1, ...colT.map(val));
  const attrs = (key, name, a) => { const tip = heatTip(name, a);
    return ` data-heat="${kind}" data-key="${esc(key)}" data-tip="${esc(tip)}" role="button" tabindex="0" aria-pressed="${sel === key}" aria-label="${esc(tip)}"`; };
  const total = t("heatTotal");
  const body = spec.rows.map((rk, r) => `<tr><td class="y" title="${esc(spec.rowNames[r])}">${spec.rowLabels[r]}</td>${cells[r].map((a, c) => {
    const v = val(a);
    if (!v) return `<td data-c="${c}"></td>`;
    const key = heatKey(rk, c), cls = [v / max > HEAT_INK_FROM ? "hot" : "", sel === key ? "sel" : ""].join(" ").trim();
    return `<td data-c="${c}"${attrs(key, `${spec.rowNames[r]}, ${spec.colNames[c]}`, a)} class="${cls}" style="background:${heatColor(v / max)}">${spec.numbers ? v : ""}</td>`;
  }).join("")}${val(rowT[r]) ? `<td class="tot${sel === heatKey(rk, "*") ? " sel" : ""}"${attrs(heatKey(rk, "*"), `${spec.rowNames[r]}, ${total}`, rowT[r])}>
    <span class="tot-bar"><i style="width:${val(rowT[r]) / maxR * 100}%"></i></span><span class="tot-n">${fmtN(val(rowT[r]))}</span></td>` : "<td></td>"}</tr>`).join("");
  const foot = `<tr class="tot-row"><td class="y" title="${esc(total)}">Σ</td>${colT.map((a, c) => {
    const v = val(a), key = heatKey("*", c);
    return v ? `<td data-c="${c}" class="tot-c${sel === key ? " sel" : ""}"${attrs(key, `${spec.colNames[c]}, ${total}`, a)}><span class="tot-vbar"><i style="height:${v / maxC * 100}%"></i></span>${spec.numbers ? `<span class="tot-n">${fmtN(v)}</span>` : ""}</td>` : `<td data-c="${c}"></td>`;
  }).join("")}<td></td></tr>`;
  return `<div class="card"><table class="heat heat-x ${spec.cls || ""}"><thead><tr><th></th>${spec.colLabels.map((l, c) => `<th data-c="${c}">${l}</th>`).join("")}<th class="tot-h" title="${esc(total)}">Σ</th></tr></thead>
    <tbody>${body}</tbody><tfoot>${foot}</tfoot></table>${sel ? heatPanel(kind, spec, sel) : ""}</div>${heatLegend(max)}`;
}
// the species behind a cell, a row total or a column total
function heatPanel(kind, spec, key) {
  const i = key.lastIndexOf("|"), rk = key.slice(0, i), ck = key.slice(i + 1);
  const r = rk === "*" ? -1 : spec.rows.indexOf(rk), c = ck === "*" ? -1 : +ck;
  if (rk !== "*" && r < 0) return "";
  const obs = spec.obs.filter(o => { const or = spec.rowOf(o), oc = spec.colOf(o);
    return or >= 0 && oc >= 0 && (r < 0 || or === r) && (c < 0 || oc === c); });
  if (!obs.length) return "";
  // species whose very first record lies in here get the NEU mark
  const inHere = new Set(obs);
  const newSp = new Set([...speciesStats(baseObs()).values()].filter(x => inHere.has(x.first)).map(x => x.s));
  const acc = heatAcc();
  for (const o of obs) { acc.n++; acc.s.add(o.s); acc.d.add(o.d); }
  const title = r < 0 ? `${spec.colNames[c]}, ${t("heatTotal")}` : c < 0 ? `${spec.rowNames[r]}, ${t("heatTotal")}` : `${spec.rowNames[r]}, ${spec.colNames[c]}`;
  return cellPanel(title, t("heatTip", fmtN(acc.n), fmtN(acc.s.size), fmtN(acc.d.size)) + (newSp.size ? " · " + t("calDayLifers", newSp.size) : ""),
    `data-heat="${kind}" data-key="${esc(key)}"`, speciesChipsOf(obs, s => newSp.has(s)));
}
// the month columns' headers: the short name, one letter on a phone
const monthColLabels = () => T.monthsShort.map(m => `<span class="m-long">${m.replace(".", "")}</span><span class="m-short">${m.slice(0, 1)}</span>`);
