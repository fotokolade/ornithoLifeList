"""Opens the generated page in headless Chromium and clicks through every tab in both languages.

Needs `pip install playwright` and `playwright install chromium`; skipped otherwise.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lifelist  # noqa: E402
from tests.fixtures import sample_export  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

TABS = ["overview", "list", "targets", "activity", "regions", "map"]


@unittest.skipIf(sync_playwright is None, "playwright not installed")
class PageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.url = {}
        for redact in (False, True):
            data = lifelist.build_page_data(sample_export(), "export_test.json", redact)
            path = os.path.join(cls.tmp.name, f"page{int(redact)}.html")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(lifelist.render_html(data))
            cls.url[redact] = "file:///" + path.replace(os.sep, "/").lstrip("/")
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.tmp.cleanup()

    def open(self, redact=False, hash="", height=900, width=1400):
        page = self.browser.new_page(viewport={"width": width, "height": height})
        self.errors = []
        page.on("pageerror", lambda e: self.errors.append(str(e)))
        # map tiles need the network; block them so the test is offline and fast
        page.route("**/*", lambda route: route.abort() if route.request.url.startswith("http") else route.continue_())
        page.goto(self.url[redact] + hash)
        page.wait_for_timeout(300)
        self.addCleanup(page.close)
        return page

    def click_all_tabs(self, page, tabs):
        for lang in ("de", "en"):
            page.select_option("#f-lang", lang)
            for tab in tabs:
                page.click(f'#tabs button[data-tab="{tab}"]')
                page.wait_for_timeout(150)
                self.assertTrue(page.inner_text(f"#tab-{tab}").strip(), f"{lang}/{tab} is empty")

    def test_all_tabs_render_without_errors(self):
        page = self.open()
        self.click_all_tabs(page, TABS)
        self.assertEqual(self.errors, [])

    def test_filters_and_time_bar(self):
        page = self.open()
        for tab in TABS:
            page.click(f'#tabs button[data-tab="{tab}"]')
            for value in ("0", "5", page.get_attribute("#t-range", "max")):
                page.eval_on_selector("#t-range", "(e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }", value)
                page.wait_for_timeout(50)
            page.click("#t-all")
            region = page.eval_on_selector_all("#f-region option", "os => os.map(o => o.value)")[1]
            page.select_option("#f-region", region)
            page.select_option("#f-region", "all")
        for box in ("o-escaped", "o-collective", "o-redact"):
            page.eval_on_selector(f"#{box}", "e => { e.checked = true; e.dispatchEvent(new Event('change')); }")
        self.click_all_tabs(page, TABS[:-1])
        self.assertEqual(self.errors, [])

    def test_life_list_search_and_detail(self):
        page = self.open(hash="#list")
        page.fill("#q", "meise")
        page.wait_for_timeout(100)
        rows = page.locator("#list-out tr.row")
        self.assertEqual(rows.count(), 2)
        rows.first.click()
        self.assertEqual(page.locator("#list-out tr.detail").count(), 1)
        self.assertEqual(self.errors, [])

    def test_wishlist_groups_fold_and_search(self):
        page = self.open(hash="#targets")
        species_rows = "#wish-out tbody tr:not(.grp)"
        total = int(page.inner_text("#tab-targets h2:last-of-type small"))
        # only the groups worth acting on now start open
        self.assertEqual(page.get_attribute('[data-grp="later"]', "aria-expanded"), "false")
        folded = page.locator(species_rows).count()
        self.assertLess(folded, total)
        page.click('[data-grp="later"]')
        self.assertGreater(page.locator(species_rows).count(), folded)
        # searching redraws only the table, so the field keeps its focus, and shows hits from folded groups too
        page.click('[data-grp="later"]')
        page.fill("#wish-q", "adler")
        self.assertEqual(page.evaluate("document.activeElement.id"), "wish-q")
        names = page.locator(f"{species_rows} td:first-child").all_inner_texts()
        self.assertTrue(names)
        self.assertTrue(all("adler" in n.lower() for n in names), names)
        page.fill("#wish-q", "zzzz")
        self.assertIn("Keine passende Art", page.inner_text("#wish-out"))
        # the printed report has every group open and no search
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        self.assertEqual(page.locator(species_rows).count(), total)
        self.assertEqual(self.errors, [])

    def test_wishlist_file_roundtrip(self):
        page = self.open(hash="#targets")
        page.fill("#tgt-search", "Seeadler")
        page.click("#tgt-add")
        with page.expect_download() as dl:
            page.click("#tgt-export")
        path = dl.value.path()
        # a fresh browser: the list is gone until the file is loaded again
        page.evaluate("localStorage.clear(); S.customTargets = []; renderTargets()")
        page.set_input_files("#tgt-import", path)
        page.wait_for_function("S.customTargets.length === 1")
        self.assertEqual(page.evaluate("S.customTargets[0].latin"), "Haliaeetus albicilla")
        self.assertEqual(page.evaluate("JSON.parse(localStorage.getItem('lifelist-custom-targets')).length"), 1)
        # loading it twice adds nothing; a foreign file is refused
        page.set_input_files("#tgt-import", path)
        page.wait_for_function("document.getElementById('tgt-io-msg').textContent !== ''")
        self.assertEqual(page.evaluate("S.customTargets.length"), 1)
        page.set_input_files("#tgt-import", {"name": "x.json", "mimeType": "application/json", "buffer": b'{"a": 1}'})
        page.wait_for_function("document.getElementById('tgt-io-msg').textContent.includes('keine')")
        self.assertEqual(self.errors, [])

    def test_calendar_day_and_jumps_to_life_list(self):
        page = self.open()
        day = page.locator("button.cal-day").first
        day.click()
        self.assertIn(page.locator(".cal-panel b").first.inner_text(), day.get_attribute("title"))
        name = page.locator(".cal-panel .chip-sp").first.inner_text().split("\n")[0]
        page.locator(".cal-panel .chip-sp").first.click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.locator("#list-out tr.detail").count(), 1)
        self.assertIn(name, page.locator("#list-out tr.row.flash").inner_text())
        # a curve dot and a "latest" row lead to their species too
        sp = int(page.locator("#list-curve g.dot").nth(2).get_attribute("data-sp"))
        page.locator("#list-curve g.dot").nth(2).click()
        self.assertEqual(page.evaluate("[...S.open]"), [sp])
        page.click('#tabs button[data-tab="overview"]')
        sp = int(page.locator("#tab-overview tr.row").first.get_attribute("data-sp"))
        page.locator("#tab-overview tr.row").first.click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.evaluate("[...S.open]"), [sp])
        self.assertEqual(self.errors, [])

    def test_heat_cells_open_their_species(self):
        page = self.open()
        cell = page.locator("td[data-ym]").first
        cell.click()
        self.assertEqual(page.locator("#tab-overview .cal-panel").count(), 1)
        self.assertEqual(page.locator("#tab-overview .cal-panel .chip-sp").count(), int(cell.inner_text()))
        page.locator("td[data-ym]").first.click()  # the same cell again closes it
        self.assertEqual(page.locator("#tab-overview .cal-panel").count(), 0)
        page.click('#tabs button[data-tab="activity"]')
        # keyboard works too, and the charts above are not redrawn
        page.wait_for_selector("#hour-card canvas")
        canvas = page.evaluate_handle("document.querySelector('#hour-card canvas')")
        page.locator('td[data-mh^="m:"]').first.focus()
        page.keyboard.press("Enter")
        self.assertGreater(page.locator("#act-cell-m .chip-sp").count(), 0)
        self.assertTrue(page.evaluate("c => c.isConnected", canvas))
        # only one hour-table cell is open at a time: the weekday table takes over the panel
        page.locator('td[data-mh^="w:"]').first.click()
        self.assertEqual(page.locator("#act-cell-m .chip-sp").count(), 0)
        self.assertGreater(page.locator("#act-cell-w .chip-sp").count(), 0)
        page.locator("#act-cell-w .chip-sp").first.click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.locator("#list-out tr.detail").count(), 1)
        self.assertEqual(self.errors, [])

    def test_region_coverage_has_its_own_picker(self):
        page = self.open(hash="#regions")
        region = page.eval_on_selector_all("#reg-cov option", "os => os.map(o => o.value)")[1]
        page.select_option("#reg-cov", region)
        # the choice is the header's too, and the section now lists what is missing there
        self.assertEqual(page.input_value("#f-region"), region)
        self.assertEqual(page.input_value("#reg-cov"), region)
        self.assertIn("gesehen", page.inner_text("#tab-regions"))
        self.assertEqual(self.errors, [])

    def test_weekday_chart_shows_share_of_days(self):
        page = self.open(hash="#activity")
        page.wait_for_selector("#weekday-card canvas")
        values = page.evaluate("BAR_CHARTS['weekday-card'].data.datasets[0].data")
        self.assertEqual(len(values), 7)
        self.assertTrue(all(0 <= v <= 100 for v in values), values)
        self.assertIn("%", page.inner_text(".wd-ring"))
        self.assertEqual(self.errors, [])

    def test_curve_follows_window_width_and_prints_full_size(self):
        page = self.open(width=390)
        width = lambda: page.eval_on_selector("#tab-overview svg.curve", "s => s.viewBox.baseVal.width")
        self.assertEqual(width(), 324)
        page.set_viewport_size({"width": 1400, "height": 900})
        page.wait_for_function("document.querySelector('#tab-overview svg.curve').viewBox.baseVal.width === 720")
        page.set_viewport_size({"width": 390, "height": 900})
        page.wait_for_function("document.querySelector('#tab-overview svg.curve').viewBox.baseVal.width === 324")
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        self.assertEqual(width(), 720)
        self.assertEqual(self.errors, [])

    def test_phone_width_has_no_sideways_scroll(self):
        page = self.open(width=390)
        for tab in TABS:
            page.click(f'#tabs button[data-tab="{tab}"]')
            page.wait_for_timeout(150)
            self.assertEqual(page.evaluate("document.documentElement.scrollWidth"), 390, tab)
        # every tab stays in view instead of running off the right edge
        right = page.eval_on_selector_all("#tabs button", "bs => Math.max(...bs.map(b => b.getBoundingClientRect().right))")
        self.assertLessEqual(right, 390)
        # the year/month table fits into its card without its own scrollbar
        page.click('#tabs button[data-tab="overview"]')
        self.assertTrue(page.eval_on_selector("table.heat.months", "t => t.scrollWidth <= t.parentElement.clientWidth"))
        self.assertEqual(self.errors, [])

    def test_footer_stays_on_top_of_map(self):
        # a low window puts the bottom of the map below the footer, so it can be scrolled up behind it
        page = self.open(hash="#map", height=600)
        # the tab switch runs a view transition whose overlay would answer elementFromPoint meanwhile
        page.evaluate("Promise.all(document.getAnimations().map(a => a.finished))")
        # scroll the map's attribution control (the one solid Leaflet element without tiles) behind the fixed footer
        covered = page.evaluate("""() => {
            document.body.style.paddingBottom = "2000px";
            const attr = document.querySelector(".leaflet-control-attribution");
            const footer = document.querySelector("footer").getBoundingClientRect();
            const y = (footer.top + footer.bottom) / 2;
            let a = attr.getBoundingClientRect();
            window.scrollBy(0, (a.top + a.bottom) / 2 - y);
            a = attr.getBoundingClientRect();
            const hits = [];
            for (let x = a.left + 2; x < a.right; x += 10) {
                if (!document.elementFromPoint(x, y).closest("footer")) hits.push(Math.round(x));
            }
            return hits;
        }""")
        self.assertEqual(covered, [])

    def test_map_legend_cluster_key_follows_clusters(self):
        page = self.open(hash="#map")
        state = """() => [!!document.querySelector("#map .marker-cluster-custom"),
                          document.querySelector(".map-legend").classList.contains("no-cluster")]"""
        for zoom in (5, 15):
            page.evaluate(f"MAP.setZoom({zoom}, {{ animate: false }})")
            page.wait_for_timeout(600)
            has_cluster, key_hidden = page.evaluate(state)
            self.assertEqual(has_cluster, zoom == 5)
            self.assertEqual(key_hidden, not has_cluster)
        self.assertEqual(self.errors, [])

    def test_redacted_build_hides_map_and_places(self):
        page = self.open(redact=True)
        self.assertFalse(page.is_visible('#tabs button[data-tab="map"]'))
        self.assertNotIn("Teich am Wald", page.content())
        self.click_all_tabs(page, TABS[:-1])
        self.assertEqual(self.errors, [])

    def test_print_view_renders_every_tab(self):
        page = self.open()
        page.emulate_media(media="print")
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        for tab in TABS[:-1]:
            self.assertTrue(page.inner_text(f"#tab-{tab}").strip(), tab)
        self.assertEqual(self.errors, [])
        self.assertTrue(page.eval_on_selector_all("details.info", "ds => ds.length > 0 && ds.every(d => d.open)"))

    def test_charts_follow_theme_and_print_light(self):
        page = self.open(hash="#activity")
        grid = lambda: page.evaluate("BAR_CHARTS['weekday-card'].options.scales.y.grid.color")
        light = grid()
        page.click("#o-sum")
        page.select_option("#o-theme", "dark")
        dark = grid()
        self.assertNotEqual(light, dark)
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        self.assertEqual(grid(), light)
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        self.assertEqual(grid(), dark)
        self.assertEqual(page.get_attribute("html", "data-theme"), "dark")
        self.assertEqual(self.errors, [])


if __name__ == "__main__":
    unittest.main()
