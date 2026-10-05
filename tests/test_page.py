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
        # several merged exports
        path = os.path.join(cls.tmp.name, "multi.html")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(lifelist.render_html(lifelist.build_page_data(sample_export(), ["export_2024.json", "export_2023.json"], False)))
        cls.url["multi"] = "file:///" + path.replace(os.sep, "/").lstrip("/")
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
        # a fourth day: phone GPS along the way, birds marked 300 m off to the east; the stops follow the GPS
        for i in range(2):
            walk.append(sighting(["Parus major", "Turdus merula"][i], ["Kohlmeise", "Amsel"][i], "2024-05-04", place_id="F",
                                 place="Mit GPS", lat="51.4000", lon="14.8000", time=["09:00", "09:06"][i], **near))
            walk[-1]["observers"][0].update({"gps_lat": ["51.4000", "51.4050"][i], "gps_lon": "14.8000",
                                             "coord_lat": ["51.4000", "51.4050"][i], "coord_lon": "14.8043", "precision": "precise"})
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

    def test_subtitle_names_the_export_files(self):
        self.assertIn("export_test.json", self.open().inner_text("#h-sub"))
        self.assertNotIn("export_test", self.open(redact=True).inner_text("#h-sub"))
        page = self.open(redact="multi")
        self.assertIn("2 Exportdateien", page.inner_text("#h-sub"))
        self.assertEqual(page.get_attribute("#h-sub", "title"), "export_2023.json\nexport_2024.json")
        self.assertEqual(self.errors, [])

    def test_all_time_resets_the_overview(self):
        page = self.open()

        def settled(sel):
            # the text once it stops changing: tab switches (a view transition) and time bar redraws (the next
            # animation frame) finish later, so first let those frames pass, then wait for two equal reads
            page.evaluate("""() => new Promise(done => {
                const frames = () => requestAnimationFrame(() => requestAnimationFrame(done));
                (document.getAnimations ? Promise.all(document.getAnimations().map(a => a.finished)) : Promise.resolve()).then(frames, frames);
            })""")
            prev = None
            for _ in range(40):
                text = page.inner_text(sel)
                if text == prev:
                    return text
                prev = text
                page.wait_for_timeout(100)
            return prev
        # both tabs always show one year (calendar, "new in", NEU badges): "Gesamt" takes them back to the current one
        for tab in ("list", "overview"):
            page.click(f'#tabs button[data-tab="{tab}"]')
            start = settled(f"#tab-{tab}")
            page.eval_on_selector("#t-range", "e => { e.value = 0; e.dispatchEvent(new Event('input')); }")
            self.assertNotEqual(settled(f"#tab-{tab}"), start, tab)
            page.click("#t-all")
            self.assertEqual(settled(f"#tab-{tab}"), start, tab)
        # with "Gesamt" on, a click on the thumb itself (no value change) still picks that point in time
        box = page.locator("#t-range").bounding_box()
        value, maxv = page.eval_on_selector("#t-range", "e => [+e.value, +e.max]")
        page.mouse.click(box["x"] + 8 + (box["width"] - 16) * value / maxv, box["y"] + box["height"] / 2)
        page.wait_for_timeout(100)
        self.assertNotEqual(page.inner_text("#t-label"), "Gesamt")
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
        total = int(page.inner_text("#tab-targets h2:nth-of-type(2) small"))
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
        page.evaluate("S.printTabs.add('targets')")  # only the tabs chosen for printing are drawn for it
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

    def test_calendar_is_one_run_of_weeks(self):
        page = self.open()
        # every day of the year once, in date order, in one grid (not one block per month)
        days = page.evaluate("""() => { const y = S.year, n = Math.round((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5);
            return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, 0, 1 + i)).toISOString().slice(0, 10)).map(fmtD); }""")
        shown = page.evaluate("[...document.querySelectorAll('.cal-days > .cal-day:not(.cal-empty)')].map(d => d.dataset.tip.slice(0, 10))")
        self.assertEqual(shown, days)
        self.assertEqual(page.locator(".cal-months span").count(), 12)
        # the weeks are columns: the next day is below, and after a Sunday at the top of the next column
        pos = page.evaluate("""() => [...document.querySelectorAll('.cal-days > .cal-day')].slice(0, 14).map(d => { const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })""")
        self.assertEqual(pos[0][0], pos[1][0])
        self.assertGreater(pos[1][1], pos[0][1])
        self.assertGreater(pos[7][0], pos[0][0])
        self.assertEqual(pos[7][1], pos[0][1])
        # the edge between two months is one line each (eleven of them), over the grid and out of the pointer's way
        self.assertEqual(page.locator(".cal-edges path").count(), 11)
        self.assertEqual(page.evaluate("getComputedStyle(document.querySelector('.cal-edges')).pointerEvents"), "none")
        # every other month is a shade darker, and hovering a day lights up exactly its month
        self.assertEqual(page.evaluate("[...new Set([...document.querySelectorAll('.cal-day.m-odd')].map(d => d.dataset.m))].join()"), "2,4,6,8,10,12")
        self.assertEqual(page.locator(".cal-day.glow").count(), 0)
        day = page.locator(".cal-day[data-m='3']").nth(10)
        day.hover()
        month = page.evaluate("[...document.querySelectorAll('.cal-day[data-m=\"3\"]')].length")
        self.assertEqual(page.locator(".cal-day.glow").count(), month)
        self.assertEqual(page.evaluate("[...document.querySelectorAll('.cal-day.glow')].every(d => d.dataset.m === '3')"), True)
        self.assertTrue(page.evaluate("document.querySelector('.cal-days').classList.contains('glowing')"))
        # the space between two days in the middle of the month is no "outside": moving over it keeps the glow
        box = page.evaluate("""() => { const a = document.querySelectorAll('.cal-day.glow')[10].getBoundingClientRect(); return [a.left, a.top, a.width]; }""")
        for dx, dy in ((box[2], box[2] / 2), (box[2] / 2, box[2]), (box[2], box[2])):
            page.mouse.move(box[0] + dx, box[1] + dy)
            self.assertEqual(page.locator(".cal-day.glow").count(), month)
        page.mouse.move(2, 2)
        self.assertEqual(page.locator(".cal-day.glow").count(), 0)
        self.assertFalse(page.evaluate("document.querySelector('.cal-days').classList.contains('glowing')"))
        self.assertEqual(self.errors, [])

    def test_calendar_day_and_jumps_to_life_list(self):
        page = self.open()
        day = page.locator("button.cal-day").first
        day.click()
        self.assertIn(page.locator(".cal-panel b").first.inner_text(), day.get_attribute("data-tip"))
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
        cells = '#heat-ym tbody td[data-heat]:not(.tot)'
        cell = page.locator(cells).first
        cell.click()
        self.assertEqual(page.locator("#heat-ym .cal-panel").count(), 1)
        # counted by species by default: the cell's number is the number of species in its panel
        self.assertEqual(page.locator("#heat-ym .cal-panel .chip-sp").count(), int(cell.inner_text()))
        page.locator(cells).first.click()  # the same cell again closes it
        self.assertEqual(page.locator("#heat-ym .cal-panel").count(), 0)
        page.click('#tabs button[data-tab="activity"]')
        # keyboard works too, and the charts above are not redrawn
        page.wait_for_selector("#hour-card canvas")
        canvas = page.evaluate_handle("document.querySelector('#hour-card canvas')")
        page.locator('#heat-m tbody td[data-heat]:not(.tot)').first.focus()
        page.keyboard.press("Enter")
        self.assertGreater(page.locator("#heat-m .chip-sp").count(), 0)
        self.assertTrue(page.evaluate("c => c.isConnected", canvas))
        # each table keeps its own open cell
        page.locator('#heat-w tbody td[data-heat]:not(.tot)').first.click()
        self.assertGreater(page.locator("#heat-m .chip-sp").count(), 0)
        self.assertGreater(page.locator("#heat-w .chip-sp").count(), 0)
        page.locator("#heat-w .chip-sp").first.click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.locator("#list-out tr.detail").count(), 1)
        self.assertEqual(self.errors, [])

    def test_heat_tooltip_crosshair_totals_and_metric(self):
        page = self.open()
        cell = page.locator('#heat-ym tbody td[data-heat]:not(.tot)').first
        cell.hover()  # scrolls the cell into view, which hides the tooltip again ...
        page.wait_for_timeout(100)
        cell.hover(position={"x": 3, "y": 3})  # ... until the mouse moves on
        # a tooltip with all three counts, and the cell's row and column lit up
        self.assertTrue(page.is_visible("#tip"))
        self.assertRegex(page.inner_text("#tip"), r"\d+ Beobachtungen · \d+ Arten · \d+ Tage")
        self.assertGreater(page.locator("#heat-ym td.xh").count(), 12)
        # a row total opens the species of the whole row (a year), a column total those of a month in all years
        total = page.locator("#heat-ym tbody td.tot").first
        n = int(total.locator(".tot-n").inner_text().replace(".", ""))
        total.click()
        self.assertIn("gesamt", page.inner_text("#heat-ym .cal-panel-h"))
        self.assertEqual(page.locator("#heat-ym .cal-panel .chip-sp").count(), n)
        page.locator("#heat-ym tfoot td[data-heat]").first.click()
        self.assertIn("Januar, gesamt", page.inner_text("#heat-ym .cal-panel-h"))
        # the table counts what the picker says: observations are at least as many as species
        species = int(page.locator('#heat-ym tbody td[data-heat]:not(.tot)').first.inner_text())
        page.select_option('[data-heat-metric="ym"]', "obs")
        obs = int(page.locator('#heat-ym tbody td[data-heat]:not(.tot)').first.inner_text())
        self.assertGreater(obs, species)
        self.assertEqual(page.locator("#heat-ym .cal-panel").count(), 0)  # a new metric closes the open cell
        self.assertEqual(self.errors, [])

    def test_holiday_planner(self):
        page = self.open(hash="#targets")
        scopes = page.eval_on_selector_all("#plan-scope option", "os => os.map(o => o.value)")
        self.assertEqual(scopes[0], "de")
        # the districts under their federal states, most missing species with a good chance first
        states = page.locator("tr[data-plan-g]")
        self.assertGreater(states.count(), 10)
        self.assertEqual(page.locator("tr[data-plan-r]").count(), 0)
        good = [int(x) for x in page.eval_on_selector_all("tr[data-plan-g] td:nth-child(4)", "tds => tds.map(td => td.textContent)")]
        self.assertEqual(good, sorted(good, reverse=True))
        # a state counts each species once, so at least as many as its best district
        bavaria = page.locator('tr[data-plan-g="Bayern"]')
        state_good = int(bavaria.locator("td:nth-child(4)").inner_text())
        bavaria.click()
        districts = page.locator("tr[data-plan-r]")
        self.assertGreater(districts.count(), 5)
        self.assertLessEqual(districts.count(), 20)  # the best 20, the rest on request
        self.assertGreaterEqual(state_good, int(districts.first.locator("td:nth-child(4)").inner_text()))
        self.assertNotIn("Bayern", districts.first.locator("td:nth-child(2)").inner_text())  # not repeated under it
        page.click("[data-plan-gall]")
        self.assertGreater(page.locator("tr[data-plan-r]").count(), 20)
        page.locator("tr[data-plan-r]").first.click()
        self.assertGreater(page.locator("table.plan-sp tr").count(), 0)
        # the state's species, each with its best district
        page.click('[data-plan-gv="sp"]')
        self.assertIn("Garmisch-Partenkirchen", page.inner_text("table.plan-sp"))  # Alpenbraunelle's best district
        # a species seen in the sample export is not missing
        self.assertNotIn("Kohlmeise", page.inner_text("#plan-out"))
        # GBIF's Columba livia are Germany's feral pigeons: named like ornitho.de does
        self.assertEqual(page.evaluate("planData('de').species.find(s => s.latin === 'Columba livia').de"), "Straßentaube (Haustaube)")
        # every species has a German name, and GBIF's old-name duplicates are gone
        self.assertEqual(page.evaluate("planData('de').species.filter(s => !s.de).map(s => s.latin)"), [])
        self.assertFalse(page.evaluate("planData('de').species.some(s => ['Saxicola torquatus', 'Parus montanus', 'Ardea modesta'].includes(s.latin))"))
        # possible in every state: widespread, not a destination; a coastal bird is not
        self.assertTrue(page.evaluate("planData('de').species.find(s => s.latin === 'Columba livia').widespread"))
        self.assertFalse(page.evaluate("planData('de').species.find(s => s.latin === 'Haematopus ostralegus').widespread"))
        page.select_option("#plan-sort", "name")
        names = page.eval_on_selector_all("tr[data-plan-g] td:nth-child(2)", "tds => tds.map(td => td.textContent.replace(/[▸▾]/g, '').trim())")
        self.assertEqual(names[:3], ["Baden-Württemberg", "Bayern", "Berlin"])
        # a search lists the matching districts plainly
        page.fill("#plan-q", "Garmisch")
        self.assertEqual(page.locator("tr[data-plan-g]").count(), 0)
        self.assertEqual(page.locator("tr[data-plan-r]").count(), 1)
        page.fill("#plan-q", "")
        page.select_option("#plan-view", "sp")
        self.assertGreater(page.locator("#plan-out tbody tr").count(), 5)
        page.fill("#plan-q", "Alpenbraunelle")
        self.assertEqual(page.locator("#plan-out tbody tr").count(), 1)
        self.assertIn("Garmisch", page.inner_text("#plan-out"))
        page.fill("#plan-q", "")
        page.select_option("#plan-month", "1")
        self.assertTrue(page.inner_text("#plan-out").strip())
        page.select_option("#f-lang", "en")
        self.assertIn("Destinations", page.inner_text("#tab-targets"))
        self.assertEqual(self.errors, [])

    def test_rare_vagrants_source(self):
        _, wishlist, rare = lifelist.load_species_reference()
        names = {r[1] for r in rare}
        self.assertIn("Blauschwanz", names)
        self.assertNotIn("Habicht", names)  # on the wishlist under a newer genus
        self.assertFalse({w[0] for w in wishlist} & {r[0] for r in rare})
        page = self.open(hash="#targets")
        regular = int(page.inner_text("#tab-targets p.sub").split(" von ")[1].split()[0])
        self.assertGreater(regular, len(wishlist))  # widespread species off the wishlist (Bartmeise, Nilgans) join it
        page.select_option("#tgt-src", "rare")
        self.assertIn("Ausnahmegästen gesehen", page.inner_text("#tab-targets p.sub"))
        self.assertEqual(page.locator("#tab-targets > .bar").count(), 0)  # no progress bar for vagrants
        page.fill("#wish-q", "Blauschwanz")
        self.assertIn("Blauschwanz", page.inner_text("#wish-out"))
        self.assertEqual(page.locator("#wish-out .season-strip").count(), 1)  # its months from the GBIF data
        page.fill("#wish-q", "Nilgans")
        self.assertIn("Keine passende Art", page.inner_text("#wish-out"))
        page.fill("#wish-q", "Rothalsgans")  # widespread, but a vagrant: kept here by hand
        self.assertIn("Rothalsgans", page.inner_text("#wish-out"))
        # the destinations follow the source: only vagrants
        page.select_option("#plan-view", "sp")
        page.fill("#plan-q", "Blauschwanz")
        self.assertIn("Pinneberg", page.inner_text("#plan-out"))
        page.fill("#plan-q", "Nilgans")
        self.assertIn("Keine", page.inner_text("#plan-out"))
        self.assertEqual(self.errors, [])

    def test_heat_steps_hover_difference_and_range(self):
        page = self.open()
        cells = '#heat-ym tbody td[data-heat]:not(.tot)'
        # at most five colour steps, with a legend for each
        colours = set(page.eval_on_selector_all(cells, "tds => tds.map(td => td.style.background)"))
        self.assertLessEqual(len(colours), 5)
        steps = page.locator("#heat-ym .heat-steps .hs").count()
        self.assertTrue(len(colours) <= steps <= 5, (len(colours), steps))
        # hovering a cell shows the other cells of its row and column as the difference to it
        numbers = page.eval_on_selector_all(cells, "tds => tds.map(td => td.textContent)")
        hovered = page.locator(cells).nth(1)
        hovered.scroll_into_view_if_needed()
        hovered.hover()
        hovered.hover()
        v0 = int(hovered.get_attribute("data-v"))
        diffs = page.eval_on_selector_all("#heat-ym td.d-up, #heat-ym td.d-eq, #heat-ym td.d-down",
                                          "tds => tds.map(td => [+(td.dataset.v || 0), td.textContent, td.className])")
        # every other cell of the table, not only the hovered one's row and column
        self.assertEqual(len(diffs), page.locator("#heat-ym tbody td[data-r]").count() - 1)
        for v, text, cls in diffs:
            d = v - v0
            self.assertEqual(text, f"+{d}" if d > 0 else f"−{-d}" if d < 0 else "0")
            self.assertIn("d-up" if d > 0 else "d-down" if d < 0 else "d-eq", cls)
        # leaving the table puts the numbers back
        page.mouse.move(2, 2)
        self.assertEqual(page.eval_on_selector_all(cells, "tds => tds.map(td => td.textContent)"), numbers)
        self.assertEqual(page.locator("#heat-ym td.d-up, #heat-ym td.d-down, #heat-ym td.d-self").count(), 0)
        # dragging across cells opens the species of the whole range
        first, last = page.locator(cells).nth(0), page.locator(cells).nth(13)  # two rows, two months
        first.scroll_into_view_if_needed()
        a, b = first.bounding_box(), last.bounding_box()
        page.mouse.move(a["x"] + 5, a["y"] + 5)
        page.mouse.down()
        page.mouse.move(b["x"] + 5, b["y"] + 5, steps=5)
        page.mouse.up()
        self.assertIn(" – ", page.inner_text("#heat-ym .cal-panel-h"))
        self.assertEqual(page.locator("#heat-ym td.in-rng").count(), 4)
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
        cells = '#heat-rm tbody td[data-heat]:not(.tot)'
        cell = page.locator(cells).first
        days = int(cell.inner_text())  # counted by days by default
        cell.click()
        self.assertIn(f"{days} Tage", page.inner_text("#heat-rm .cal-panel-h"))
        page.select_option("#rm-level", "s")
        self.assertEqual(page.locator("#heat-rm .cal-panel").count(), 0)  # a new level closes the open cell
        self.assertEqual(rows.count(), 2)  # the fixture's two states
        # a species from the panel opens in the life list even when the page is filtered to another region
        page.select_option("#f-region", page.eval_on_selector_all("#f-region option", "os => os.map(o => o.value)")[1])
        page.click('#tabs button[data-tab="regions"]')
        page.locator(cells).last.click()
        page.locator("#heat-rm .chip-sp").first.click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.locator("#list-out tr.detail").count(), 1)
        self.assertEqual(self.errors, [])

    def test_species_from_another_region_widens_the_filter(self):
        page = self.open(redact="single", hash="#regions")
        sachsen = page.eval_on_selector_all("#f-region option", "os => os.find(o => o.text.startsWith('Sachsen')).value")
        page.select_option("#f-region", sachsen)
        page.select_option("#rm-level", "s")
        row = page.locator("table.heat.rm tr", has_text="Brandenburg")
        row.locator('td[data-key$="|2"]').click()  # March
        page.locator("#heat-rm .chip-sp", has_text="Elster").click()
        page.wait_for_function("S.tab === 'list'")
        self.assertEqual(page.evaluate("S.region"), "all")
        self.assertIn("Elster", page.inner_text("#list-out tr.row.flash"))
        self.assertEqual(self.errors, [])

    def test_tour_settings_diagram_and_names(self):
        page = self.open(redact="tours", hash="#tours")
        page.click("details.tour-settings summary")
        self.assertIn("Meldelücken bis 30 min | selten anhalten", page.inner_text("#tour-cfg-sum"))
        self.assertEqual(page.eval_on_selector('select[data-tour-preset="pauseLen"]', "s => s.selectedOptions[0].text"), "bis 30 min")
        page.click("details.tour-diagram summary")
        self.assertIn("Meldelücke", page.get_attribute("details.tour-diagram svg", "aria-label") + page.inner_text("details.tour-diagram"))
        self.assertTrue(page.locator("details.tour-diagram svg").is_visible())
        # the fold states survive the redraw of a language change, and the diagram follows the language
        page.select_option("#f-lang", "en")
        self.assertTrue(page.locator("details.tour-diagram svg").is_visible())
        self.assertEqual(page.get_attribute("details.tour-diagram svg", "aria-label"), "Tours: what the settings mean")
        self.assertEqual(self.errors, [])

    def test_sea_area_names(self):
        extra = sample_export() + [
            sighting("Pica pica", "Elster", "2024-03-10", place_id="S1", place="Kieler Bucht", municipality="Ostsee (SH, ASH)", lat="54.60", lon="10.50"),
            sighting("Pica pica", "Elster", "2024-03-11", place_id="S2", place="Doggerbank", municipality="Nordsee (NI, AWN)", lat="54.50", lon="6.50")]
        path = os.path.join(self.tmp.name, "sea.html")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(lifelist.render_html(lifelist.build_page_data(extra, "export_test.json", False)))
        self.url["sea"] = "file:///" + path.replace(os.sep, "/").lstrip("/")
        page = self.open(redact="sea")
        options = page.eval_on_selector_all("#f-region option", "os => os.map(o => o.textContent)")
        self.assertTrue(any(o.startswith("AWZ Ostsee (SH-Teil)") for o in options), options)
        self.assertTrue(any(o.startswith("AWZ Nordsee") for o in options), options)

    def test_tours_are_rebuilt_from_close_records(self):
        page = self.open(redact="tours", hash="#tours")
        # the fixture's tours are short: test the rules with small limits (the defaults are for real walks)
        page.evaluate("S.tourCfg = { mode: 'foot', pace: 'easy', pauseLen: 'short', pauseFreq: 'few', gap: 10, step: 1, speed: 0, win: 3, stop: 150, minKm: 0.5, minDur: 0 }; renderTours()")
        tours = page.evaluate("findTours(baseObs()).map(t => ({ d: t.d, stops: t.stops.map(s => [s.name, s.obs.length, s.lat, s.lon]), km: t.km }))")
        # the zigzag day: time windows follow the walk instead of hopping from bird to bird
        km = lambda win: page.evaluate(f"(S.tourCfg.win = {win}, findTours(baseObs()).find(t => t.d === '2024-05-03').km)")
        self.assertLess(km(15), 1.6)
        self.assertGreater(km(1), 5)
        page.evaluate("S.tourCfg.win = 3")
        # the GPS day: the stop is where the phone was, not the birds 300 m east
        gps_day = [t for t in tours if t["d"] == "2024-05-04"][0]
        self.assertAlmostEqual(gps_day["stops"][0][3], 14.8000, places=4)
        tours = [t for t in tours if t["d"] not in ("2024-05-03", "2024-05-04")]
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
        two = "sortTours(visibleTours()).map(t => t.d).filter(d => d < '2024-05-03')"
        self.assertEqual(page.evaluate(two), ["2024-05-01", "2024-05-02"])
        page.click('th[data-tour-sort="km"]')
        self.assertEqual(page.evaluate(two), ["2024-05-02", "2024-05-01"])
        page.click('th[data-tour-sort="date"]')
        page.locator("#tab-tours tr.row", has_text="01.05.2024").click()
        self.assertIn("Punkt A (3) → Punkt B (1)", page.inner_text("#tab-tours"))
        page.click("[data-route]")
        page.wait_for_function("S.tab === 'map'")
        self.assertEqual(page.locator(".route-stop").count(), 2)
        page.click('#tabs button[data-tab="tours"]')
        short = "findTours(baseObs()).filter(t => t.d < '2024-05-03')"

        def slide(k, v):
            page.evaluate("([k, v]) => { const e = document.querySelector(`[data-tour-cfg=\"${k}\"]`); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }", [k, v])
            page.wait_for_timeout(50)
        # the allowed distance grows with the time between records: at 60 km/h, C (3 km, 4 min after B) joins
        slide("speed", 60)
        self.assertEqual(page.evaluate(f"{short}.map(t => t.stops.length)"), [2, 3])
        slide("speed", 0)
        # a longer pause and base distance join C and D into the A-B tour
        slide("gap", 30)
        slide("step", 5)
        self.assertEqual(page.evaluate(f"{short}.map(t => t.stops.length)"), [2, 4])
        self.assertIn("angepasst", page.inner_text("#tour-cfg-sum"))
        # a minimum length drops the short ones, and the settings survive a reload
        slide("minKm", 1)
        self.assertEqual(page.evaluate(f"{short}.length"), 1)
        # and a minimum duration: the joined tour runs 07:00-07:29
        slide("minDur", 30)
        self.assertEqual(page.evaluate(f"{short}.length"), 0)
        slide("minDur", 0)
        page.reload()
        self.assertEqual(page.evaluate("[S.tourCfg.gap, S.tourCfg.step, S.tourCfg.minKm]"), [30, 5, 1])
        # the menu: a preset fills in all values, and "Standard" goes back to on foot, easy
        page.click('#tabs button[data-tab="tours"]')
        page.click("#tour-cfg-sum")
        page.select_option('[data-tour-preset="mode"]', "bike")
        page.select_option('[data-tour-preset="pace"]', "jaguar")
        self.assertEqual(page.evaluate("[S.tourCfg.speed, S.tourCfg.stop]"), [30, 400])
        self.assertEqual(page.input_value('[data-tour-cfg="speed"]'), "30")
        self.assertIn("Fahrrad | Jaguar", page.inner_text("#tour-cfg-sum"))
        # long and frequent pauses: a longer max. pause, a lower average speed
        page.select_option('[data-tour-preset="pauseLen"]', "long")
        page.select_option('[data-tour-preset="pauseFreq"]', "often")
        self.assertEqual(page.evaluate("[S.tourCfg.gap, S.tourCfg.speed]"), [60, 21])
        page.click("[data-tour-reset]")
        self.assertEqual(page.evaluate("S.tourCfg"), {"mode": "foot", "pace": "easy", "pauseLen": "short", "pauseFreq": "few", "speed": 4, "step": 0.5, "stop": 250,
                                                      "win": 15, "gap": 30, "minKm": 1, "minDur": 60})
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

    def test_map_rings_places_with_first_records(self):
        page = self.open(hash="#map")
        page.wait_for_timeout(500)
        # every place where a species was seen for the first time, and only those, has the ring
        expected = page.evaluate("""() => { const first = new Map();
            for (const o of regionObs(baseObs())) if (!first.has(o.s)) first.set(o.s, o.p);
            return new Set([...first.values()].filter(p => PL[p].lat)).size; }""")
        ringed = lambda: page.evaluate("MAP_LAYER.getLayers().filter(m => m.options.lifer).length")
        self.assertGreater(expected, 0)
        self.assertEqual(ringed(), expected)
        self.assertLessEqual(ringed(), page.evaluate("MAP_LAYER.getLayers().length"))
        self.assertIn("mit Erstbeobachtung", page.inner_text(".map-legend"))
        # zoomed out, the groups holding such a place carry the ring too
        page.evaluate("MAP.setZoom(5, { animate: false })")
        page.wait_for_timeout(600)
        self.assertGreater(page.locator("#map .marker-cluster-custom.has-lifer").count(), 0)
        # the ring follows the time bar: only first records up to the chosen month count
        page.eval_on_selector("#t-range", "e => { e.value = 3; e.dispatchEvent(new Event('input')); }")
        page.wait_for_timeout(300)
        until = page.evaluate("""() => { const first = new Map();
            for (const o of regionObs(baseObs())) if (!first.has(o.s)) first.set(o.s, o);
            return new Set([...first.values()].filter(o => PL[o.p].lat && (o.y < S.year || (o.y === S.year && o.m <= S.month))).map(o => o.p)).size; }""")
        self.assertEqual(ringed(), until)
        self.assertEqual(self.errors, [])

    def test_map_timelapse_plays_a_year_day_by_day(self):
        page = self.open(hash="#map")
        page.wait_for_timeout(500)
        normal = page.evaluate("MAP_LAYER.getLayers().length")
        self.assertFalse(page.is_visible("#tl-bar"))
        page.click("#m-tl")
        page.wait_for_timeout(300)
        self.assertTrue(page.is_visible("#tl-bar"))
        self.assertFalse(page.is_visible("#m-metric"))
        self.assertEqual(page.get_attribute("#m-tl", "aria-pressed"), "true")
        year = page.evaluate("S.tl.year")
        # the latest year with located records, drawn on a canvas layer of its own
        self.assertEqual(year, page.evaluate("Math.max(...OBS.filter(o => PL[o.p].lat).map(o => o.y))"))
        self.assertTrue(page.evaluate("MAP.hasLayer(TL_LAYER)"))
        self.assertGreater(page.evaluate("TL_MODEL.places.length"), 0)
        self.assertFalse(page.evaluate("MAP.hasLayer(MAP_LAYER)"))
        self.assertEqual(page.evaluate("document.querySelector('#tl-range').max"), "365" if year % 4 == 0 else "364")
        # a day of a visit: that place glows, and the canvas holds colour there
        painted = """() => { const c = TL_LAYER._canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }"""
        first = page.evaluate("Math.min(...TL_MODEL.places.map(p => p.visits[0].di))")
        day = page.evaluate("""() => { const v = TL_MODEL.places[0].visits[0]; tlShow(v.di); return v.di; }""")
        self.assertTrue(page.evaluate(f"TL_FRAME.some(f => f.lat === PL[TL_MODEL.places[0].p].lat && f.w > 0.4)"))
        self.assertGreater(page.evaluate(painted), 0)
        self.assertEqual(page.evaluate("S.tl.day"), day)
        self.assertEqual(page.input_value("#tl-range"), str(day))
        self.assertRegex(page.inner_text("#tl-date"), r"^\d\d\.\d\d\.%d$" % year)
        # before the year's first visit nothing glows and the canvas is clear
        if first > 0:
            page.evaluate(f"tlShow({first - 1})")
            self.assertEqual(page.evaluate("TL_FRAME.length"), 0)
            self.assertEqual(page.evaluate(painted), 0)
        # a visit's glow fades with the days after it, more slowly with a longer afterglow, and a first record's ring with it
        fade = page.evaluate("""() => { const v = [{ di: 10, n: 3, lifer: true }], g = (day, tau) => tlGlow(v, day, tau, 3);
            return { a: g(10, 30), b: g(24, 30), c: g(70, 30), slow: g(70, 365), short: g(24, 14), sum: tlGlow([...v, { di: 12, n: 3, lifer: false }], 12, 30, 3).w, one: g(12, 30).w }; }""")
        self.assertGreater(fade["a"]["w"], fade["b"]["w"])
        self.assertGreater(fade["b"]["w"], fade["c"]["w"])
        self.assertGreater(fade["c"]["w"], 0)
        self.assertGreater(fade["slow"]["w"], fade["c"]["w"])
        self.assertLess(fade["short"]["w"], fade["b"]["w"])
        self.assertGreater(fade["a"]["ring"], fade["b"]["ring"])
        self.assertGreater(fade["sum"], fade["one"] * 1.5)  # a second visit adds to the first
        # the blobs' size follows the zoom, within limits, whatever the day
        radii = page.evaluate("""() => { const r = z => { MAP.setZoom(z, { animate: false }); return tlRadius(51); };
            return [r(6), r(10), r(13), r(18)]; }""")
        self.assertEqual(radii[0], 10)
        self.assertGreater(radii[2], radii[1])
        self.assertEqual(radii[3], 140)
        # the afterglow is a setting
        page.select_option("#tl-glow", "90")
        self.assertEqual(page.evaluate("S.tl.glow"), 90)
        # playing moves the day on by itself, pausing keeps it, and the end stops it
        page.evaluate("tlShow(0); TL_POS = 0; S.tl.speed = 60")
        page.click("#tl-play")
        self.assertIn("Pause", page.inner_text("#tl-play"))
        page.wait_for_timeout(500)
        self.assertGreater(page.evaluate("S.tl.day"), 5)
        page.click("#tl-play")
        stopped = page.evaluate("S.tl.day")
        page.wait_for_timeout(300)
        self.assertEqual(page.evaluate("S.tl.day"), stopped)
        self.assertFalse(page.evaluate("S.tl.playing"))
        page.evaluate("TL_POS = TL_MODEL.n - 20")
        page.click("#tl-play")
        page.wait_for_function("!S.tl.playing", timeout=3000)
        self.assertEqual(page.evaluate("S.tl.day"), page.evaluate("TL_MODEL.n - 1"))
        # another year, then back to the normal map with its places
        other = page.evaluate("[...document.querySelector('#tl-year').options].map(o => +o.value).find(y => y !== S.tl.year)")
        page.select_option("#tl-year", str(other))
        page.wait_for_timeout(200)
        self.assertEqual(page.evaluate("S.tl.year"), other)
        self.assertEqual(page.evaluate("S.tl.day"), 0)
        page.click("#m-tl")
        page.wait_for_timeout(300)
        self.assertFalse(page.is_visible("#tl-bar"))
        self.assertTrue(page.is_visible("#m-metric"))
        self.assertEqual(page.evaluate("MAP_LAYER.getLayers().length"), normal)
        self.assertFalse(page.evaluate("MAP.hasLayer(TL_LAYER)"))
        self.assertEqual(self.errors, [])

    def test_map_timelapse_follows_one_species(self):
        page = self.open(hash="#map")
        page.wait_for_timeout(500)
        page.click("#m-tl")
        page.wait_for_timeout(300)
        everything = page.evaluate("TL_MODEL.places.length")
        # a species seen in more than one year, with a place: the suggestions offer it by name
        sp, name = page.evaluate("""() => { const years = new Map();
            for (const o of OBS) if (PL[o.p].lat) { if (!years.has(o.s)) years.set(o.s, new Set()); years.get(o.s).add(o.y); }
            const s = [...years].find(([, ys]) => ys.size > 1)[0]; return [s, speciesName(SP[s])]; }""")
        self.assertGreater(page.locator("#tl-suggest option").count(), 1)
        self.assertTrue(page.evaluate("n => [...document.querySelectorAll('#tl-suggest option')].some(o => o.value === n)", name))
        page.fill("#tl-sp", name)
        page.press("#tl-sp", "Enter")
        page.wait_for_timeout(300)
        self.assertEqual(page.evaluate("S.tl.sp"), sp)
        # only the places of that species in the year shown, a year it occurs in, and the bar counts records and places
        year = page.evaluate("S.tl.year")
        expected = page.evaluate(f"new Set(regionObs(baseObs()).filter(o => o.s === {sp} && o.y === S.tl.year && PL[o.p].lat).map(o => o.p)).size")
        self.assertEqual(page.evaluate("TL_MODEL.places.length"), expected)
        self.assertLessEqual(expected, everything)
        self.assertIn(year, page.evaluate(f"OBS.filter(o => o.s === {sp}).map(o => o.y)"))
        page.evaluate("tlShow(TL_MODEL.n - 1)")
        self.assertIn("Orte seit Jahresbeginn", page.inner_text("#tl-stats"))
        self.assertEqual(page.evaluate("TL_MODEL.cum[TL_MODEL.n - 1]"), expected)
        self.assertIn("Vögel", page.inner_text(".map-legend"))
        # the years offered are those of the species only
        offered = page.evaluate("[...document.querySelector('#tl-year').options].map(o => +o.value).sort()")
        self.assertEqual(offered, page.evaluate(f"[...new Set(OBS.filter(o => o.s === {sp} && PL[o.p].lat).map(o => o.y))].sort()"))
        # a name that is none goes back to the species; an emptied field means all species again
        page.fill("#tl-sp", "kein Vogel")
        page.press("#tl-sp", "Enter")
        self.assertEqual(page.input_value("#tl-sp"), name)
        self.assertEqual(page.evaluate("S.tl.sp"), sp)
        page.fill("#tl-sp", "")
        page.press("#tl-sp", "Enter")
        page.wait_for_timeout(300)
        self.assertIsNone(page.evaluate("S.tl.sp"))
        self.assertGreaterEqual(page.evaluate("TL_MODEL.places.length"), expected)
        self.assertEqual(page.evaluate("TL_MODEL.sp"), None)
        self.assertEqual(self.errors, [])

    def test_redacted_build_hides_map_and_places(self):
        page = self.open(redact=True)
        self.assertFalse(page.is_visible('#tabs button[data-tab="map"]'))
        self.assertNotIn("Teich am Wald", page.content())
        self.click_all_tabs(page, NO_PLACE_TABS)
        self.assertEqual(self.errors, [])

    def test_print_view_renders_every_tab(self):
        page = self.open()
        page.evaluate("S.printTabs = new Set(['overview', 'list', 'targets', 'activity', 'regions', 'tours'])")
        page.emulate_media(media="print")
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        for tab in NO_PLACE_TABS:
            self.assertTrue(page.inner_text(f"#tab-{tab}").strip(), tab)
        self.assertEqual(self.errors, [])
        self.assertTrue(page.eval_on_selector_all("details.info", "ds => ds.length > 0 && ds.every(d => d.open)"))
        # each tab starts a page under its name, and the life list curve is printed once (in the overview)
        self.assertEqual(page.get_attribute("#tab-list", "data-title"), "Lebensliste")
        self.assertEqual(page.eval_on_selector("#tab-targets", "e => getComputedStyle(e).breakBefore"), "page")
        self.assertEqual(page.eval_on_selector("#list-curve", "e => getComputedStyle(e).display"), "none")  # the overview has it
        # a heading and the info text under it stay with what follows
        self.assertEqual(page.eval_on_selector("h2 + details.info", "e => getComputedStyle(e).breakAfter"), "avoid")
        # no footer that could end up alone on a last page; the date and version stand in the header
        self.assertEqual(page.eval_on_selector("footer.meta-footer", "e => getComputedStyle(e).display"), "none")
        self.assertIn("Version", page.inner_text("#h-print"))

    def test_browser_console_stays_clean(self):
        page = self.open()
        # a page opened from disk remembers its tab without rewriting its own file: URL (Chrome warns about that)
        page.click('#tabs button[data-tab="regions"]')
        page.wait_for_timeout(200)
        self.assertEqual(page.evaluate("location.hash"), "")
        page.reload()
        page.wait_for_timeout(300)
        self.assertEqual(page.evaluate("S.tab"), "regions")
        # every form field has an id or a name (Chrome's autofill check)
        unnamed = "() => [...document.querySelectorAll('input, select, textarea')].filter(e => !e.id && !e.name).map(e => e.outerHTML.slice(0, 80))"
        for tab in TABS:
            page.click(f'#tabs button[data-tab="{tab}"]')
            page.wait_for_timeout(150)
            self.assertEqual(page.evaluate(unnamed), [], tab)
        page.click("#b-pdf")
        self.assertEqual(page.evaluate(unnamed), [])
        self.assertEqual(self.errors, [])

    def test_print_dialog_picks_the_tabs(self):
        page = self.open()
        page.click("#b-pdf")
        self.assertTrue(page.eval_on_selector("#print-dlg", "d => d.open"))
        # overview and life list until the viewer picks others; never the map
        boxes = page.eval_on_selector_all("#pd-tabs input", "is => is.map(i => [i.value, i.checked])")
        self.assertEqual([v for v, on in boxes if on], ["overview", "list"])
        self.assertNotIn("map", [v for v, _ in boxes])
        page.uncheck('#pd-tabs input[value="overview"]')
        page.check('#pd-tabs input[value="targets"]')
        page.click("#pd-cancel")
        self.assertFalse(page.eval_on_selector("#print-dlg", "d => d.open"))
        # the choice is remembered
        self.assertEqual(page.evaluate("JSON.parse(localStorage.getItem('lifelist-print-tabs'))"), ["list", "targets"])
        page.reload()
        page.wait_for_timeout(300)
        self.assertEqual(sorted(page.evaluate("[...S.printTabs]")), ["list", "targets"])
        # only the chosen tabs print; the first one right under the header, and the list keeps its curve without the overview
        page.emulate_media(media="print")
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        shown = page.eval_on_selector_all("div.tab", "bs => bs.filter(b => getComputedStyle(b).display !== 'none').map(b => b.id)")
        self.assertEqual(shown, ["tab-list", "tab-targets"])
        self.assertEqual(page.eval_on_selector("#tab-list", "e => getComputedStyle(e).breakBefore"), "auto")
        self.assertNotEqual(page.eval_on_selector("#list-curve", "e => getComputedStyle(e).display"), "none")
        # with nothing chosen there is nothing to print
        page.emulate_media(media="screen")
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        page.click("#b-pdf")
        page.uncheck('#pd-tabs input[value="list"]')
        page.uncheck('#pd-tabs input[value="targets"]')
        self.assertTrue(page.is_disabled("#pd-go"))
        self.assertEqual(self.errors, [])

    def test_charts_follow_theme_and_print_light(self):
        page = self.open(hash="#activity")
        grid = lambda: page.evaluate("BAR_CHARTS['weekday-card'].options.scales.y.grid.color")
        light = grid()
        page.click("#o-sum")
        page.select_option("#o-theme", "dark")
        dark = grid()
        self.assertNotEqual(light, dark)
        page.evaluate("S.printTabs.add('activity')")  # only the tabs chosen for printing are drawn for it
        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        self.assertEqual(grid(), light)
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        self.assertEqual(grid(), dark)
        self.assertEqual(page.get_attribute("html", "data-theme"), "dark")
        self.assertEqual(self.errors, [])


if __name__ == "__main__":
    unittest.main()
