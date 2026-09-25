/* ---------- data ---------- */
const RAW = JSON.parse(document.getElementById("data").textContent);
const SP = RAW.sp.map(([name, latin, order, flags, english]) => ({ name, latin, order, flags, english }));
// the curated "regularly occurring in Europe" list for the wishlist, with an official English/German
// name and a season window: bzcStart/bzcEnd is ornitho.de's official breeding-season window (for
// species that breed in Germany/Luxembourg); occStart/occEnd is a typical occurrence window derived
// from public GBIF sighting records, used as a fallback for passage migrants and visitors that don't
// breed here. See species_reference.json.
const EURO_SPECIES = (RAW.euro || []).map(([latin, de, en, bzcStart, bzcEnd, occStart, occEnd]) => ({ latin, de, en, bzcStart, bzcEnd, occStart, occEnd }));
// lets the wishlist "add" flow and its <datalist> match by either the German or the English name
const EURO_BY_NAME = new Map();
for (const e of EURO_SPECIES) {
  EURO_BY_NAME.set(e.de.toLowerCase(), e);
  if (e.en) EURO_BY_NAME.set(e.en.toLowerCase(), e);
}
const EURO_SUGGESTIONS_HTML = {};  // cached per language, since the suggested names switch with S.lang
function euroSuggestionsHtml() {
  if (!EURO_SUGGESTIONS_HTML[S.lang]) {
    EURO_SUGGESTIONS_HTML[S.lang] = EURO_SPECIES.map(e => `<option value="${esc(S.lang === "en" && e.en ? e.en : e.de)}">`).join("");
  }
  return EURO_SUGGESTIONS_HTML[S.lang];
}
const PL = RAW.pl.map(([name, muni, state, county, lat, lon], i) => {
  const s = state || "?", c = s + "/" + (county || "?");
  return { i, name, muni, state, county, lat, lon,
    keys: { s, c, m: c + "/" + muni, p: String(i) } };
});
const NOW = new Date();
const TODAY_Y = NOW.getFullYear(), TODAY_M = NOW.getMonth() + 1;
const pad = n => String(n).padStart(2, "0");
const TODAY_MD = pad(TODAY_M) + "-" + pad(NOW.getDate());
const atlasRank = ac => /^[ABC]/.test(ac) ? (parseInt(ac.slice(1), 10) || { A: 1, B: 3, C: 10 }[ac[0]]) : 0;  // E99 and unknown prefixes are no breeding evidence

/**
 * One parsed sighting, the shape every tab's render function ultimately consumes.
 * @typedef {Object} Observation
 * @property {number} s - index into SP (the species)
 * @property {string} d - ISO date, "YYYY-MM-DD"
 * @property {number} y - year, parsed from d
 * @property {number} m - month (1-12), parsed from d
 * @property {string} md - "MM-DD", parsed from d
 * @property {number} p - index into PL (the place)
 * @property {number} c - count
 * @property {number} ph - 1 if the sighting has a photo, else 0
 * @property {string} ac - atlas/breeding code, e.g. "C13a", or "" if none
 * @property {number} tm - minute of day, or -1 if the export has no time
 * @property {number} ar - numeric breeding-evidence rank derived from ac, 0 if none
 * @property {number} la - the record's own latitude (GPS or a point set by hand), 0 if it only has its place's
 * @property {number} lo - the record's own longitude, 0 if none
 * @property {number} ls - where la/lo come from: 1 the phone's GPS (where the birder stood), 2 a point set
 *   by hand (mostly where the bird was), 0 none
 */
const OBS = RAW.obs.map(([s, d, p, c, ph, ac, tm, la = 0, lo = 0, ls = 0]) => {
  const md = d.slice(5);
  return { s, d, y: +d.slice(0, 4), m: +d.slice(5, 7), md, p, c, ph, ac, tm, ar: ac ? atlasRank(ac) : 0, la, lo, ls };
});
const YEARS = [...new Set(OBS.map(o => o.y))].sort((a, b) => a - b);
const MIN_Y = YEARS[0], MAX_Y = YEARS[YEARS.length - 1];

