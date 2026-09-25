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
        self.assertIn("src/i18n.js", str(ctx.exception))
        with open(os.path.join(self.user, "src", "i18n.js"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "// edited\n")

    def test_stops_on_own_commits(self):
        write(os.path.join(self.user, "notes.txt"), "mine")
        git(self.user, "add", "-A")
        git(self.user, "commit", "-m", "mine")
        self.release("0.2.0")
        with self.assertRaises(update.UpdateError):
            self.run_update()

    def test_not_a_clone(self):
        plain = os.path.join(self.tmp.name, "plain")
        os.makedirs(plain)
        with self.assertRaises(update.UpdateError):
            update.update(plain, out=self.lines.append)


if __name__ == "__main__":
    unittest.main()
