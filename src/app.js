/* ---------- chrome ---------- */
// combined (year,month) index for the global time bar, 0 = January of MIN_Y, one step per calendar month
const timeYMIndex = (y, m) => (y - MIN_Y) * 12 + (m - 1);
const timeYMFromIndex = idx => ({ y: MIN_Y + Math.floor(idx / 12), m: (idx % 12) + 1 });
const timePeriodLabel = () => S.month === 12 ? String(S.year) : `${T.monthsShort[S.month - 1]} ${S.year}`;
// shared by every map-metric <option>'s label: "allKey" when Gesamt is active, else "periodKey"
// filled in with the current period — avoids each metric re-writing this ternary separately
const cutoffLabel = (allKey, periodKey) => S.timeAll ? t(allKey) : t(periodKey, timePeriodLabel());
let timeRAF = null;
// syncs the "Gesamt" button and bold period label with S.timeAll/S.year/S.month; cheap enough to
// call from the drag handler on every input event, unlike the full renderChrome()
function updateTimeBar() {
  $("t-all").classList.toggle("on", S.timeAll);
  $("t-label").textContent = S.timeAll ? t("timeAll") : timePeriodLabel();
  $("t-range").value = timeYMIndex(S.year, S.month);
}
// the sticky header's real height varies (language, viewport width, redact hiding the Karte tab
// button); the TOC's position and each h2's scroll-margin-top read this instead of a guessed constant
function syncHeaderHeight() {
  document.documentElement.style.setProperty("--header-h", $$("header.top").offsetHeight + "px");
}
function buildRegionSelect() {
  const base = baseObs(), groups = { s: new Map(), c: new Map(), m: new Map() };
  for (const o of base) {
    const p = PL[o.p];
    for (const g of ["s", "c", "m"]) {
      const k = p.keys[g];
      if (!groups[g].has(k)) groups[g].set(k, { name: g === "s" ? stateName(p.state || "?") : g === "c" ? countyName(p.keys.c) : (p.muni || T.unknown), sp: new Set() });
      groups[g].get(k).sp.add(o.s);
    }
  }
  const opt = (g, k, v) => `<option value="${g}:${esc(k)}">${esc(v.name)} (${v.sp.size})</option>`;
  const grp = (g, title) => {
    const items = [...groups[g]].sort((a, b) => b[1].sp.size - a[1].sp.size);
    return `<optgroup label="${t(title)}">${items.map(([k, v]) => opt(g, k, v)).join("")}</optgroup>`;
  };
  const sel = $("f-region");
  sel.innerHTML = `<option value="all">${t("regionAll")}</option>` + grp("s", "grpState") + grp("c", "grpCounty") + (S.redact ? "" : grp("m", "grpMuni"));
  if (S.region.startsWith("p:") && PL[+S.region.slice(2)]) {
    sel.insertAdjacentHTML("beforeend", `<optgroup label="${t("grpPlace")}"><option value="${S.region}">${esc(PL[+S.region.slice(2)].name)}</option></optgroup>`);
  }
  sel.value = [...sel.options].some(o => o.value === S.region) ? S.region : "all";
  S.region = sel.value;
}
function applyRedact(on) {
  S.redact = on;
  $("o-redact").checked = on;
  $$('#tabs button[data-tab="map"]').hidden = on;
  if (on && /^[pm]:/.test(S.region)) S.region = "all";
  if (on && S.tab === "map") { S.tab = "overview"; }
  // drop everything rendered with place names; each tab re-renders when it is shown
  for (const id of ["tab-overview", "list-out", "tab-regions", "tab-targets"]) $(id).innerHTML = "";
  if (MAP_LAYER) MAP_LAYER.clearLayers();
  $("map-note").textContent = "";
  buildRegionSelect();
  syncHeaderHeight();
  setTab(S.tab);
}
function setTab(tab) {
  const apply = () => {
    // tabs share one scroll position (they're just toggled via display, not real navigation); reset
    // it on every switch so the new tab never opens wherever the previous one happened to be scrolled to
    window.scrollTo(0, 0);
    S.tab = tab;
    for (const b of $$all("#tabs button")) b.classList.toggle("on", b.dataset.tab === tab);
    for (const s of $$all("section.tab")) s.classList.toggle("on", s.id === "tab-" + tab);
    try { history.replaceState(null, "", "#" + tab); } catch (e) { /* file: URLs may refuse */ }
    renderActive();
  };
  // crossfades the switch where supported (Chrome/Edge); other browsers just apply it directly
  if (document.startViewTransition) document.startViewTransition(apply);
  else apply();
}
function renderActive() {
  ({ overview: renderOverview, list: renderList, regions: renderRegions, targets: renderTargets, activity: renderActivity, map: renderMap })[S.tab]();
}
function refreshAll() { buildRegionSelect(); renderActive(); }
// floating jump-to-section nav for the active tab: rebuilt from its own <h2> headings after every
// re-render (called at the end of each renderX()), so it never needs a hardcoded list per tab.
// Hidden when a tab has fewer than 2 headings (nothing worth jumping to).
function updateToc() {
  const headings = $$all(`#tab-${S.tab} h2`);
  const toc = $("toc");
  if (headings.length < 2) { toc.hidden = true; toc.innerHTML = ""; return; }
  toc.hidden = false;
  toc.innerHTML = `<div class="toc-label">${t("tocLabel")}</div>` + [...headings].map((h, i) => {
    // a short data-toc label wins when the heading sets one; otherwise its own text, minus any
    // trailing <small> count badge (e.g. "127")
    const label = h.dataset.toc || [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
    return `<button type="button" data-i="${i}" title="${esc(label)}">${esc(label)}</button>`;
  }).join("");
}

// (re-)sets every static label, option list and select value from the active language; safe to call again after a language switch
function renderChrome() {
  $("h-title").textContent = t("title");
  $("h-sub").textContent = t("subtitle", RAW.meta.source, fmtN(OBS.length)) + " · " + t("version", APP_VERSION);
  $("o-sum").textContent = t("optsSummary");
  $("o-theme-t").textContent = t("themeLabel");
  $("o-theme").innerHTML = ["system", "light", "dark"].map(v => `<option value="${v}">${t("theme" + v[0].toUpperCase() + v.slice(1))}</option>`).join("");
  $("o-theme").value = S.theme;
  $("o-escaped-t").textContent = t("optEscaped");
  $("o-collective-t").textContent = t("optCollective");
  $("o-redact-t").textContent = t("optRedact");
  $("o-redact-l").hidden = !!RAW.meta.redacted;
  $("q").placeholder = t("searchPh");
  $("tabs").innerHTML = [["overview", "tabOverview"], ["list", "tabList"], ["targets", "tabTargets"], ["activity", "tabActivity"], ["regions", "tabRegions"], ["map", "tabMap"]]
    .map(([k, l]) => `<button data-tab="${k}">${t(l)}</button>`).join("");
  for (const b of $$all("#tabs button")) b.classList.toggle("on", b.dataset.tab === S.tab);
  if (S.redact) $$('#tabs button[data-tab="map"]').hidden = true;
  $("f-lang").value = S.lang;
  $("f-region").setAttribute("aria-label", t("ariaRegion"));
  $("q-sort").setAttribute("aria-label", t("ariaSort"));
  $("q-atlas").setAttribute("aria-label", t("ariaAtlas"));
  $("m-metric").setAttribute("aria-label", t("ariaMapMetric"));
  $("t-all").textContent = t("timeAll");
  $("t-range").min = 0; $("t-range").max = timeYMIndex(MAX_Y, 12);
  $("t-range").setAttribute("aria-label", t("ariaTimePoint"));
  updateTimeBar();
  $("q-sort").innerHTML = ["nr", "taxon", "name"].map(k => `<option value="${k}">${t("sort" + k[0].toUpperCase() + k.slice(1))}</option>`).join("") + `<option value="" disabled>${t("sortColumn")}</option>`;
  $("q-sort").value = ["nr", "taxon", "name"].includes(S.sort) ? S.sort : "";
  $("q-atlas").innerHTML = Object.entries(T.atlasFilter).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("q-atlas").value = S.atlasF;
  $("b-pdf").textContent = t("pdf");
  $("m-metric").innerHTML = `<option value="life">${cutoffLabel("mapLiferAll", "mapLifer")}</option><option value="year">${t("mapYear", timePeriodLabel())}</option><option value="obs">${t("mapObs", timePeriodLabel())}</option><option value="lifer">${cutoffLabel("mapNewHereAll", "mapNewHere")}</option>`;
  $("m-metric").value = S.metric;
  syncHeaderHeight();
}
function applyLang(lang) {
  if (lang === S.lang) return;
  S.lang = lang;
  T = STR[lang];
  collator = new Intl.Collator(lang === "en" ? "en" : "de");
  try { localStorage.setItem("lifelist-lang", lang); } catch (e) { /* private mode may refuse */ }
  document.documentElement.lang = lang;
  document.title = t("title");
  renderChrome();
  buildRegionSelect();
  renderActive();
}
function applyTheme(theme) {
  if (theme === S.theme) return;
  S.theme = theme;
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("lifelist-theme", theme); } catch (e) { /* private mode may refuse */ }
  renderActive();  // canvas charts bake their colours in when drawn
}
function init() {
  document.documentElement.lang = S.lang;
  document.title = t("title");
  renderChrome();
  window.addEventListener("resize", syncHeaderHeight);

  $("tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setTab(b.dataset.tab); });
  $("toc").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const h = $$all(`#tab-${S.tab} h2`)[+b.dataset.i];
    if (h) h.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("f-lang").addEventListener("change", e => { applyLang(e.target.value); });
  $("f-region").addEventListener("change", e => { S.region = e.target.value; renderActive(); });
  $("o-theme").addEventListener("change", e => { applyTheme(e.target.value); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (S.theme === "system") renderActive(); });
  $("o-escaped").addEventListener("change", e => { S.escaped = e.target.checked; refreshAll(); });
  $("o-collective").addEventListener("change", e => { S.collective = e.target.checked; refreshAll(); });
  $("o-redact").addEventListener("change", e => { applyRedact(e.target.checked); });
  $("q").addEventListener("input", e => { S.q = e.target.value; renderList(); });
  $("q-sort").addEventListener("change", e => { S.sort = e.target.value; S.dir = S.sort === "nr" ? -1 : 1; renderList(); });
  $("act-out").addEventListener("change", e => {
    if (e.target.id === "a-metric") { S.actMetric = e.target.value; renderActivity(); }
  });
  $("q-atlas").addEventListener("change", e => { S.atlasF = e.target.value; renderList(); });
  $("t-all").addEventListener("click", () => {
    if (S.timeAll) return;
    S.timeAll = true;
    updateTimeBar();
    renderActive();
  });
  $("t-range").addEventListener("input", e => {
    const ym = timeYMFromIndex(+e.target.value);
    S.year = ym.y; S.month = ym.m; S.timeAll = false;
    updateTimeBar();
    // the active tab may still be loading (e.g. Leaflet); rAF-throttle redraws during the drag itself
    if (timeRAF) cancelAnimationFrame(timeRAF);
    timeRAF = requestAnimationFrame(() => { timeRAF = null; renderActive(); });
  });
  $("b-pdf").addEventListener("click", () => window.print());
  let printBackup = null;
  window.addEventListener("beforeprint", () => {
    // the report contains every section in full: no open detail rows, search, atlas filter, truncated region tables or wishlist source filter
    printBackup = { q: S.q, open: S.open, atlasF: S.atlasF, regAll: S.regAll, targetSrc: S.targetSrc, theme: document.documentElement.getAttribute("data-theme") };
    document.documentElement.setAttribute("data-theme", "light");  // paper is always light, also for the canvas charts
    S.q = ""; S.open = new Set(); S.atlasF = "all"; S.regAll = Object.fromEntries(LEVELS.map(lv => [lv.lvl, true])); S.targetSrc = "all";
    $("h-print").textContent = t("printed", new Date().toLocaleDateString(S.lang === "en" ? "en-GB" : "de-DE")) + (S.region === "all" ? "" : ", " + $("f-region").selectedOptions[0].text);
    renderOverview(); renderList(); renderTargets(); renderActivity(); renderRegions();
    // closed <details> keep their text hidden even from print CSS; afterprint re-renders them closed again
    for (const d of $$all("details.info")) d.open = true;
  });
  window.addEventListener("afterprint", () => {
    if (printBackup) {
      const { theme, ...state } = printBackup;
      if (theme) document.documentElement.setAttribute("data-theme", theme); else document.documentElement.removeAttribute("data-theme");
      Object.assign(S, state);
      printBackup = null;
    }
    renderActive();
  });
  $("m-metric").addEventListener("change", e => { S.metric = e.target.value; renderMap(); });
  $("tab-map").addEventListener("click", e => {
    const r = e.target.closest("[data-region]");
    if (r) { S.region = r.dataset.region; buildRegionSelect(); renderMap(); }
  });

  $("list-out").addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (th) {
      const k = th.dataset.sort;
      if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = k === "name" || k === "taxon" ? 1 : -1; }
      renderList(); return;
    }
    const tr = e.target.closest("tr.row");
    if (tr) { const s = +tr.dataset.sp; S.open.has(s) ? S.open.delete(s) : S.open.add(s); renderList(); }
  });
  $("tab-regions").addEventListener("click", e => {
    const th = e.target.closest("th[data-lvl]");
    if (th) {
      const cur = S.regSort[th.dataset.lvl] || { k: "life", d: -1 };
      S.regSort[th.dataset.lvl] = cur.k === th.dataset.k ? { k: cur.k, d: -cur.d } : { k: th.dataset.k, d: th.dataset.k === "name" ? 1 : -1 };
      renderRegions(); return;
    }
    const more = e.target.closest("[data-more]");
    if (more) { S.regAll[more.dataset.more] = !S.regAll[more.dataset.more]; renderRegions(); return; }
    const r = e.target.closest("[data-region]");
    if (r) {
      S.region = r.dataset.region;
      buildRegionSelect();
      setTab("overview");
    }
  });

  $("tab-targets").addEventListener("change", e => {
    if (e.target.id === "tgt-src") { S.targetSrc = e.target.value; renderTargets(); }
  });
  $("tab-targets").addEventListener("click", e => {
    const th = e.target.closest("th[data-k]");
    if (th) {
      const k = th.dataset.k;
      S.wishSort = S.wishSort.k === k ? { k, d: -S.wishSort.d } : { k, d: 1 };
      renderTargets(); return;
    }
    if (e.target.closest("#tgt-add")) {
      const input = $("tgt-search"), val = input.value.trim();
      if (val) {
        const match = EURO_BY_NAME.get(val.toLowerCase());
        const dup = S.customTargets.some(x => x.name.toLowerCase() === (match ? match.de : val).toLowerCase());
        if (!dup) S.customTargets.push(match ? { name: match.de, latin: match.latin } : { name: val, latin: null });
        saveCustomTargets();
        input.value = "";
        renderTargets();
      }
      return;
    }
    const rm = e.target.closest("[data-remove]");
    if (rm) { S.customTargets.splice(+rm.dataset.remove, 1); saveCustomTargets(); renderTargets(); }
  });

  if (S.redact) { $("o-redact").checked = true; $$('#tabs button[data-tab="map"]').hidden = true; }
  const hash = location.hash.slice(1);
  buildRegionSelect();
  const tabs = ["overview", "list", "targets", "activity", "regions"].concat(S.redact ? [] : ["map"]);
  setTab(tabs.includes(hash) ? hash : "overview");
}
init();