const initialLang = (() => {
  try { return localStorage.getItem("lifelist-lang") === "en" ? "en" : "de"; } catch (e) { return "de"; }
})();
// "system" (default) follows the OS via the prefers-color-scheme CSS media query; "light"/"dark" is an
// explicit override applied as a data-theme attribute (see template.html). UI only: printing always forces light.
const initialTheme = (() => {
  try {
    const v = localStorage.getItem("lifelist-theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch (e) { return "system"; }
})();
if (initialTheme !== "system") document.documentElement.setAttribute("data-theme", initialTheme);
/**
 * The single shared, mutable UI state object every render function reads and every event
 * handler writes. Not persisted (except lang and customTargets, via localStorage).
 * @typedef {Object} AppState
 * @property {string} tab - active tab id, e.g. "overview"
 * @property {string} region - "all" or "<level>:<key>", e.g. "s:SN"
 * @property {number} year - the global time-bar's selected year
 * @property {number} month - the global time-bar's selected month, 1-12
 * @property {boolean} timeAll - "Gesamt": true shows all-time data in the few views that support a
 *   cumulative cutoff (Karte "Lifer", Tagesaktivität); every other view always uses year/month
 *   exactly regardless of this flag (Übersicht, Regionen, the life-list "NEU" badge, ...)
 * @property {"de"|"en"} lang
 * @property {"system"|"light"|"dark"} theme - UI theme; printing always forces light regardless
 * @property {boolean} escaped - include captivity escapes
 * @property {boolean} collective - include collective taxa (genus sp., hybrids, ...)
 * @property {string} atlasF - life-list atlas-code filter: "all"|"any"|"none"|"A"|"B"|"C"
 * @property {string} actMetric - activity tab metric: "obs"|"species"|"days"
 * @property {boolean} redact - place data hidden in the UI (and, for a --redact build, in the data too)
 * @property {string} metric - map metric: "life"|"year"|"obs"|"lifer"
 * @property {string} q - life-list search text
 * @property {string} sort - life-list sort key
 * @property {1|-1} dir - life-list sort direction
 * @property {Set<number>} open - species indices with an open detail row in the life list
 * @property {Object<string, {k: string, d: 1|-1}>} regSort - per region-level table sort
 * @property {Object<string, boolean>} regAll - per region-level table "show all" toggle
 * @property {string} targetSrc - wishlist source filter: "all"|"euro"|"own"
 * @property {{name: string, latin: string|null}[]} customTargets - user-maintained wishlist entries
 * @property {{k: "name"|"season", d: 1|-1}} wishSort - wishlist table sort
 * @property {Set<string>|null} wishOpen - expanded wishlist season groups; null until the user toggles one (see wishOpenGroups())
 * @property {string} wishQ - wishlist search text
 * @property {string|null} calDay - "YYYY-MM-DD" of the day opened in the overview calendar
 * @property {string|null} heatCell - "Y-M" of the open cell in the overview's species-per-year-and-month table
 * @property {string|null} actCell - open cell of the activity tab's hour tables: "m:M-H" (month 0-11, hour) or "w:W-H" (weekday 0-6 from Monday, hour)
 * @property {string} regMonthLvl - level of the region x month table's rows: "s"|"c"|"m"|"p"
 * @property {string|null} regMonthCell - "M:regionKey" (month 0-11, region key at the table's level) of its open cell
 * @property {any} tourCfg - tour settings (a TourCfg, see tours.js), kept in localStorage
 * @property {boolean} tourSetOpen - the tours' settings menu is unfolded
 * @property {{k: string, d: 1|-1}} tourSort - tours table sort (see TOUR_SORT)
 * @property {Set<string>} tourOpen - keys of tours with an open detail row
 * @property {boolean} tourAll - show every tour instead of the newest ones
 * @property {string|null} tourRoute - key of the tour drawn on the map
 * @property {number|null} focusSp - species index the life list scrolls to and highlights once, after a jump from another view
 */
const S = { tab: "overview", region: "all", year: Math.min(TODAY_Y, MAX_Y), month: TODAY_M, timeAll: true, lang: initialLang, theme: initialTheme,
  escaped: false, collective: false, atlasF: "all", actMetric: "obs", redact: !!RAW.meta.redacted, metric: "life", q: "", sort: "nr", dir: -1, open: new Set(),
  regSort: {}, regAll: {}, targetSrc: "all", customTargets: loadCustomTargets(), wishSort: { k: "season", d: 1 },
  wishOpen: null, wishQ: "", calDay: null, heatCell: null, actCell: null, regMonthLvl: "c", regMonthCell: null, tourCfg: null, tourSetOpen: false, tourSort: { k: "date", d: -1 }, tourOpen: new Set(), tourAll: false, tourRoute: null, focusSp: null };
T = STR[S.lang];

/* ---------- helpers ---------- */
// returns `any`, not HTMLElement: the DOM has no single element type with .value, .checked,
// .options, .dataset etc. all at once, and this codebase intentionally doesn't cast at every
// call site (see README's tsc note for the tradeoff this makes).
/** @param {string} id @returns {any} */
const $ = id => document.getElementById(id);
/** @param {string} sel @returns {any} */
const $$ = sel => document.querySelector(sel);
/** @param {string} sel @returns {any} */
const $$all = sel => document.querySelectorAll(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtN = n => n.toLocaleString(S.lang === "en" ? "en-GB" : "de-DE");
// rounds for display but never claims 100% unless truly complete, or 0% when something is actually there
const pctDisplay = (count, total) => !total ? 0 : count === 0 ? 0 : count === total ? 100 : Math.min(99, Math.max(1, Math.round(count / total * 100)));
const fmtD = d => d.slice(8) + "." + d.slice(5, 7) + "." + d.slice(0, 4);
const shortMD = md => (+md.slice(3)) + ". " + T.monthsShort[+md.slice(0, 2) - 1];
const byDateDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
const REDACT_MASK = "██████████";
const placeName = i => S.redact ? REDACT_MASK : PL[i].name;
const stateName = c => T.states[c] || (c === "?" ? T.unknown : c);
const countyName = key => COUNTIES[key] || (key.split("/")[1] === "?" ? T.unknown : key.split("/")[1]);
let collator = new Intl.Collator(S.lang === "en" ? "en" : "de");
// the primary display name for a species: English when the UI is in English and we have one
// (most collective taxa like "unbestimmt"/hybrids don't), otherwise the German name from the export.
const speciesName = sp => S.lang === "en" && sp.english ? sp.english : sp.name;
// the small secondary line under the primary name: German + Latin when showing English, else just Latin.
const speciesSub = sp => S.lang === "en" && sp.english ? `${sp.name} · ${sp.latin}` : sp.latin;
const speciesLine = sp => `${esc(speciesName(sp))}<span class="latin">${esc(speciesSub(sp))}</span>`;
// wraps an explanatory paragraph in a collapsed <details> so it doesn't clutter the page by default;
// print CSS forces it open again so the explanation is still in a PDF report.
const infoText = html => `<details class="info"><summary>${t("infoToggle")}</summary><p class="prose">${html}</p></details>`;

/** @returns {Observation[]} all observations, filtered by the S.escaped/S.collective toggles */
function baseObs() {
  return OBS.filter(o => {
    const f = SP[o.s].flags;
    return !((f & 1) && !S.escaped) && !((f & 2) && !S.collective);
  });
}
/**
 * @param {Observation[]} list
 * @returns {Observation[]} list narrowed to S.region, or list unchanged if S.region is "all"
 */
function regionObs(list) {
  if (S.region === "all") return list;
  const [lvl, key] = [S.region[0], S.region.slice(2)];
  return list.filter(o => PL[o.p].keys[lvl] === key);
}
/**
 * Per-species aggregation: every tab's render function builds on this.
 * @typedef {Object} SpeciesStatsRow
 * @property {number} s - index into SP
 * @property {Observation} first - earliest observation in the given list
 * @property {Observation} last - latest observation in the given list
 * @property {number} n - observation count
 * @property {number} max - highest single count
 * @property {Map<number, number>} years - year -> observation count
 * @property {number[]} months - 12 entries, observation count per month (0 = January)
 * @property {Map<number, number>} places - place index -> observation count
 * @property {number} photos - observations with a photo
 * @property {Observation[]} obs - every observation of this species, in list order
 * @property {number} ar - highest breeding-evidence rank seen
 * @property {string} ac - the atlas code that produced `ar`
 * @property {Map<string, number>} codes - atlas code -> observation count
 * @property {Observation|null} acObs - the observation that produced `ar`/`ac`
 * @property {number} [nr] - 1-based life-list number, set by numberLifers()
 */
/**
 * @param {Observation[]} list
 * @returns {Map<number, SpeciesStatsRow>} species index -> aggregated stats, for species present in `list`
 */
function speciesStats(list) {
  const m = new Map();
  for (const o of list) {
    let r = m.get(o.s);
    if (!r) {
      r = { s: o.s, first: o, last: o, n: 0, max: 0, years: new Map(), months: Array(12).fill(0),
        places: new Map(), photos: 0, obs: [], ar: 0, ac: "", codes: new Map(), acObs: null };
      m.set(o.s, r);
    }
    r.last = o; r.n++; r.obs.push(o);
    if (o.c > r.max) r.max = o.c;
    r.years.set(o.y, (r.years.get(o.y) || 0) + 1);
    r.months[o.m - 1]++;
    r.places.set(o.p, (r.places.get(o.p) || 0) + 1);
    r.photos += o.ph;
    if (o.ac) { r.codes.set(o.ac, (r.codes.get(o.ac) || 0) + 1); if (o.ar > r.ar) { r.ar = o.ar; r.ac = o.ac; r.acObs = o; } }
  }
  return m;
}
