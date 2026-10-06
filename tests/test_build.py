import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lifelist  # noqa: E402
from tests.fixtures import sample_export, sighting  # noqa: E402


def build(sightings):
    return lifelist.build_data(sightings, {})


class SpeciesKeyTest(unittest.TestCase):
    def test_subspecies_folds_into_species(self):
        self.assertEqual(lifelist.species_key("Motacilla flava flavissima", "Schafstelze", False), ("Motacilla flava", False))

    def test_collective_taxa(self):
        for latin, name in [("Larus argentatus / michahellis", "Möwe"), ("Anser sp.", "Gans"),
                            ("Anas platyrhynchos x acuta", "Hybrid"), ("Aves", "Vogel unbestimmt"),
                            ("Parus", "Meise_oder_Kleiber")]:
            key, collective = lifelist.species_key(latin, name, False)
            self.assertTrue(collective, latin)
            self.assertTrue(key.endswith("|c"))

    def test_escape_keeps_own_taxon(self):
        self.assertEqual(lifelist.species_key("Anser anser", "Graugans", True), ("Anser anser|e", False))


class FieldParsingTest(unittest.TestCase):
    def test_minute_of_day(self):
        self.assertEqual(lifelist.minute_of_day({"timing": {"@notime": "0", "@ISO8601": "2024-05-01T07:45:00+02:00"}}), 465)
        self.assertEqual(lifelist.minute_of_day({"timing": {"@notime": "1", "@ISO8601": "2024-05-01T00:00:00+02:00"}}), -1)
        self.assertEqual(lifelist.minute_of_day({}), -1)

    def test_atlas_code(self):
        self.assertEqual(lifelist.atlas_code({"atlas_code": {"#text": "C13a"}}), "C13a")
        self.assertEqual(lifelist.atlas_code({"atlas_code": "B4"}), "B4")
        self.assertEqual(lifelist.atlas_code({}), "")

    def test_parse_municipality(self):
        self.assertEqual(lifelist.parse_municipality("Musterdorf (SN, GR)"), ("Musterdorf", "SN", "GR"))
        self.assertEqual(lifelist.parse_municipality("Ohne Kreis"), ("Ohne Kreis", "", ""))
        self.assertEqual(lifelist.parse_municipality(None), ("", "", ""))


class BuildDataTest(unittest.TestCase):
    def test_explicit_zero_count_is_dropped(self):
        data = build([sighting("Grus grus", "Kranich", "2024-03-01", count="0")])
        self.assertEqual(data["obs"], [])

    def test_zero_with_estimation_is_kept(self):
        data = build([sighting("Grus grus", "Kranich", "2024-03-01", count="0", estimation="NO_VALUE")])
        self.assertEqual(len(data["obs"]), 1)

    def test_species_flags(self):
        data = build([
            sighting("Parus major", "Kohlmeise", "2024-01-01"),
            sighting("Anser sp.", "Gans unbestimmt", "2024-01-01"),
            sighting("Cygnus atratus", "Trauerschwan", "2024-01-01", rarity="escaped"),
            sighting("Anser anser domestica", "Hausgans", "2024-01-01"),
        ])
        flags = {row[1]: row[3] for row in data["sp"]}
        self.assertEqual(flags["Parus major"], 0)
        self.assertEqual(flags["Anser sp."], lifelist.FLAG_COLLECTIVE)
        self.assertEqual(flags["Cygnus atratus"], lifelist.FLAG_ESCAPED)
        self.assertEqual(flags["Anser anser"], lifelist.FLAG_ESCAPED)

    def test_wild_sighting_clears_escape_flag(self):
        data = build([
            sighting("Cygnus atratus", "Trauerschwan", "2024-01-01", rarity="escaped"),
            sighting("Cygnus atratus", "Trauerschwan", "2024-02-01"),
        ])
        self.assertEqual([row[3] for row in data["sp"]], [lifelist.FLAG_ESCAPED, 0])

    def test_subspecies_share_one_taxon_with_species_name(self):
        data = build([
            sighting("Motacilla flava flavissima", "Englische Schafstelze", "2024-05-01", sys_order="20"),
            sighting("Motacilla flava", "Schafstelze", "2024-05-02", sys_order="10"),
        ])
        self.assertEqual(data["sp"], [["Schafstelze", "Motacilla flava", 10, 0, ""]])
        self.assertEqual({o[0] for o in data["obs"]}, {0})

    def test_observation_row(self):
        data = build([sighting("Parus major", "Kohlmeise", "2024-05-01", count="3", time="07:45", atlas="B4", photo=True)])
        self.assertEqual(data["obs"], [[0, "2024-05-01", 0, 3, 1, "B4", 465]])

    def test_places_are_deduplicated_and_cleaned(self):
        data = build([
            sighting("Parus major", "Kohlmeise", "2024-05-01", place_id="7", place="Heide [Teilfläche]"),
            sighting("Turdus merula", "Amsel", "2024-05-02", place_id="7", place="Heide [Teilfläche]"),
        ])
        self.assertEqual(data["pl"], [["Heide", "Musterdorf", "SN", "GR", 51.1, 14.5]])
        self.assertEqual([o[2] for o in data["obs"]], [0, 0])

    def test_observations_sorted_by_date(self):
        data = build([sighting("Parus major", "Kohlmeise", d) for d in ["2024-05-03", "2023-01-01", "2024-01-01"]])
        self.assertEqual([o[1] for o in data["obs"]], ["2023-01-01", "2024-01-01", "2024-05-03"])


