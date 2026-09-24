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

    def open(self, redact=False, hash="", height=900):
        page = self.browser.new_page(viewport={"width": 1400, "height": height})
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


if __name__ == "__main__":
    unittest.main()
