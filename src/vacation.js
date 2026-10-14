/* ---------- vacation planner ---------- */
// Proposes trips for the next twelve months: the public holidays of the viewer's federal state, bridged with a
// few days of leave (Brückentage), and for each trip the destinations where the most missing species (the
// wishlist source above: all, own list, vagrants) have a good chance in its months, from the holiday planner's
// GBIF data (planner.js). Short trips stay in the home state and its neighbours, longer ones go anywhere in
// Germany. The home state is the one with the most of the viewer's observation days, until they pick another.
const VAC_STATES = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"];
const VAC_NEIGHBOURS = {
  BW: "BY HE RP", BY: "BW HE TH SN", BE: "BB", BB: "BE MV NI ST SN", HB: "NI", HH: "SH NI", HE: "NI TH BY BW RP NW",
  MV: "SH NI BB", NI: "SH HH HB MV BB ST TH HE NW", NW: "NI HE RP", RP: "NW HE BW SL", SL: "RP", SN: "BY TH ST BB",
  ST: "NI BB SN TH", SH: "HH NI MV", TH: "NI ST SN BY HE",
};
// the public holidays: a fixed "MM-DD" or days after Easter Sunday, and the states that keep them (none: all).
// Left out are holidays of single towns or Catholic parishes only (Mariä Himmelfahrt in Bavaria, Fronleichnam in
// parts of Saxony and Thuringia, the Augsburger Friedensfest) and the ones on a Sunday anyway.
const VAC_HOLIDAYS = [
  { k: "newYear", md: "01-01" },
  { k: "epiphany", md: "01-06", in: "BW BY ST" },
  { k: "womensDay", md: "03-08", in: "BE MV" },
  { k: "goodFriday", easter: -2 },
  { k: "easterMonday", easter: 1 },
  { k: "labourDay", md: "05-01" },
  { k: "ascension", easter: 39 },
  { k: "whitMonday", easter: 50 },
  { k: "corpusChristi", easter: 60, in: "BW BY HE NW RP SL" },
  { k: "assumption", md: "08-15", in: "SL" },
  { k: "childrensDay", md: "09-20", in: "TH" },
  { k: "unity", md: "10-03" },
  { k: "reformation", md: "10-31", in: "BB HB HH MV NI SN ST SH TH" },
  { k: "allSaints", md: "11-01", in: "BW BY NW RP SL" },
  { k: "repentance", in: "SN" },  // the Wednesday before 23 November
  { k: "christmas1", md: "12-25" },
  { k: "christmas2", md: "12-26" },
];
const VAC_DAY = 86400000;
const VAC_MAX_LEN = 16;  // the longest trip looked at, in days
// a variant is proposed while every day of leave buys at least this many days off
const VAC_RATIO = 2.5;
const VAC_NEAR_LEN = 4;  // up to this many days the trip stays near home
/** @type {{state: string, budget: number, eves: boolean, pick: Object<string, number>}|null} */
let VAC = null;
function vacState() {
  if (VAC) return VAC;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("lifelist-vacation") || "{}") || {}; } catch (e) { /* no or broken setting */ }
  VAC = { state: VAC_STATES.includes(saved.state) ? saved.state : vacHomeState(),
    budget: Number.isInteger(saved.budget) && saved.budget >= 0 && saved.budget <= 5 ? saved.budget : 3,
    eves: saved.eves === true, pick: {} };
  return VAC;
}
function saveVac() {
  const { state, budget, eves } = vacState();
  try { localStorage.setItem("lifelist-vacation", JSON.stringify({ state, budget, eves })); } catch (e) { /* private mode may refuse */ }
}
/** the federal state with the most of the viewer's observation days, Saxony without any */
function vacHomeState() {
  const days = new Map();
  for (const o of OBS) {
    const st = PL[o.p].state;
    if (!VAC_STATES.includes(st)) continue;
    if (!days.has(st)) days.set(st, new Set());
    days.get(st).add(o.d);
  }
  let best = "SN", most = 0;
  for (const [st, d] of days) if (d.size > most) { best = st; most = d.size; }
  return best;
}
/** Easter Sunday (Gregorian, after Gauss / the anonymous algorithm) as a UTC day number */
function vacEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day) / VAC_DAY;
}
const vacDayNr = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / VAC_DAY;
const vacIso = nr => new Date(nr * VAC_DAY).toISOString().slice(0, 10);
/** a state's public holidays in a year: ISO date -> holiday key (see VAC_HOLIDAYS); `eves` adds 24 and 31 December
 * @param {number} y @param {string} st @param {boolean} [eves] @returns {Map<string, string>} */