class MergeExportsTest(unittest.TestCase):
    def test_disjoint_exports_are_concatenated(self):
        merged = lifelist.merge_exports([
            ("export_2023.json", [sighting("Parus major", "Kohlmeise", "2023-05-01", sighting_id="1")]),
            ("export_2024.json", [sighting("Turdus merula", "Amsel", "2024-05-01", sighting_id="2")]),
        ])
        self.assertEqual([s["date"]["@ISO8601"][:10] for s in merged], ["2023-05-01", "2024-05-01"])

    def test_duplicate_ids_are_counted_once_and_later_export_wins(self):
        merged = lifelist.merge_exports([
            ("export_old.json", [sighting("Parus major", "Kohlmeise", "2024-05-01", count="2", sighting_id="7")]),
            ("export_new.json", [sighting("Parus major", "Kohlmeise", "2024-05-01", count="5", sighting_id="7"),
                                 sighting("Parus major", "Kohlmeise", "2024-05-01", count="1", sighting_id="8")]),
        ])
        self.assertEqual([s["observers"][0]["count"] for s in merged], ["5", "1"])

    def test_identical_records_without_id_are_counted_once(self):
        record = sighting("Grus grus", "Kranich", "2024-03-01")
        merged = lifelist.merge_exports([("a.json", [record]), ("b.json", [dict(record)])])
        self.assertEqual(len(merged), 1)

    def test_yearly_exports_equal_one_full_export(self):
        full = sample_export(years=(2023, 2024))
        for i, s in enumerate(full):
            s["observers"][0]["id_sighting"] = str(i)
        by_year = [(str(y), [s for s in full if s["date"]["@ISO8601"].startswith(str(y))]) for y in (2023, 2024)]
        self.assertEqual(build(lifelist.merge_exports(by_year)), build(lifelist.merge_exports([("full", full)])))
        # an old full export lying next to the yearly ones adds nothing
        self.assertEqual(build(lifelist.merge_exports([("full", full)] + by_year)), build(full))

    def test_universal_id_takes_precedence(self):
        # same id_sighting on two portals, but different sightings
        de = sighting("Parus major", "Kohlmeise", "2024-05-01", sighting_id="7")
        lu = sighting("Turdus merula", "Amsel", "2024-05-02", sighting_id="7")
        de["observers"][0]["id_universal"] = "65_7"
        lu["observers"][0]["id_universal"] = "22_7"
        self.assertEqual(len(lifelist.merge_exports([("de.json", [de]), ("lu.json", [lu])])), 2)

    def test_load_exports_orders_by_file_name_timestamp_before_modification_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            # mtimes reversed, as after copying the files; the time in the name decides
            for name, mtime in [("export_1_2_20250101_120000.json", 300), ("export_1_2_20260101_120000.json", 100),
                                ("export_1_2_20240101_120000.json", 200)]:
                path = os.path.join(tmp, name)
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump({"data": {"sightings": []}}, fh)
                os.utime(path, (mtime, mtime))
            files = lifelist.expand_sources([os.path.join(tmp, "export_*.json")])
            self.assertEqual([n[-20:-12] for n, _ in lifelist.load_exports(files)], ["20240101", "20250101", "20260101"])

    def test_load_exports_orders_by_modification_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name, mtime in [("export_b.json", 200), ("export_a.json", 300), ("export_c.json", 100)]:
                path = os.path.join(tmp, name)
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump({"data": {"sightings": []}}, fh)
                os.utime(path, (mtime, mtime))
            files = lifelist.expand_sources([os.path.join(tmp, "export_*.json")])
            self.assertEqual([n for n, _ in lifelist.load_exports(files)], ["export_c.json", "export_b.json", "export_a.json"])


    def test_existing_path_with_brackets_is_taken_literally(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "Vögel [2024]", "export.json")
            os.makedirs(os.path.dirname(path))
            open(path, "w").close()
            self.assertEqual(lifelist.expand_sources([path]), [path])


