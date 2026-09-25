import json
import os
import sys
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


class RenderTest(unittest.TestCase):
    def test_redact_removes_place_data(self):
        data = lifelist.build_page_data(sample_export(), "export_test.json", redact=True)
        self.assertTrue(data["meta"]["redacted"])
        for name, muni, state, county, lat, lon in data["pl"]:
            self.assertEqual((name, muni, lat, lon), ("", "", 0, 0))
            self.assertTrue(state)
        html = lifelist.render_html(data)
        self.assertNotIn("Teich am Wald", html)
        self.assertNotIn("Musterdorf", html)

    def test_placeholders_are_all_replaced(self):
        html = lifelist.render_html(lifelist.build_page_data(sample_export(), "export_test.json", redact=False))
        for placeholder in ["__DATA_JSON__", "__APP_JS__", "__VENDOR_JS__", "__VENDOR_CSS__"]:
            self.assertNotIn(placeholder, html)
        start = html.index('<script id="data" type="application/json">') + len('<script id="data" type="application/json">')
        blob = json.loads(html[start:html.index("</script>", start)])
        self.assertEqual(blob["meta"]["source"], "export_test.json")
        self.assertTrue(blob["euro"])



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



class DemoExportTest(unittest.TestCase):
    def test_demo_export_builds(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import make_demo_export
        sightings = make_demo_export.generate()
        self.assertEqual(len(sightings), len(make_demo_export.generate()))  # same seed, same data
        data = lifelist.build_page_data(sightings, "export_demo.json", False)
        self.assertGreater(len(data["sp"]), 100)


if __name__ == "__main__":
    unittest.main()