function vacHolidays(y, st, eves = false) {
  const out = new Map(), easter = vacEaster(y);
  for (const h of VAC_HOLIDAYS) {
    if (h.in && !h.in.split(" ").includes(st)) continue;
    let nr;
    if (h.md) nr = vacDayNr(`${y}-${h.md}`);
    else if (h.easter !== undefined) nr = easter + h.easter;
    else { const n22 = vacDayNr(`${y}-11-22`); nr = n22 - (new Date(n22 * VAC_DAY).getUTCDay() + 4) % 7; }
    out.set(vacIso(nr), h.k);
  }
  if (eves) { out.set(`${y}-12-24`, "christmasEve"); out.set(`${y}-12-31`, "newYearsEve"); }
  return out;
}
/**
 * @typedef {Object} VacTrip
 * @property {number} s - first day (UTC day number)
 * @property {number} e - last day
 * @property {number} leave - working days off to take
 * @property {string[]} hol - the holidays' keys inside
 * @property {number} h0 - the first holiday of its group
 * @typedef {{key: string, variants: VacTrip[], pick: VacTrip}} VacGroup
 */
/**
 * The trips of the next twelve months from `from` on: every stretch of at most VAC_MAX_LEN days around a
 * holiday on a working day that takes at most `budget` days of leave and ends where work starts again, grouped
 * by the first holiday they hold (holidays close together make one group); per group the longest trip for each
 * number of days of leave that makes it longer.
 * @param {number} from - UTC day number of the first day @param {string} st @param {number} budget @param {boolean} eves
 * @returns {VacGroup[]}
 */
function vacPlan(from, st, budget, eves) {
  const n = 366, y0 = +vacIso(from).slice(0, 4);
  const hol = new Map([...vacHolidays(y0, st, eves), ...vacHolidays(y0 + 1, st, eves), ...vacHolidays(y0 + 2, st, eves)]);
  const days = Array.from({ length: n + VAC_MAX_LEN }, (_, i) => {
    const nr = from + i, dow = new Date(nr * VAC_DAY).getUTCDay(), h = hol.get(vacIso(nr)) || null;
    return { h, off: dow === 0 || dow === 6 || !!h, weekend: dow === 0 || dow === 6 };
  });
  const off = i => i < 0 ? false : days[i].off;  // before the first day counts as work: a trip can start on it
  // holidays with at most two working days between them make one group (Good Friday and Easter Monday)
  const hols = days.map((d, i) => i).filter(i => i < n && days[i].h && !days[i].weekend);
  /** @type {Map<number, number>} */
  const cluster = new Map();
  hols.forEach((h, j) => {
    const prev = hols[j - 1];
    let work = 0;
    if (j) for (let i = prev + 1; i < h; i++) if (!days[i].off) work++;
    cluster.set(h, j && work <= 2 ? /** @type {number} */ (cluster.get(prev)) : h);
  });
  /** @type {Map<number, Map<string, VacTrip>>} */
  const groupsBy = new Map();
  for (const h of hols) {
    for (let s = Math.max(0, h - VAC_MAX_LEN + 1); s <= h; s++) {
      if (off(s - 1)) continue;
      let leave = 0, before = false;
      for (let i = s; i < h; i++) { if (!days[i].off) leave++; if (days[i].h && !days[i].weekend) before = true; }
      // found from its first holiday only
      if (before || leave > budget) continue;
      for (let e = h; e < s + VAC_MAX_LEN && e < days.length - 1; e++) {
        if (e > h && !days[e].off) leave++;
        if (leave > budget) break;
        if (off(e + 1) || e - s + 1 < 3) continue;
        const hs = [];
        for (let i = s; i <= e; i++) if (days[i].h && !days[i].weekend) hs.push(/** @type {string} */ (days[i].h));
        const c = /** @type {number} */ (cluster.get(h));
        if (!groupsBy.has(c)) groupsBy.set(c, new Map());
        /** @type {Map<string, VacTrip>} */ (groupsBy.get(c)).set(`${s}-${e}`, { s: from + s, e: from + e, leave, hol: hs, h0: from + c });
      }
    }
  }
  const groups = [...groupsBy.values()].map(m => [...m.values()]);
  return groups.map(g => {
    /** @type {VacTrip[]} */
    const variants = [];
    for (let k = 0; k <= budget; k++) {
      // the longest with k days of leave; of equal ones the one with most holidays, then the earliest
      const best = g.filter(x => x.leave === k).sort((a, b) => (b.e - b.s) - (a.e - a.s) || b.hol.length - a.hol.length || a.s - b.s)[0];
      const prev = variants[variants.length - 1];
      if (best && (!prev || best.e - best.s > prev.e - prev.s)) variants.push(best);
    }
    const len = (/** @type {VacTrip} */ x) => x.e - x.s + 1;
    const fine = variants.filter(x => !x.leave || len(x) / x.leave >= VAC_RATIO);
    const pick = fine.length ? fine[fine.length - 1] : variants[0];
    // named after its first holiday, which stays the same when the days of leave change
    return { key: vacIso(g[0].h0), variants, pick };
  }).filter(g => g.variants.length);
}
/** the destinations of a trip: per district the missing species with a good or possible chance in its months
 * @param {PlanData} data @param {PlanSpecies[]} missing @param {VacTrip} trip @param {string} st */
