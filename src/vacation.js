/* ---------- vacation planner ---------- */
// Proposes trips for the next twelve months: the public holidays of the viewer's federal state, bridged with a
// few days of leave (Brückentage), and for each trip the destinations where the most missing species (the
// wishlist source above: all, own list, vagrants) have a good chance in its months, from the holiday planner's
// GBIF data (planner.js). Short trips stay in the home state and its neighbours, longer ones go anywhere in
// Germany. The home state is the one with the most of the viewer's observation days, until they pick another.
// Its settings are S.vac (loadVac(), called while S is built in data.js).
const VAC_STATES = vacStateCodes();
const VAC_NEIGHBOURS = {
  BW: "BY HE RP", BY: "BW HE TH SN", BE: "BB", BB: "BE MV NI ST SN", HB: "NI", HH: "SH NI", HE: "NI TH BY BW RP NW",
  MV: "SH NI BB", NI: "SH HH HB MV BB ST TH HE NW", NW: "NI HE RP", RP: "NW HE BW SL", SL: "RP", SN: "BY TH ST BB",
  ST: "NI BB SN TH", SH: "HH NI MV", TH: "NI ST SN BY HE",
};
// the GBIF data name the states in German: their codes, to name them in the page's language
/** @type {Object<string, string>} */
const VAC_CODE_BY_NAME = Object.fromEntries(VAC_STATES.map(c => [STR.de.states[c], c]));
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
const VAC_SPAN = 366;  // the days looked ahead
const VAC_MAX_LEN = 16;  // the longest trip looked at, in days
// a variant is proposed while every day of leave buys at least this many days off
const VAC_RATIO = 2.5;
const VAC_NEAR_LEN = 4;  // up to this many days the trip stays near home
/** the German federal states (ornitho.de also has Luxembourg); a function, as S is built before this file's constants */
function vacStateCodes() { return Object.keys(STR.de.states).filter(c => c !== "LU"); }
/** @returns {{state: string, chosen: boolean, budget: number, eves: boolean, pick: Object<string, number>, from: number|null}} */
function loadVac() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("lifelist-vacation") || "{}") || {}; } catch (e) { /* no or broken setting */ }
  const chosen = vacStateCodes().includes(saved.state);
  return { state: chosen ? saved.state : vacHomeState(), chosen,
    budget: Number.isInteger(saved.budget) && saved.budget >= 0 && saved.budget <= 5 ? saved.budget : 3,
    eves: saved.eves === true, pick: {}, from: null };
}
// the state is kept only once the viewer picked it: until then it follows the observation days of the export at hand
function saveVac() {
  const { state, chosen, budget, eves } = S.vac;
  try { localStorage.setItem("lifelist-vacation", JSON.stringify(chosen ? { state, budget, eves } : { budget, eves })); } catch (e) { /* private mode may refuse */ }
}
/** the federal state with the most of the viewer's observation days, Saxony without any */
function vacHomeState() {
  const codes = vacStateCodes(), days = new Map();
  for (const o of OBS) {
    const st = PL[o.p].state;
    if (!codes.includes(st)) continue;
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
const vacDow = nr => new Date(nr * VAC_DAY).getUTCDay();
/** a state's public holidays in a year: ISO date -> holiday key (see VAC_HOLIDAYS); `eves` adds 24 and 31 December
 * @param {number} y @param {string} st @param {boolean} [eves] @returns {Map<string, string>} */
function vacHolidays(y, st, eves = false) {
  const out = new Map(), easter = vacEaster(y);
  for (const h of VAC_HOLIDAYS) {
    if (h.in && !h.in.split(" ").includes(st)) continue;
    let nr;
    if (h.md) nr = vacDayNr(`${y}-${h.md}`);
    else if (h.easter !== undefined) nr = easter + h.easter;
    else { const n22 = vacDayNr(`${y}-11-22`); nr = n22 - (vacDow(n22) + 4) % 7; }
    out.set(vacIso(nr), h.k);
  }
  if (eves) { out.set(`${y}-12-24`, "christmasEve"); out.set(`${y}-12-31`, "newYearsEve"); }
  return out;
}
/**
 * @typedef {Object} VacTrip
 * @property {number} s - first day (UTC day number)
 * @property {number} e - last day
 * @property {number[]} leaveDays - the working days off to take
 * @property {string[]} hol - the keys of all holidays inside, on a weekend too
 * @property {number} wh - how many of them fall on a working day
 * @property {number} stranded - single working days left between the trip and a weekend or holiday (0-2)
 * @typedef {{key: string, hols: {nr: number, k: string}[], variants: VacTrip[], pick: VacTrip|null}} VacGroup
 */
const vacLen = (/** @type {VacTrip} */ x) => x.e - x.s + 1;
/**
 * The trips of the twelve months from `from` on, by group of holidays on working days (holidays with at most
 * two working days between them, and no more than `budget`, make one group, as Good Friday and Easter Monday): every stretch of at most
 * VAC_MAX_LEN days around them that takes at most `budget` days of leave, ends where work starts again and holds
 * no holiday of another group; per group the longest trip for each number of days of leave that makes it longer.
 * Two groups whose proposed trips meet become one. A group without any such trip has no variants: its holidays
 * are still listed.
 * @param {number} from - UTC day number of the first day @param {string} st @param {number} budget @param {boolean} eves
 * @returns {VacGroup[]}
 */
function vacPlan(from, st, budget, eves) {
  const y0 = +vacIso(from).slice(0, 4);
  const hol = new Map([y0, y0 + 1, y0 + 2].flatMap(y => [...vacHolidays(y, st, eves)]));
  const days = Array.from({ length: VAC_SPAN + VAC_MAX_LEN + 1 }, (_, i) => {
    const dow = vacDow(from + i), h = hol.get(vacIso(from + i)) || null, weekend = dow === 0 || dow === 6;
    return { h, off: weekend || !!h, wh: !!h && !weekend };
  });
  const off = i => i >= 0 && days[i].off;  // before the first day counts as work: a trip can start on it
  const work = i => i >= 0 && i < days.length && !days[i].off;
  const hols = days.map((d, i) => i).filter(i => i < VAC_SPAN && days[i].wh);
  /** @type {number[][]} */
  const clusters = [];
  hols.forEach((h, j) => {
    let gap = 0;
    if (j) for (let i = hols[j - 1] + 1; i < h; i++) if (!days[i].off) gap++;
    if (j && gap <= Math.min(2, budget)) clusters[clusters.length - 1].push(h); else clusters.push([h]);
  });
  /** @param {number[]} cl @returns {VacGroup} */
  const build = cl => {
    const mine = new Set(cl);
    /** @type {VacTrip[]} */
    const trips = [];
    for (const h of cl) {
      for (let s = Math.max(0, h - VAC_MAX_LEN + 1); s <= h; s++) {
        if (off(s - 1)) continue;
        // found from its first holiday only, and none of another group inside
        const leaveDays = [], names = [];
        let ok = true;
        for (let i = s; i < h && ok; i++) {
          if (days[i].wh) ok = false;
          if (!days[i].off) leaveDays.push(from + i);
          if (days[i].h) names.push(/** @type {string} */ (days[i].h));
        }
        if (!ok || leaveDays.length > budget) continue;
        let wh = 0;
        for (let e = h; e < s + VAC_MAX_LEN && e < days.length - 1; e++) {
          if (days[e].wh && !mine.has(e)) break;
          if (!days[e].off) leaveDays.push(from + e);
          if (leaveDays.length > budget) break;
          if (days[e].h) names.push(/** @type {string} */ (days[e].h));
          if (days[e].wh) wh++;
          if (off(e + 1) || e - s + 1 < 3) continue;
          const stranded = Number(work(e + 1) && off(e + 2)) + Number(work(s - 1) && off(s - 2));
          trips.push({ s: from + s, e: from + e, leaveDays: leaveDays.slice(), hol: names.slice(), wh, stranded });
        }
      }
    }
    /** @type {VacTrip[]} */
    const variants = [];
    for (let k = 0; k <= budget; k++) {
      // the longest with k days of leave; of equal ones the one leaving no single working day before a weekend,
      // then one ending on a Sunday, the one with most holidays, the earliest
      const best = trips.filter(x => x.leaveDays.length === k).sort((a, b) => vacLen(b) - vacLen(a) || a.stranded - b.stranded
        || Number(vacDow(b.e) === 0) - Number(vacDow(a.e) === 0) || b.wh - a.wh || a.s - b.s)[0];
      const prev = variants[variants.length - 1];
      if (best && (!prev || vacLen(best) > vacLen(prev))) variants.push(best);
    }
    const fine = variants.filter(x => !x.leaveDays.length || vacLen(x) / x.leaveDays.length >= VAC_RATIO);
    // named after its first holiday, which stays the same when the days of leave change
    return { key: vacIso(from + cl[0]), hols: cl.map(i => ({ nr: from + i, k: /** @type {string} */ (days[i].h) })), variants,
      pick: fine.length ? fine[fine.length - 1] : variants[0] || null };
  };
  const groups = clusters.map(build);
  // proposals that overlap, or only weekends and holidays lie between them, are one trip
  for (let i = 0; i < groups.length - 1;) {
    const a = groups[i].pick, b = groups[i + 1].pick;
    let meet = !!a && !!b && b.s <= a.e + 1;
    if (a && b && !meet) { meet = true; for (let nr = a.e + 1; nr < b.s && meet; nr++) if (!days[nr - from].off) meet = false; }
    if (!meet) { i++; continue; }
    clusters.splice(i, 2, clusters[i].concat(clusters[i + 1]));
    groups.splice(i, 2, build(clusters[i]));
  }
  return groups;
}
/**
 * Per district the missing species with a good or possible chance in some months, the best districts first. Kept in `cache` by the months and, near home, the state.
 * @param {PlanData} data @param {PlanSpecies[]} missing @param {number[]} months - 0-11 @param {string|null} near - home state, or null for all of Germany
 * @param {Map<string, {r: number, good: PlanSpecies[], maybe: PlanSpecies[]}[]>} cache
 */
function vacDestinations(data, missing, months, near, cache) {
  const key = months.join(",") + "|" + (near || "");
  const hit = cache.get(key);
  if (hit) return hit;
  const states = near ? new Set([near, ...VAC_NEIGHBOURS[near].split(" ")].map(c => STR.de.states[c])) : null;
  const rows = new Map();
  for (const sp of missing) {
    if (sp.widespread) continue;
    for (const [r, cells] of sp.cells) {
      if (states && !states.has(data.regions[r].parent)) continue;
      let l = 0;
      for (const m of months) if (cells[m] > l) l = cells[m];
      if (l < PLAN_MAYBE) continue;
      let row = rows.get(r);
      if (!row) { row = { r, good: [], maybe: [] }; rows.set(r, row); }
      (l >= PLAN_GOOD ? row.good : row.maybe).push(sp);
    }
  }
  const out = [...rows.values()].sort((a, b) => b.good.length - a.good.length || b.maybe.length - a.maybe.length
    || collator.compare(data.regions[a.r].name, data.regions[b.r].name));
  cache.set(key, out);
  return out;
}
// "Do 14.05." / "Thu 14 May", with the year "Do 14.05.2026" / "Thu 14 May 2026"
function vacDate(nr, year = false) {
  const iso = vacIso(nr), wd = T.weekdays[(vacDow(nr) + 6) % 7];
  const md = S.lang === "en" ? `${+iso.slice(8)} ${T.monthsShort[+iso.slice(5, 7) - 1]}` : `${iso.slice(8)}.${iso.slice(5, 7)}.`;
  return `${wd} ${md}${year ? (S.lang === "en" ? " " : "") + iso.slice(0, 4) : ""}`;
}
const vacToday = () => vacDayNr(`${TODAY_Y}-${TODAY_MD}`);
/** what the cards share, from the last full redraw: a click on a variant redraws its card alone
 * @type {{groups: VacGroup[], data: PlanData|null, missing: PlanSpecies[], cache: Map<string, any>}|null} */
let VAC_CTX = null;
/** @param {VacGroup} g */
function vacCardHtml(g) {
  const { data, missing, cache } = /** @type {NonNullable<typeof VAC_CTX>} */ (VAC_CTX);
  if (!g.pick) {
    // a holiday no trip of three days can be made of with the days of leave allowed
    return `<div class="card vac" data-vac="${esc(g.key)}"><div class="vac-head"><b>${g.hols.map(h => vacDate(h.nr, true)).join(", ")}</b>
      <span class="small-inline">${esc(g.hols.map(h => t("hol_" + h.k)).join(", "))}</span></div>
      <p class="vac-days small-inline">${t("vacNoTrip", S.vac.budget)}</p></div>`;
  }
  const trip = g.variants.find(x => x.leaveDays.length === S.vac.pick[g.key]) || g.pick;
  const crosses = vacIso(trip.s).slice(0, 4) !== vacIso(trip.e).slice(0, 4);
  const chips = g.variants.length > 1 ? `<span class="plan-switch" role="group" aria-label="${esc(t("vacVariants"))}">${g.variants.map(x =>
    `<button type="button" class="pill${x === trip ? " on" : ""}" data-vac-pick="${esc(g.key)}|${x.leaveDays.length}" aria-pressed="${x === trip}">${esc(t("vacVariant", x.leaveDays.length, vacLen(x)))}</button>`).join("")}</span>` : "";
  let dest = "";
  if (data) {
    const months = [];
    for (let nr = trip.s; nr <= trip.e; nr++) { const m = +vacIso(nr).slice(5, 7) - 1; if (!months.includes(m)) months.push(m); }
    const near = vacLen(trip) <= VAC_NEAR_LEN ? S.vac.state : null;
    const spList = (/** @type {PlanSpecies[]} */ list) => list.map(planName).sort(collator.compare).map(esc).join(", ");
    const top = vacDestinations(data, missing, months, near, cache).slice(0, 3);
    dest = !top.length ? `<p class="small-inline">${t(near ? "vacNoDestNear" : "vacNoDest")}</p>`
      : `<p class="vac-where">${t(near ? "vacNear" : "vacFar")}</p><ol class="vac-dest">${top.map(x => {
        const parent = data.regions[x.r].parent, code = VAC_CODE_BY_NAME[parent];
        return `<li><b>${esc(data.regions[x.r].name)}</b> <span class="small-inline">${esc(code ? stateName(code) : parent)} · ${t("vacCounts", x.good.length, x.maybe.length)}</span>
          <details class="vac-sp"><summary>${t("vacShowSpecies")}</summary>
            ${x.good.length ? `<p><b>${t("planGood")}:</b> ${spList(x.good)}</p>` : ""}${x.maybe.length ? `<p><b>${t("planMaybe")}:</b> ${spList(x.maybe)}</p>` : ""}</details></li>`;
      }).join("")}</ol>`;
  }
  return `<div class="card vac" data-vac="${esc(g.key)}">
    <div class="vac-head"><b>${vacDate(trip.s, crosses)} – ${vacDate(trip.e, true)}</b><span class="small-inline">${esc(trip.hol.map(k => t("hol_" + k)).join(", "))}</span></div>
    <p class="vac-days">${t("vacDays", vacLen(trip), trip.leaveDays.length)}${trip.leaveDays.length ? ` <span class="small-inline">(${esc(trip.leaveDays.map(nr => vacDate(nr)).join(", "))})</span>` : ""}</p>
    ${chips}${dest}</div>`;
}
function vacOutHtml() {
  const v = S.vac, groups = vacPlan((v.from ?? vacToday() + 1), v.state, v.budget, v.eves);
  const data = PLAN_SCOPES.includes("de") ? planData("de") : null;
  VAC_CTX = { groups, data, missing: data ? planMissing(data) : [], cache: new Map() };
  if (!groups.length) return `<p class="empty">${t("vacNone")}</p>`;
  return `<div class="vac-list">${groups.map(vacCardHtml).join("")}</div>`;
}
function vacationSection() {
  const v = S.vac;
  const states = [...VAC_STATES].sort((a, b) => collator.compare(stateName(a), stateName(b)));
  return `<h2 data-toc="${esc(t("tocVac"))}">${t("vacTitle")}</h2>
    ${infoText(t("vacHelp", VAC_NEAR_LEN))}
    <div class="pick">
      <select id="vac-state" aria-label="${esc(t("vacState"))}">${states.map(c => optionHtml(c, stateName(c), v.state)).join("")}</select>
      <select id="vac-budget" aria-label="${esc(t("vacBudget"))}">${[0, 1, 2, 3, 4, 5].map(k => optionHtml(String(k), t("vacBudgetN", k), String(v.budget))).join("")}</select>
      <label class="vac-chk"><input type="checkbox" id="vac-eves"${v.eves ? " checked" : ""}> ${t("vacEves")}</label>
    </div>
    <div id="vac-out">${vacOutHtml()}</div>`;
}
function redrawVacation() {
  const box = $("vac-out");
  if (box) box.innerHTML = vacOutHtml();
}
/** redraws one card after a different variant was picked @param {string} key */
function redrawVacCard(key) {
  const g = VAC_CTX && VAC_CTX.groups.find(x => x.key === key), card = $$(`#vac-out [data-vac="${CSS.escape(key)}"]`);
  if (g && card) card.outerHTML = vacCardHtml(g);
}
