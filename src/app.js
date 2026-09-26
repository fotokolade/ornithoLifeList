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
// the map and the tours show where you were: both are hidden without place data
const PLACE_TABS = ["tours", "map"];
const hidePlaceTabs = on => { for (const k of PLACE_TABS) $$(`#tabs button[data-tab="${k}"]`).hidden = on; };
function applyRedact(on) {
  S.redact = on;
  $("o-redact").checked = on;
  hidePlaceTabs(on);
  if (on && /^[pm]:/.test(S.region)) S.region = "all";
  if (on && PLACE_TABS.includes(S.tab)) { S.tab = "overview"; }
  // drop everything rendered with place names; each tab re-renders when it is shown
  for (const id of ["tab-overview", "list-out", "tab-regions", "tab-targets", "tab-tours"]) $(id).innerHTML = "";
  S.tourRoute = null;
  if (MAP_LAYER) MAP_LAYER.clearLayers();
  if (MAP_ROUTE) MAP_ROUTE.clearLayers();  // the tour's stops carry place names in their tooltips
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
  ({ overview: renderOverview, list: renderList, regions: renderRegions, targets: renderTargets, activity: renderActivity, tours: renderTours, map: renderMap })[S.tab]();
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
  $("tabs").innerHTML = [["overview", "tabOverview"], ["list", "tabList"], ["targets", "tabTargets"], ["activity", "tabActivity"], ["regions", "tabRegions"], ["tours", "tabTours"], ["map", "tabMap"]]
    .map(([k, l]) => `<button data-tab="${k}">${t(l)}</button>`).join("");
  for (const b of $$all("#tabs button")) b.classList.toggle("on", b.dataset.tab === S.tab);
  if (S.redact) hidePlaceTabs(true);
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
  // the bird in the header pecks now and then, at random intervals of 6-16 s
  const logo = $("logo");
  const peck = () => {
    logo.classList.remove("peck");
    void logo.getBoundingClientRect();  // restart the animation even if the class was just there
    logo.classList.add("peck");
    setTimeout(peck, 6000 + Math.random() * 10000);
  };
  setTimeout(peck, 3000);
  // the life list curve is drawn for the window's width: redraw it once a resize or phone rotation settles
  // (only on a real width change, not when a phone's address bar merely changes the height)
  let curveW = curveWidth(), resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (curveWidth() === curveW) return;
      curveW = curveWidth();
      if (S.tab === "overview" || S.tab === "list") renderActive();
    }, 200);
  });

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
    // back to the start: the views that always show one year (calendar, "new in", the regions' year
    // and month columns) return to the current one instead of keeping the slider's
    S.timeAll = true; S.year = TIME_START.y; S.month = TIME_START.m;
    updateTimeBar();
    renderActive();
  });
  const pickTime = e => {
    const ym = timeYMFromIndex(+e.target.value);
    S.year = ym.y; S.month = ym.m; S.timeAll = false;
    updateTimeBar();
    // the active tab may still be loading (e.g. Leaflet); rAF-throttle redraws during the drag itself
    if (timeRAF) cancelAnimationFrame(timeRAF);
    timeRAF = requestAnimationFrame(() => { timeRAF = null; renderActive(); });
  };
  $("t-range").addEventListener("input", pickTime);
  // with "Gesamt" on, a click right on the thumb changes no value and so fires no input: leave "Gesamt" all the same
  $("t-range").addEventListener("pointerup", e => { if (S.timeAll) pickTime(e); });
  $("b-pdf").addEventListener("click", () => window.print());
  let printBackup = null;
  window.addEventListener("beforeprint", () => {
    // the report contains every section in full: no open detail rows, search, atlas filter, truncated region tables, wishlist source filter, search or folded groups
    printBackup = { q: S.q, open: S.open, atlasF: S.atlasF, regAll: S.regAll, targetSrc: S.targetSrc, wishQ: S.wishQ, wishOpen: S.wishOpen, theme: document.documentElement.getAttribute("data-theme") };
    document.documentElement.setAttribute("data-theme", "light");  // paper is always light, also for the canvas charts
    S.q = ""; S.open = new Set(); S.atlasF = "all"; S.regAll = Object.fromEntries(LEVELS.map(lv => [lv.lvl, true])); S.targetSrc = "all";
    S.wishQ = ""; S.wishOpen = new Set(WISH_GROUPS.map(([g]) => g));
    $("h-print").textContent = t("printed", new Date().toLocaleDateString(S.lang === "en" ? "en-GB" : "de-DE")) + (S.region === "all" ? "" : ", " + $("f-region").selectedOptions[0].text);
    curveForPrint = true;
    renderOverview(); renderList(); renderTargets(); renderActivity(); renderRegions();
    if (!S.redact) renderTours();
    // closed <details> keep their text hidden even from print CSS
    for (const d of $$all("details.info")) d.open = true;
  });
  window.addEventListener("afterprint", () => {
    curveForPrint = false;
    for (const d of $$all("details.info")) d.open = false;
    if (printBackup) {
      const { theme, ...state } = printBackup;
      if (theme) document.documentElement.setAttribute("data-theme", theme); else document.documentElement.removeAttribute("data-theme");
      Object.assign(S, state);
      printBackup = null;
    }
    renderActive();
  });
  $("m-metric").addEventListener("change", e => { S.metric = e.target.value; renderMap(); });
  $("tab-tours").addEventListener("toggle", e => {
    if (e.target.matches?.("details.tour-settings")) S.tourSetOpen = e.target.open;
    if (e.target.matches?.("details.tour-diagram")) S.tourDiagOpen = e.target.open;
  }, true);
  // sliders take effect while they move; the results redraw at most once per frame
  let tourRAF = 0;
  const redrawTours = () => {
    S.tourOpen = new Set(); S.tourRoute = null;
    cancelAnimationFrame(tourRAF);
    tourRAF = requestAnimationFrame(renderTourOut);
  };
  $("tab-tours").addEventListener("input", e => {
    const k = e.target.dataset?.tourCfg;
    if (!k) return;
    S.tourCfg[k] = +e.target.value;
    saveTourCfg();
    $(`tour-cfg-${k}-v`).textContent = tourCfgValue(k);
    $("tour-cfg-sum").innerHTML = tourCfgSummary();
    redrawTours();
  });
  $("tab-tours").addEventListener("change", e => {
    const preset = e.target.dataset?.tourPreset;
    if (!preset) return;
    // a new choice fills in all numbers again
    const sel = { mode: S.tourCfg.mode, pace: S.tourCfg.pace, pauseLen: S.tourCfg.pauseLen, pauseFreq: S.tourCfg.pauseFreq };
    sel[/** @type {"mode"|"pace"|"pauseLen"|"pauseFreq"} */ (preset)] = e.target.value;
    S.tourCfg = tourPreset(sel);
    saveTourCfg();
    syncTourSettings();
    redrawTours();
  });
  $("tab-tours").addEventListener("click", e => {
    const th = e.target.closest("th[data-tour-sort]");
    if (th) {
      const k = th.dataset.tourSort;
      // a new column starts with the biggest (or, for the time of day, earliest) first
      S.tourSort = S.tourSort.k === k ? { k, d: /** @type {1|-1} */ (-S.tourSort.d) } : { k, d: k === "time" ? 1 : -1 };
      renderTourOut(); return;
    }
    if (e.target.closest("[data-tour-reset]")) { S.tourCfg = { ...TOUR_DEFAULTS }; saveTourCfg(); syncTourSettings(); redrawTours(); return; }
    const route = e.target.closest("[data-route]");
    if (route) { S.tourRoute = route.dataset.route; setTab("map"); return; }
    if (e.target.closest("[data-tours-all]")) { S.tourAll = !S.tourAll; renderTourOut(); return; }
    const sp = e.target.closest("[data-sp]");
    if (sp) { openSpecies(+sp.dataset.sp); return; }
    const tr = e.target.closest("tr.row[data-tour]");
    if (tr) { const k = tr.dataset.tour; S.tourOpen.has(k) ? S.tourOpen.delete(k) : S.tourOpen.add(k); renderTourOut(); }
  });
  $("tab-map").addEventListener("click", e => {
    if (e.target.closest("[data-route-off]")) { S.tourRoute = null; renderMap(); return; }
    const r = e.target.closest("[data-region]");
    if (r) { S.region = r.dataset.region; buildRegionSelect(); renderMap(); }
  });

  // the redraw replaces the clicked calendar day or table cell; put the keyboard focus back on its replacement
  const refocus = sel => { const el = $$(sel); if (el) el.focus({ preventScroll: true }); };
  $("tab-overview").addEventListener("click", e => {
    const day = e.target.closest("[data-day]");
    if (day) {
      S.calDay = S.calDay === day.dataset.day ? null : day.dataset.day; renderOverview();
      refocus(`#tab-overview .cal-day[data-day="${day.dataset.day}"]`); return;
    }
    const sp = e.target.closest("[data-sp]");
    if (sp) openSpecies(+sp.dataset.sp);
  });
  $("act-out").addEventListener("click", e => {
    const sp = e.target.closest("[data-sp]");
    if (sp) openSpecies(+sp.dataset.sp);
  });
  // heat tables (heat.js): a cell or total opens its species, a second click closes them; the picker changes what they count
  let heatDragged = false;  // a drag just selected a range: the click that ends it opens nothing else
  $$("main").addEventListener("click", e => {
    if (heatDragged) { heatDragged = false; return; }
    const cell = e.target.closest("[data-heat]");
    if (!cell) return;
    const kind = cell.dataset.heat, key = cell.dataset.key;
    S.heatSel[kind] = S.heatSel[kind] === key ? null : key;
    redrawHeat(kind);
    refocus(`td[data-heat="${kind}"][data-key="${CSS.escape(key)}"]`);
  });
  $$("main").addEventListener("change", e => {
    const kind = e.target.dataset?.heatMetric;
    if (!kind) return;
    S.heatMetric[kind] = e.target.value;
    S.heatSel[kind] = null;
    redrawHeat(kind);
  });
  // dragging across heat cells with the mouse selects a range and opens its species
  let drag = null;
  const cellAt = el => el?.closest?.("table.heat-x tbody td[data-r]");
  const markDrag = () => {
    for (const td of drag.table.querySelectorAll("td.rng")) td.classList.remove("rng");
    const [r0, r1] = [Math.min(drag.r0, drag.r1), Math.max(drag.r0, drag.r1)], [c0, c1] = [Math.min(drag.c0, drag.c1), Math.max(drag.c0, drag.c1)];
    for (const td of drag.table.querySelectorAll("tbody td[data-r]"))
      if (+td.dataset.r >= r0 && +td.dataset.r <= r1 && +td.dataset.c >= c0 && +td.dataset.c <= c1) td.classList.add("rng");
  };
  $$("main").addEventListener("pointerdown", e => {
    const td = cellAt(e.target);
    if (!td || e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { kind: td.closest(".heat-wrap").id.slice(5), table: td.closest("table"), r0: +td.dataset.r, c0: +td.dataset.c, r1: +td.dataset.r, c1: +td.dataset.c };
    e.preventDefault();  // no text selection while dragging
  });
  document.addEventListener("pointermove", e => {
    if (!drag) return;
    const td = cellAt(document.elementFromPoint(e.clientX, e.clientY));
    if (!td || td.closest("table") !== drag.table || (+td.dataset.r === drag.r1 && +td.dataset.c === drag.c1)) return;
    drag.r1 = +td.dataset.r; drag.c1 = +td.dataset.c;
    markDrag();
  });
  document.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.r0 === d.r1 && d.c0 === d.c1) return;  // a plain click: the click handler opens the cell
    const rows = HEATS[d.kind].rows;
    S.heatSel[d.kind] = heatRangeKey(rows[d.r0], rows[d.r1], d.c0, d.c1);
    heatDragged = true;
    setTimeout(() => { heatDragged = false; });  // in case no click follows (the mouse left the table)
    redrawHeat(d.kind);
  });
  // a styled tooltip for everything with a data-tip (heat cells, calendar days), and a crosshair on the
  // hovered heat cell's row and column
  const tip = document.createElement("div");
  tip.id = "tip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  document.body.append(tip);
  let crossed = [];
  const placeTip = (x, y) => {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(innerWidth - w - 6, x + 14)) + "px";
    tip.style.top = (y + h + 22 > innerHeight ? y - h - 12 : y + 18) + "px";
  };
  // shown from the element under the mouse on every move, so it comes back after a scroll hid it
  const showTip = e => {
    const el = /** @type {any} */ (e.target).closest?.("[data-tip]");
    if (!el) { tip.hidden = true; return; }
    if (tip.textContent !== el.dataset.tip) tip.textContent = el.dataset.tip;
    tip.hidden = false;
    placeTip(e.clientX, e.clientY);
  };
  document.addEventListener("mousemove", showTip);
  // every other cell of the hovered cell's table shows the difference to it: +4 green, 0 grey, −10 red;
  // the crosshair still marks the hovered cell's row and column
  /** @type {any[]} */
  let diffed = [], hovered = null;
  const clearDiff = () => {
    for (const c of diffed) { c.classList.remove("d-up", "d-eq", "d-down", "d-self"); c.textContent = c.dataset.o; delete c.dataset.o; }
    diffed = [];
  };
  document.addEventListener("mouseover", e => {
    showTip(e);
    const cell = /** @type {any} */ (e.target).closest?.("table.heat-x td, table.heat-x th") || null;
    if (cell === hovered) return;  // moving within the same cell
    hovered = cell;
    for (const c of crossed) c.classList.remove("xh");
    crossed = [];
    clearDiff();
    if (cell) {
      if (cell.parentElement.parentElement.tagName !== "THEAD") crossed.push(...cell.parentElement.children);
      if (cell.dataset.c !== undefined) crossed.push(...cell.closest("table").querySelectorAll(`[data-c="${cell.dataset.c}"]`));
      for (const c of crossed) c.classList.add("xh");
      if (cell.matches("tbody td[data-r]")) {
        const v0 = +(cell.dataset.v || 0);
        // the hovered cell itself shows its value, also in the tables that write no numbers
        cell.dataset.o = cell.textContent;
        cell.textContent = fmtN(v0);
        cell.classList.add("d-self");
        diffed.push(cell);
        for (const c of cell.closest("tbody").querySelectorAll("td[data-r]")) {
          if (c === cell) continue;
          const d = +(c.dataset.v || 0) - v0;
          c.dataset.o = c.textContent;
          c.textContent = d > 0 ? `+${fmtN(d)}` : d < 0 ? `−${fmtN(-d)}` : "0";
          c.classList.add(d > 0 ? "d-up" : d < 0 ? "d-down" : "d-eq");
          diffed.push(c);
        }
      }
    }
  });
  document.addEventListener("focusin", e => {
    const el = /** @type {any} */ (e.target).closest?.("[data-tip]");
    if (!el) { tip.hidden = true; return; }
    const r = el.getBoundingClientRect();
    tip.textContent = el.dataset.tip; tip.hidden = false; placeTip(r.left, r.bottom - 10);
  });
  document.addEventListener("scroll", () => { tip.hidden = true; }, true);
  // table cells that open a details panel (role="button") and the planner's destinations react to Enter/Space like real buttons
  document.addEventListener("keydown", e => {
    const el = /** @type {any} */ (e.target);
    if (el.matches?.('td[role="button"], tr[data-plan-r], tr[data-plan-g]') && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
  });
  $("list-curve").addEventListener("click", e => {
    const sp = e.target.closest("[data-sp]");
    if (sp) openSpecies(+sp.dataset.sp);
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
  $("tab-regions").addEventListener("change", e => {
    if (e.target.id === "reg-cov") { S.region = e.target.value; $("f-region").value = S.region; renderRegions(); }
    if (e.target.id === "rm-level") { S.regMonthLvl = e.target.value; S.heatSel.rm = null; renderRegions(); }
  });
  $("tab-regions").addEventListener("click", e => {
    const sp = e.target.closest("[data-sp]");
    if (sp) { openSpecies(+sp.dataset.sp); return; }
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
    if (e.target.id === "plan-scope") { S.plan.scope = e.target.value; S.plan.open = S.plan.openG = null; S.plan.all = false; renderTargets(); }
    if (e.target.id === "plan-sort") { S.plan.sort = e.target.value === "name" ? "name" : "n"; redrawPlanner(); }
    if (e.target.id === "plan-month") { S.plan.month = +e.target.value; S.plan.all = false; renderTargets(); }
    if (e.target.id === "plan-view") { S.plan.view = e.target.value === "sp" ? "sp" : "dest"; S.plan.q = ""; S.plan.all = false; renderTargets(); }
    if (e.target.id === "tgt-import" && e.target.files[0]) {
      e.target.files[0].text().then(text => {
        const res = importCustomTargets(text);
        renderTargets();
        // a file without a single usable species is no wishlist either, not "all already on the list"
        $("tgt-io-msg").textContent = !res || !res.total ? t("wishImportBad") : !res.added ? t("wishImportedNone")
          : t(res.added === res.total ? "wishImported" : "wishImportedSome", res.added, res.total);
      }, () => { $("tgt-io-msg").textContent = t("wishImportBad"); });
    }
  });
  // the "load" label acts as a button for the keyboard too
  $("tab-targets").addEventListener("keydown", e => {
    if (e.target.matches?.("label.lnk") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); $("tgt-import").click(); }
  });
  $("tab-targets").addEventListener("input", e => {
    if (e.target.id === "wish-q") { S.wishQ = e.target.value; $("wish-out").innerHTML = wishTableHtml(); }
    if (e.target.id === "plan-q") { S.plan.q = e.target.value; redrawPlanner(); }
  });
  $("tab-targets").addEventListener("click", e => {
    const state = e.target.closest("[data-plan-g]");
    if (state) { S.plan.openG = S.plan.openG === state.dataset.planG ? null : state.dataset.planG; S.plan.open = null; S.plan.gall = false; redrawPlanner(); return; }
    if (e.target.closest("[data-plan-gall]")) { S.plan.gall = !S.plan.gall; redrawPlanner(); return; }
    const gv = e.target.closest("[data-plan-gv]");
    if (gv) { S.plan.gview = gv.dataset.planGv === "sp" ? "sp" : "d"; redrawPlanner(); return; }
    const dest = e.target.closest("[data-plan-r]");
    if (dest) { S.plan.open = S.plan.open === dest.dataset.planR ? null : dest.dataset.planR; redrawPlanner(); return; }
    if (e.target.closest("[data-plan-more]")) { S.plan.all = !S.plan.all; redrawPlanner(); return; }
    const grp = e.target.closest("[data-grp]");
    if (grp) { toggleWishGroup(grp.dataset.grp); return; }
    const th = e.target.closest("th[data-k]");
    if (th) {
      const k = th.dataset.k;
      S.wishSort = S.wishSort.k === k ? { k, d: -S.wishSort.d } : { k, d: 1 };
      renderTargets(); return;
    }
    if (e.target.closest("#tgt-export")) { exportCustomTargets(); return; }
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

  if (S.redact) { $("o-redact").checked = true; hidePlaceTabs(true); }
  const hash = location.hash.slice(1);
  buildRegionSelect();
  const tabs = ["overview", "list", "targets", "activity", "regions"].concat(S.redact ? [] : PLACE_TABS);
  setTab(tabs.includes(hash) ? hash : "overview");
}
init();
