"""Runs update.py against throwaway git repositories: a bare "GitHub" and a user's clone of it."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import update  # noqa: E402

ENV = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid"}


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, env=ENV, check=True, capture_output=True, text=True).stdout


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


@unittest.skipIf(shutil.which("git") is None, "git not installed")
class UpdateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = self.tmp.name
        self.origin, self.dev, self.user = (os.path.join(root, n) for n in ("origin.git", "dev", "user"))
        git(root, "init", "--bare", "-b", "master", self.origin)
        git(root, "clone", self.origin, self.dev)
        self.release("0.1.0")
        git(root, "clone", self.origin, self.user)
        self.lines = []

    def release(self, version):
        write(os.path.join(self.dev, "src", "i18n.js"), f'const APP_VERSION = "{version}";\n')
        git(self.dev, "add", "-A")
        git(self.dev, "commit", "-m", f"Release {version}")
        git(self.dev, "push", "origin", "HEAD:master")

    def run_update(self):
        return update.update(self.user, out=self.lines.append)

    def test_up_to_date(self):
        self.assertEqual(self.run_update(), 0)
        self.assertIn("Already up to date", self.lines[-1])

    def test_fast_forwards_and_keeps_own_files(self):
        write(os.path.join(self.user, "export_1.json"), "{}")  # the user's own, untracked export
        self.release("0.2.0")
        self.assertEqual(self.run_update(), 1)
        self.assertEqual(update.app_version(self.user), "0.2.0")
        self.assertTrue(os.path.exists(os.path.join(self.user, "export_1.json")))
        self.assertIn("0.1.0 -> 0.2.0", "\n".join(self.lines))

    def test_stops_on_local_changes(self):
        write(os.path.join(self.user, "src", "i18n.js"), "// edited\n")
        self.release("0.2.0")
        with self.assertRaises(update.UpdateError) as ctx:
            self.run_update()
        self.assertIn("src/i18n.js (changed)", str(ctx.exception))
        with open(os.path.join(self.user, "src", "i18n.js"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "// edited\n")

    def test_names_own_files_that_are_in_the_way(self):
        write(os.path.join(self.dev, "howto", "01.png"), "new")
        git(self.dev, "add", "-A")
        git(self.dev, "commit", "-m", "new screenshot")
        git(self.dev, "push", "origin", "HEAD:master")
        write(os.path.join(self.user, "howto", "01.png"), "copied in by hand")
        with self.assertRaises(update.UpdateError) as ctx:
            self.run_update()
        self.assertIn("howto/01.png", str(ctx.exception))
        self.assertIn("in the way", str(ctx.exception))

    def test_can_discard_local_changes_when_asked(self):
        write(os.path.join(self.user, "src", "i18n.js"), "// regenerated\n")
        write(os.path.join(self.user, "export_1.json"), "{}")  # own files stay
        self.release("0.2.0")
        questions = []
        self.assertEqual(update.update(self.user, out=self.lines.append, ask=lambda q: questions.append(q) or True), 1)
        self.assertIn("src/i18n.js (changed)", questions[0])
        self.assertEqual(update.app_version(self.user), "0.2.0")
        self.assertTrue(os.path.exists(os.path.join(self.user, "export_1.json")))
        # answering no keeps the changes and stops
        write(os.path.join(self.user, "src", "i18n.js"), "// edited again\n")
        with self.assertRaises(update.UpdateError):
            update.update(self.user, out=self.lines.append, ask=lambda q: False)
        with open(os.path.join(self.user, "src", "i18n.js"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "// edited again\n")

    def test_keeps_local_changes_when_there_is_nothing_to_update(self):
        write(os.path.join(self.user, "src", "i18n.js"), "// regenerated\n")
        self.assertEqual(update.update(self.user, out=self.lines.append, ask=lambda q: True), 0)
        with open(os.path.join(self.user, "src", "i18n.js"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "// regenerated\n")

    def test_can_replace_own_files_in_the_way_when_asked(self):
        write(os.path.join(self.dev, "howto", "01.png"), "new")
        git(self.dev, "add", "-A")
        git(self.dev, "commit", "-m", "new screenshot")
        git(self.dev, "push", "origin", "HEAD:master")
        write(os.path.join(self.user, "howto", "01.png"), "copied in by hand")
        self.assertEqual(update.update(self.user, out=self.lines.append, ask=lambda q: "in the way" in q), 1)
        with open(os.path.join(self.user, "howto", "01.png"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "new")

    def test_stops_on_own_commits(self):
        write(os.path.join(self.user, "notes.txt"), "mine")
        git(self.user, "add", "-A")
        git(self.user, "commit", "-m", "mine")
        self.release("0.2.0")
        with self.assertRaises(update.UpdateError):
            self.run_update()

    def gone_branch(self):
        """the user is on a branch that was merged into master and then deleted on GitHub"""
        git(self.dev, "checkout", "-q", "-b", "feature")
        git(self.dev, "push", "-q", "origin", "feature")
        git(self.user, "fetch", "-q")
        git(self.user, "checkout", "-q", "-b", "feature", "--track", "origin/feature")
        git(self.dev, "checkout", "-q", "master")
        self.release("0.2.0")
        git(self.dev, "push", "-q", "origin", "--delete", "feature")

    def test_names_the_main_branch_when_the_own_one_is_gone(self):
        self.gone_branch()
        for _ in range(2):  # the second time the first run's fetch has already pruned origin/feature
            with self.assertRaises(update.UpdateError) as ctx:
                self.run_update()
            self.assertIn("no longer exists on GitHub", str(ctx.exception))
            self.assertIn("git checkout master", str(ctx.exception))
        self.assertEqual(git(self.user, "rev-parse", "--abbrev-ref", "HEAD").strip(), "feature")

    def test_switches_to_the_main_branch_when_asked(self):
        self.gone_branch()
        questions = []
        n = update.update(self.user, out=self.lines.append, ask=lambda q: questions.append(q) or True)
        self.assertEqual(n, 1)
        self.assertIn("Switch to 'master'", questions[0])
        self.assertEqual(git(self.user, "rev-parse", "--abbrev-ref", "HEAD").strip(), "master")
        self.assertEqual(update.app_version(self.user), "0.2.0")
        self.assertIn("feature", git(self.user, "branch", "--list", "feature"))  # the old branch is kept

    def test_does_not_switch_with_local_changes(self):
        self.gone_branch()
        write(os.path.join(self.user, "src", "i18n.js"), "changed")
        with self.assertRaises(update.UpdateError) as ctx:
            update.update(self.user, out=self.lines.append, ask=lambda q: "Discard" in q)
        self.assertIn("git stash", str(ctx.exception))
        self.assertEqual(git(self.user, "rev-parse", "--abbrev-ref", "HEAD").strip(), "feature")

    def test_not_a_clone(self):
        plain = os.path.join(self.tmp.name, "plain")
        os.makedirs(plain)
        with self.assertRaises(update.UpdateError):
            update.update(plain, out=self.lines.append)


if __name__ == "__main__":
    unittest.main()
