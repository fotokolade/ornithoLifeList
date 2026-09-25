"""Opens the generated page in headless Chromium and clicks through every tab in both languages.

Needs `pip install playwright` and `playwright install chromium`; skipped otherwise.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lifelist  # noqa: E402
from tests.fixtures import SPECIES, sample_export, sighting  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

TABS = ["overview", "list", "targets", "activity", "regions", "tours", "map"]
NO_PLACE_TABS = TABS[:-2]  # tours and map are hidden without place data


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
        # plus one species seen in a single state only (every sample species occurs everywhere)
        extra = sample_export() + [sighting("Pica pica", "Elster", "2024-03-10", place_id="3", place="Flussaue",
                                            municipality="Anderort (BB, SPN)", lat="51.70", lon="14.30")]
        path = os.path.join(cls.tmp.name, "single.html")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(lifelist.render_html(lifelist.build_page_data(extra, "export_test.json", False)))
        cls.url["single"] = "file:///" + path.replace(os.sep, "/").lstrip("/")
        # tours: A -> B (600 m, 5 min later) is one; C is 3 km away and D comes 20 minutes later, so neither joins it
        near = dict(municipality="Musterdorf (SN, GR)")
        walk = [
            sighting("Parus major", "Kohlmeise", "2024-05-01", place_id="A", place="Punkt A", lat="51.1000", lon="14.5000", time="07:00", **near),
            # two more species at A's spot, 40 m and 80 m off: one stop with A, at their mean position
            sighting("Erithacus rubecula", "Rotkehlchen", "2024-05-01", place_id="A2", place="Punkt A", lat="51.1004", lon="14.5000", time="07:01", **near),
            sighting("Fringilla coelebs", "Buchfink", "2024-05-01", place_id="A3", place="Punkt A Rand", lat="51.1000", lon="14.5012", time="07:02", **near),
            sighting("Turdus merula", "Amsel", "2024-05-01", place_id="B", place="Punkt B", lat="51.1054", lon="14.5000", time="07:05", **near),
            sighting("Sitta europaea", "Kleiber", "2024-05-01", place_id="C", place="Punkt C", lat="51.1324", lon="14.5000", time="07:09", **near),
            sighting("Buteo buteo", "Mäusebussard", "2024-05-01", place_id="D", place="Punkt D", lat="51.1324", lon="14.5050", time="07:29", **near),
        ]
        # a second day, all records at one big place but reported with GPS along a 500 m walk: the GPS makes it a tour
        for i, (lat, tm) in enumerate([("51.2000", "08:00"), ("51.2050", "08:06")]):
            walk.append(sighting(["Parus major", "Turdus merula"][i], ["Kohlmeise", "Amsel"][i], "2024-05-02", place_id="E",
                                 place="Großes Gebiet", lat="51.2100", lon="14.6000", time=tm, **near))
            walk[-1]["observers"][0].update({"gps_lat": lat, "gps_lon": "14.6000"})
        # a third day: an hour's walk 1.2 km north, with the birds' points 150 m left and right of the way in turn
        for i in range(30):
            lat, lon = 51.3 + 0.0108 * i / 29, 14.7 + (0.0022 if i % 2 else -0.0022)
            walk.append(sighting(SPECIES[i % len(SPECIES)][0], SPECIES[i % len(SPECIES)][1], "2024-05-03", place_id=f"Z{i}",
                                 place="Zickzack", lat=f"{lat:.5f}", lon=f"{lon:.5f}", time=f"08:{2 * i:02d}", **near))
        path = os.path.join(cls.tmp.name, "tours.html")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(lifelist.render_html(lifelist.build_page_data(walk, "export_test.json", False)))
        cls.url["tours"] = "file:///" + path.replace(os.sep, "/").lstrip("/")
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
        self.click_all_tabs(page, NO_PLACE_TABS)
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

    def test_region_month_table(self):
        page = self.open(hash="#regions")
        rows = page.locator("table.heat.rm tbody tr")
        self.assertGreater(rows.count(), 0)
        cell = page.locator("td[data-rm]").first
        days = int(cell.inner_text())
        cell.click()
        self.assertIn(f"{days} Tage", page.inner_text("#rm-cell"))
        page.select_option("#rm-level", "s")
        self.assertEqual(page.locator("#rm-cell .cal-panel").count(), 0)  # a new level closes the open cell
        self.assertEqual(rows.count(), 2)  # the fixture's two states
        # a species from the panel opens in the life list even when the page is filtered to another region
        page.select_option("#f-region", page.eval_on_selector_all("#f-region option", "os => os.map(o => o.value)")[1])
        page.click('#tabs button[data-tab="regions"]')
        page.locator("td[data-rm]").last.click()
        page.locator("#rm-cell .chip-sp").first.click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.locator("#list-out tr.detail").count(), 1)
        self.assertEqual(self.errors, [])

    def test_species_from_another_region_widens_the_filter(self):
        page = self.open(redact="single", hash="#regions")
        sachsen = page.eval_on_selector_all("#f-region option", "os => os.find(o => o.text.startsWith('Sachsen')).value")
        page.select_option("#f-region", sachsen)
        page.select_option("#rm-level", "s")
        row = page.locator("table.heat.rm tr", has_text="Brandenburg")
        row.locator('td[data-rm^="2:"]').click()  # March
        page.locator("#rm-cell .chip-sp", has_text="Elster").click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.evaluate("S.region"), "all")
        self.assertIn("Elster", page.inner_text("#list-out tr.row.flash"))
        self.assertEqual(self.errors, [])

    def test_tours_are_rebuilt_from_close_records(self):
        page = self.open(redact="tours", hash="#tours")
        # the fixture's tours are short: test the rules with small limits (the defaults are for real walks)
        page.evaluate("S.tourCfg = { gap: 10, step: 1, win: 3, stop: 150, minKm: 0.5, minDur: 0 }; renderTours()")
        tours = page.evaluate("findTours(baseObs()).map(t => ({ d: t.d, stops: t.stops.map(s => [s.name, s.obs.length, s.lat, s.lon]), km: t.km }))")
        # the zigzag day: time windows follow the walk instead of hopping from bird to bird
        km = lambda win: page.evaluate(f"(S.tourCfg.win = {win}, findTours(baseObs()).find(t => t.d === '2024-05-03').km)")
        self.assertLess(km(15), 1.6)
        self.assertGreater(km(1), 5)
        page.evaluate("S.tourCfg.win = 3")
        tours = [t for t in tours if t["d"] != "2024-05-03"]
        self.assertEqual(len(tours), 2)
        gps_tour = tours[0]  # newest first
        self.assertEqual([st[0] for st in gps_tour["stops"]], ["Großes Gebiet", "Großes Gebiet"])
        self.assertAlmostEqual(gps_tour["km"], 0.56, delta=0.02)
        tours = tours[1:]
        (a_name, a_n, a_lat, a_lon), (b_name, b_n, _, _) = tours[0]["stops"]
        self.assertEqual((a_name, a_n, b_name, b_n), ("Punkt A", 3, "Punkt B", 1))
        self.assertAlmostEqual(a_lat, (51.1000 + 51.1004 + 51.1000) / 3, places=6)
        self.assertAlmostEqual(a_lon, (14.5000 + 14.5000 + 14.5012) / 3, places=6)
        self.assertAlmostEqual(tours[0]["km"], 0.59, delta=0.02)
        # sortable: longest first puts the 0.59 km tour above the 0.56 km one
        page.click('th[data-tour-sort="km"]')
        self.assertIn("▼", page.inner_text('th[data-tour-sort="km"]'))
        two = "sortTours(visibleTours()).map(t => t.d).filter(d => d !== '2024-05-03')"
        self.assertEqual(page.evaluate(two), ["2024-05-01", "2024-05-02"])
        page.click('th[data-tour-sort="km"]')
        self.assertEqual(page.evaluate(two), ["2024-05-02", "2024-05-01"])
        page.click('th[data-tour-sort="date"]')
        page.locator("#tab-tours tr.row", has_text="01.05.2024").click()
        self.assertIn("Punkt A (3) → Punkt B (1)", page.inner_text("#tab-tours"))
        page.click("[data-route]")
        page.wait_for_function("S.tab === 'map'")
        self.assertEqual(page.locator(".route-stop").count(), 2)
        # the limits can be changed: a longer pause and distance join C and D into the A-B tour
        page.click('#tabs button[data-tab="tours"]')
        page.fill('[data-tour-cfg="gap"]', "30")
        page.press('[data-tour-cfg="gap"]', "Enter")
        page.fill('[data-tour-cfg="step"]', "5")
        page.press('[data-tour-cfg="step"]', "Enter")
        self.assertEqual(page.evaluate("findTours(baseObs()).filter(t => t.d !== '2024-05-03').map(t => t.stops.length)"), [2, 4])
        # a minimum length drops the short ones, and the settings survive a reload
        page.fill('[data-tour-cfg="minKm"]', "1")
        page.press('[data-tour-cfg="minKm"]', "Enter")
        self.assertEqual(page.evaluate("findTours(baseObs()).filter(t => t.d !== '2024-05-03').length"), 1)
        # and a minimum duration: the joined tour runs 07:00-07:29
        page.fill('[data-tour-cfg="minDur"]', "30")
        page.press('[data-tour-cfg="minDur"]', "Enter")
        self.assertEqual(page.evaluate("findTours(baseObs()).filter(t => t.d !== '2024-05-03').length"), 0)
        page.fill('[data-tour-cfg="minDur"]', "0")
        page.press('[data-tour-cfg="minDur"]', "Enter")
        page.reload()
        self.assertEqual(page.evaluate("[S.tourCfg.gap, S.tourCfg.step, S.tourCfg.minKm]"), [30, 5, 1])
        page.click('#tabs button[data-tab="tours"]')
        page.click("[data-tour-reset]")
        self.assertEqual(page.evaluate("S.tourCfg"), {"gap": 30, "step": 0.5, "win": 15, "stop": 250, "minKm": 1, "minDur": 60})
        # no tours without place data
        page.click("#o-sum")
        page.check("#o-redact")
        self.assertFalse(page.is_visible('#tabs button[data-tab="tours"]'))
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
        self.click_all_tabs(page, NO_PLACE_TABS)
        self.assertEqual(self.errors, [])

    def test_print_view_renders_every_tab(self):
        page = self.open()
        page.emulate_media(media="print")
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        for tab in NO_PLACE_TABS:
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