function vacDestinations(data, missing, trip, st) {
  const months = new Set();
  for (let nr = trip.s; nr <= trip.e; nr++) months.add(+vacIso(nr).slice(5, 7) - 1);
  const near = trip.e - trip.s + 1 <= VAC_NEAR_LEN;
  const states = new Set([st, ...VAC_NEIGHBOURS[st].split(" ")].map(c => STR.de.states[c]));
  const rows = new Map();
  for (const sp of missing) {
    if (sp.widespread) continue;
    for (const [r, cells] of sp.cells) {
      if (near && !states.has(data.regions[r].parent)) continue;
      const l = Math.max(...[...months].map(m => cells[m]));
      if (l < PLAN_MAYBE) continue;
      let row = rows.get(r);
      if (!row) { row = { r, good: [], maybe: [] }; rows.set(r, row); }
      (l >= PLAN_GOOD ? row.good : row.maybe).push(sp);
    }
  }
  return { near, rows: [...rows.values()].sort((a, b) => b.good.length - a.good.length || b.maybe.length - a.maybe.length
    || collator.compare(data.regions[a.r].name, data.regions[b.r].name)) };
}
// "Do 14.05." / "Thu 14 May"
function vacDate(nr, year = false) {
  const iso = vacIso(nr), wd = T.weekdays[(new Date(nr * VAC_DAY).getUTCDay() + 6) % 7];
  const md = S.lang === "en" ? `${+iso.slice(8)} ${T.monthsShort[+iso.slice(5, 7) - 1]}` : `${iso.slice(8)}.${iso.slice(5, 7)}.`;
  return `${wd} ${md}${year ? (S.lang === "en" ? " " : "") + iso.slice(0, 4) : ""}`;
}
/** the working days of a trip that need leave, as "Fr 15.05., Mo 18.05." @param {VacTrip} trip @param {Map<string, string>} hol */
function vacLeaveDays(trip, hol) {
  const out = [];
  for (let nr = trip.s; nr <= trip.e; nr++) {
    const dow = new Date(nr * VAC_DAY).getUTCDay();
    if (dow && dow !== 6 && !hol.has(vacIso(nr))) out.push(vacDate(nr));
  }
  return out;
}
function vacOutHtml() {
  const v = vacState(), from = vacDayNr(`${TODAY_Y}-${pad(TODAY_M)}-${pad(NOW.getDate())}`) + 1;
  const groups = vacPlan(from, v.state, v.budget, v.eves);
  if (!groups.length) return `<p class="empty">${t("vacNone")}</p>`;
  const y0 = TODAY_Y, hol = new Map([y0, y0 + 1, y0 + 2].flatMap(y => [...vacHolidays(y, v.state, v.eves)]));
  const data = PLAN_SCOPES.includes("de") ? planData("de") : null, missing = data ? planMissing(data) : [];
  const spList = (/** @type {PlanSpecies[]} */ list) => list.map(planName).sort(collator.compare).map(esc).join(", ");
  return `<div class="vac-list">${groups.map(g => {
    const trip = g.variants.find(x => x.leave === v.pick[g.key]) || g.pick, len = trip.e - trip.s + 1;
    const leave = vacLeaveDays(trip, hol);
    const names = [...new Set(trip.hol)].map(k => t("hol_" + k)).join(", ");
    const chips = g.variants.length > 1 ? `<span class="plan-switch" role="group" aria-label="${esc(t("vacVariants"))}">${g.variants.map(x =>
      `<button type="button" class="pill${x === trip ? " on" : ""}" data-vac-pick="${esc(g.key)}|${x.leave}" aria-pressed="${x === trip}">${esc(t("vacVariant", x.leave, x.e - x.s + 1))}</button>`).join("")}</span>` : "";
    let dest = "";
    if (data) {
      const { near, rows } = vacDestinations(data, missing, trip, v.state);
      const top = rows.slice(0, 3);
      dest = !top.length ? `<p class="small-inline">${t(near ? "vacNoDestNear" : "vacNoDest")}</p>`
        : `<p class="vac-where">${t(near ? "vacNear" : "vacFar")}</p><ol class="vac-dest">${top.map((x, i) =>
          `<li><b>${esc(data.regions[x.r].name)}</b> <span class="small-inline">${esc(data.regions[x.r].parent)} · ${t("vacCounts", x.good.length, x.maybe.length)}</span>
            ${i === 0 && (x.good.length || x.maybe.length) ? `<details class="vac-sp"><summary>${t("vacShowSpecies")}</summary>
              ${x.good.length ? `<p><b>${t("planGood")}:</b> ${spList(x.good)}</p>` : ""}${x.maybe.length ? `<p><b>${t("planMaybe")}:</b> ${spList(x.maybe)}</p>` : ""}</details>` : ""}</li>`).join("")}</ol>`;
    }
    return `<div class="card vac" data-vac="${esc(g.key)}">
      <div class="vac-head"><b>${vacDate(trip.s)} – ${vacDate(trip.e, true)}</b><span class="small-inline">${esc(names)}</span></div>
      <p class="vac-days">${t("vacDays", len, trip.leave)}${leave.length ? ` <span class="small-inline">(${esc(leave.join(", "))})</span>` : ""}</p>
      ${chips}${dest}</div>`;
  }).join("")}</div>`;
}
function vacationSection() {
  const v = vacState();
  const opt = (val, label, cur) => `<option value="${val}"${val === cur ? " selected" : ""}>${esc(label)}</option>`;
  const states = [...VAC_STATES].sort((a, b) => collator.compare(stateName(a), stateName(b)));
  return `<h2 data-toc="${esc(t("tocVac"))}">${t("vacTitle")}</h2>
    ${infoText(t("vacHelp", VAC_NEAR_LEN))}
    <div class="pick">
      <select id="vac-state" aria-label="${esc(t("vacState"))}">${states.map(c => opt(c, stateName(c), v.state)).join("")}</select>
      <select id="vac-budget" aria-label="${esc(t("vacBudget"))}">${[0, 1, 2, 3, 4, 5].map(k => opt(String(k), t("vacBudgetN", k), String(v.budget))).join("")}</select>
      <label class="vac-chk"><input type="checkbox" id="vac-eves"${v.eves ? " checked" : ""}> ${t("vacEves")}</label>
    </div>
    <div id="vac-out">${vacOutHtml()}</div>`;
}
function redrawVacation() {
  const box = $("vac-out");
  if (box) box.innerHTML = vacOutHtml();
}