class RenderTest(unittest.TestCase):
    def test_redact_removes_place_data(self):
        data = lifelist.build_page_data(sample_export(), "export_test.json", redact=True)
        self.assertTrue(data["meta"]["redacted"])
        self.assertEqual(data["meta"]["sources"], [])
        for name, muni, state, county, lat, lon in data["pl"]:
            self.assertEqual((name, muni, lat, lon), ("", "", 0, 0))
            self.assertTrue(state)
        html = lifelist.render_html(data)
        self.assertNotIn("Teich am Wald", html)
        self.assertNotIn("Musterdorf", html)
        self.assertNotIn("export_test", html)

    def test_placeholders_are_all_replaced(self):
        html = lifelist.render_html(lifelist.build_page_data(sample_export(), "export_test.json", redact=False))
        for placeholder in ["__DATA_JSON__", "__APP_JS__", "__VENDOR_JS__", "__VENDOR_CSS__"]:
            self.assertNotIn(placeholder, html)
        start = html.index('<script id="data" type="application/json">') + len('<script id="data" type="application/json">')
        blob = json.loads(html[start:html.index("</script>", start)])
        self.assertEqual(blob["meta"]["sources"], ["export_test.json"])
        self.assertTrue(blob["euro"])



class EmbeddingTest(unittest.TestCase):
    """Place names are free text: whatever they hold must neither end the data block nor be taken for a placeholder."""

    def test_data_block_holds_no_markup_and_parses_back(self):
        names = ["Teich <!--<script>", "Heide </script><b>", "__APP_JS__", "__DATA_JSON__ & <SCRIPT/"]
        s = sample_export() + [sighting("Pica pica", "Elster", "2024-03-10", place_id=f"x{i}", place=n, lat="51.2", lon="14.4")
                               for i, n in enumerate(names)]
        data = lifelist.build_page_data(s, "export_test.json", False)
        html = lifelist.render_html(data)
        start = html.index('<script id="data" type="application/json">') + len('<script id="data" type="application/json">')
        block = html[start:html.index("</script>", start)]
        self.assertNotIn("<", block)
        self.assertEqual(json.loads(block)["pl"], data["pl"])
        for n in names:
            self.assertIn(n, [p[0] for p in json.loads(block)["pl"]])
        # each placeholder was replaced exactly once, the app code is in the page once
        self.assertEqual(html.count("const APP_VERSION ="), 1)
        for ph in ("__DATA_JSON__", "__APP_JS__", "__VENDOR_JS__", "__VENDOR_CSS__"):
            self.assertNotIn(f">{ph}<", html)

    def test_demo_export_name_is_not_picked_up_as_an_export(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import make_demo_export
        import fnmatch
        self.assertIn("demo_export.json", make_demo_export.__doc__)
        self.assertFalse(fnmatch.fnmatch("demo_export.json", "export_*.json"))


class UpdateCheckTest(unittest.TestCase):
    def test_version_matches_page(self):
        self.assertIsNotNone(lifelist.parse_version(lifelist.app_version()))

    def test_parse_version(self):
        self.assertEqual(lifelist.parse_version("v1.10.2"), (1, 10, 2))
        self.assertEqual(lifelist.parse_version("0.2.0"), (0, 2, 0))
        self.assertIsNone(lifelist.parse_version("v1.0.0-beta"))
        self.assertIsNone(lifelist.parse_version(None))

    def test_update_message(self):
        url = "https://example.invalid/r"
        self.assertIn("v0.10.0", lifelist.update_message("0.9.1", ("v0.10.0", url)))
        self.assertIn(url, lifelist.update_message("0.9.1", ("v0.10.0", url)))
        for tag in ("v0.9.1", "v0.9.0", "nightly"):
            self.assertIsNone(lifelist.update_message("0.9.1", (tag, url)), tag)
        self.assertIsNone(lifelist.update_message("0.9.1", None))

    def test_offline_is_silent(self):
        from unittest import mock
        with mock.patch("urllib.request.urlopen", side_effect=OSError("offline")):
            self.assertIsNone(lifelist.latest_release())



class OwnPositionTest(unittest.TestCase):
    def test_prefers_gps_then_precise_point(self):
        gps = {"gps_lat": "51.123456", "gps_lon": "13.654321", "coord_lat": "51.2", "coord_lon": "13.7", "precision": "precise"}
        self.assertEqual(lifelist.own_position(gps), (51.12346, 13.65432, 1))
        self.assertEqual(lifelist.own_position({"coord_lat": "51.2", "coord_lon": "13.7", "precision": "precise"}), (51.2, 13.7, 2))
        # a record tied to its place or a grid square has no position of its own
        self.assertIsNone(lifelist.own_position({"coord_lat": "51.2", "coord_lon": "13.7", "precision": "square"}))
        self.assertIsNone(lifelist.own_position({"coord_lat": "51.2", "coord_lon": "13.7", "precision": "place"}))
        self.assertIsNone(lifelist.own_position({"gps_lat": "", "gps_lon": ""}))

    def test_redact_drops_own_positions(self):
        s = sighting("Parus major", "Kohlmeise", "2024-05-01")
        s["observers"][0].update({"gps_lat": "51.1", "gps_lon": "14.5"})
        self.assertEqual(lifelist.build_page_data([s], "x.json", False)["obs"][0][7:], [51.1, 14.5, 1])
        self.assertEqual(lifelist.build_page_data([s], "x.json", True)["obs"][0][7:], [])


class MunicipalityTest(unittest.TestCase):
    def test_county_codes(self):
        self.assertEqual(lifelist.parse_municipality("Görlitz (SN, GR)"), ("Görlitz", "SN", "GR"))
        # "*" marks the district around a city with the same code
        self.assertEqual(lifelist.parse_municipality("Gersthofen (BY, A*)"), ("Gersthofen", "BY", "A*"))
        self.assertEqual(lifelist.parse_municipality("Bremerhaven (HB, HBh)"), ("Bremerhaven", "HB", "HBh"))
        self.assertEqual(lifelist.parse_municipality("irgendwo"), ("irgendwo", "", ""))


class DemoExportTest(unittest.TestCase):
    def test_demo_export_builds(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import make_demo_export
        sightings = make_demo_export.generate()
        self.assertEqual(len(sightings), len(make_demo_export.generate()))  # same seed, same data
        data = lifelist.build_page_data(sightings, "demo_export.json", False)
        self.assertGreater(len(data["sp"]), 100)



def write_export(path, sightings=None, raw=None, encoding="utf-8"):
    with open(path, "w", encoding=encoding) as fh:
        fh.write(raw if raw is not None else json.dumps({"data": {"sightings": sightings}}))


class BadInputTest(unittest.TestCase):
    """A file that is no export, or records the page cannot use, end in a message instead of a traceback."""

    def exit_message(self, fn, *args):
        with self.assertRaises(SystemExit) as cm:
            fn(*args)
        self.assertIsInstance(cm.exception.code, str)  # a message, so the exit code is 1
        return cm.exception.code

    def test_export_with_byte_order_mark_is_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "export_bom.json")
            write_export(path, sample_export()[:3], encoding="utf-8-sig")
            self.assertEqual(len(lifelist.load_export(path)), 3)

    def test_file_that_is_no_export_names_itself_and_the_howto(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name, raw in [("export_text.json", "not json at all"), ("export_other.json", '{"foo": 1}'),
                              ("export_list.json", '{"data": {"sightings": 5}}')]:
                path = os.path.join(tmp, name)
                write_export(path, raw=raw)
                msg = self.exit_message(lifelist.load_export, path)
                self.assertIn(name, msg)
                self.assertIn("HOWTO.md", msg)
            path = os.path.join(tmp, "export_latin1.json")
            with open(path, "wb") as fh:
                fh.write('{"data": {"sightings": []}, "x": "Mäusebussard"}'.encode("latin-1"))
            self.assertIn("UTF-8", self.exit_message(lifelist.load_export, path))

    def test_missing_source_file(self):
        missing = os.path.join(tempfile.gettempdir(), "no_such_export_4711.json")
        self.assertIn("File not found", self.exit_message(lifelist.expand_sources, [missing]))

    def test_exports_found_in_a_folder_with_brackets(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = os.path.join(tmp, "Vögel [2024]")
            os.makedirs(folder)
            write_export(os.path.join(folder, "export_1.json"), [])
            here = lifelist.HERE
            lifelist.HERE = folder
            try:
                self.assertEqual([os.path.basename(p) for p in lifelist.find_exports()], ["export_1.json"])
            finally:
                lifelist.HERE = here

    def test_unusable_records_are_skipped_and_counted(self):
        good = sample_export()[:5]
        no_observer = dict(good[0]); del no_observer["observers"]
        no_species = dict(good[0], species={"name": "", "latin_name": ""})
        no_place = dict(good[0], place={"name": "Teich"})
        bad_date = dict(good[0], date={"@ISO8601": "2024-13-45T00:00:00+02:00"})
        skipped = []
        data = lifelist.build_data(good + [no_observer, no_species, no_place, bad_date, "not a record"], {}, skipped)
        self.assertEqual(len(data["obs"]), 5)
        self.assertEqual(sorted(skipped), ["no observer data", "no observer data", "no place", "no species", "no valid date"])
        # a skipped record leaves nothing behind: no taxon, no place of its own
        self.assertEqual(len(data["sp"]), len(build(good)["sp"]))

    def test_malformed_records_are_skipped_not_crashing_the_merge(self):
        good = sample_export()[:3]
        weird = [None, "text", {"observers": [None]}, {"observers": {"count": "1"}},
                 dict(good[0], date={"@ISO8601": "20240101"}), dict(good[0], date={"@ISO8601": "2024-W01-1T00:00"}),
                 dict(good[0], place={"@id": ["1"], "name": "Teich"})]
        merged = lifelist.merge_exports([("a.json", good + weird)])
        skipped = []
        data = lifelist.build_data(merged, {}, skipped)
        self.assertEqual(len(data["obs"]), 3)
        self.assertEqual(sorted(set(skipped)), ["no observer data", "no place", "no valid date"])
        # a time that is no dict is no time
        s = sighting("Parus major", "Kohlmeise", "2024-03-02")
        s["observers"][0]["timing"] = "08:15"
        self.assertEqual(build([s])["obs"][0][6], -1)

    def test_small_flaws_are_mended(self):
        s = sighting("Grus grus", "Kranich", "2024-03-01", place_id="9", lat="", lon="x", count="1-5", sys_order="?")
        s["observers"][0]["timing"] = {"@notime": "0", "@ISO8601": "2024-03-01Txx:yy:00"}
        data = build([s, sighting("Parus major", "Kohlmeise", "2024-03-02", sys_order="5")])
        self.assertEqual(data["pl"][0][4:], [0, 0])  # kept, without coordinates
        self.assertEqual(data["obs"][0][3], 0)      # a count that is no number
        self.assertEqual(data["obs"][0][6], -1)     # a time that is none
        self.assertEqual(data["sp"][0][2], 99999)   # an unknown taxonomic order sorts last

    def test_main_stops_when_nothing_is_left(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "export_empty.json")
            write_export(path, [])
            argv = sys.argv
            sys.argv = ["lifelist.py", "--source", path]
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    msg = self.exit_message(lifelist.main)
            finally:
                sys.argv = argv
            self.assertIn("Nothing was written", msg)


# runs lifelist.py as the exe would: frozen, its bundled files next to the script, the exe (and so the
# exports and lifelist.html) in a folder of its own
FROZEN_DRIVER = """
import os, runpy, sys
script, exe_dir = sys.argv[1], sys.argv[2]
sys.frozen = True
sys._MEIPASS = os.path.dirname(os.path.abspath(script))
sys.executable = os.path.join(exe_dir, "lifelist.exe")
sys.argv = ["lifelist.exe"] + sys.argv[3:]
runpy.run_path(script, run_name="__main__")
"""


class FrozenExeTest(unittest.TestCase):
    """Double-clicked, the exe's window closes when the process ends: whatever happens is shown and waits for Enter."""

    def run_exe(self, exe_dir, *args, script=None, stdin="\n"):
        import subprocess
        script = script or os.path.join(os.path.dirname(__file__), "..", "lifelist.py")
        return subprocess.run([sys.executable, "-c", FROZEN_DRIVER, os.path.abspath(script), exe_dir, *args],
                              input=stdin, capture_output=True, text=True, encoding="utf-8", timeout=120)

    def test_success_waits_and_exits_0(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_export(os.path.join(tmp, "export_1.json"), sample_export()[:20])
            res = self.run_exe(tmp)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertIn("Done. Press Enter to close.", res.stdout)
            self.assertTrue(os.path.exists(os.path.join(tmp, "lifelist.html")))

    def test_known_problem_is_shown_waits_and_exits_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_export(os.path.join(tmp, "export_1.json"), raw="<html>not an export</html>")
            res = self.run_exe(tmp)
            self.assertEqual(res.returncode, 1)
            self.assertIn("export_1.json is not valid JSON", res.stderr)
            self.assertNotIn("Traceback", res.stderr)
            self.assertIn("Stopped. Press Enter to close.", res.stdout)
            self.assertNotIn("Done", res.stdout)

    def test_unforeseen_error_is_shown_with_where_to_report_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            # a copy of the script without its bundled files: reading the page template fails
            script = os.path.join(tmp, "bundle", "lifelist.py")
            os.makedirs(os.path.dirname(script))
            with open(os.path.join(os.path.dirname(__file__), "..", "lifelist.py"), encoding="utf-8") as src, \
                    open(script, "w", encoding="utf-8") as dst:
                dst.write(src.read())
            write_export(os.path.join(tmp, "export_1.json"), sample_export()[:5])
            res = self.run_exe(tmp, script=script)
            self.assertEqual(res.returncode, 1)
            self.assertIn("Traceback", res.stderr)
            self.assertIn("/issues", res.stderr)
            self.assertIn("Stopped. Press Enter to close.", res.stdout)

    def test_without_a_console_it_ends_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_export(os.path.join(tmp, "export_1.json"), sample_export()[:5])
            res = self.run_exe(tmp, stdin="")  # no answer to the pause (scheduled task)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertNotIn("EOFError", res.stderr)


if __name__ == "__main__":
    unittest.main()
