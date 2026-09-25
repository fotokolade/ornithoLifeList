"""Brings this local copy of OrnithoLifeList up to date with GitHub.

Usage:  python update.py        (on Windows also: double-click update.bat)

Needs git and a copy made with `git clone`. Fetches the latest changes of the current branch and
applies them, but only as a fast-forward: nothing is merged, rebased or overwritten. Your own
export_*.json and lifelist*.html are untracked (.gitignore) and never touched. If files that belong
to the repository were changed locally, the update stops and says which ones.
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


class UpdateError(Exception):
    pass


def git(repo, *args, check=True):
    try:
        # English messages whatever the system language: update() recognises some of them
        env = {**os.environ, "LC_ALL": "C", "LANGUAGE": "C"}
        res = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, encoding="utf-8", env=env)
    except FileNotFoundError:
        raise UpdateError("git is not installed or not on the PATH. Install it from https://git-scm.com/ "
                          "or download the new version from the GitHub releases page instead.")
    if check and res.returncode:
        raise UpdateError(f"git {' '.join(args)} failed:\n{(res.stderr or res.stdout).strip()}")
    return res


def app_version(repo):
    try:
        with open(os.path.join(repo, "src", "i18n.js"), encoding="utf-8") as fh:
            return re.search(r'APP_VERSION = "([^"]+)"', fh.read()).group(1)
    except (OSError, AttributeError):
        return "?"


def update(repo=HERE, out=print):
    """Fast-forwards `repo` to its upstream branch. Returns the number of new commits applied."""
    # the folder itself must be the clone's top level: a downloaded copy unpacked somewhere inside
    # another git repository must not update that other repository
    top = git(repo, "rev-parse", "--show-toplevel", check=False).stdout.strip()
    same = lambda p: os.path.normcase(os.path.realpath(p))  # noqa: E731
    if not top or same(top) != same(repo):
        raise UpdateError("This folder is not a git clone, so it can't be updated with git. "
                          "Download the new version from the GitHub releases page instead.")
    branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if branch == "HEAD":
        raise UpdateError("No branch is checked out (detached HEAD). Run `git checkout master` first.")
    upstream = git(repo, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}", check=False).stdout.strip()
    if not upstream:
        raise UpdateError(f"Branch '{branch}' doesn't follow a branch on GitHub. "
                          f"Run `git branch --set-upstream-to=origin/{branch}` first.")
    changed = git(repo, "status", "--porcelain", "--untracked-files=no").stdout.splitlines()
    if changed:
        kinds = {"D": "deleted", "M": "changed", "A": "added", "R": "renamed", "T": "type changed"}
        files = "\n".join(f"  {line[3:]} ({kinds.get(line[:2].strip()[:1], 'changed')})" for line in changed)
        raise UpdateError(f"These files of the program were changed locally, so the update stops to keep them:\n{files}\n"
                          "Undo the changes (`git checkout -- <file>`, or `git checkout -- .` for all of them) "
                          "or put them aside (`git stash`), then run the update again.")

    old = app_version(repo)
    out(f"Checking GitHub for updates to '{branch}' ...")
    # the branch's configured remote, not the text before the first "/" (remote names may contain one)
    remote = git(repo, "config", "--get", f"branch.{branch}.remote", check=False).stdout.strip() or upstream.split("/", 1)[0]
    git(repo, "fetch", "--prune", remote)
    incoming = int(git(repo, "rev-list", "--count", f"HEAD..{upstream}").stdout)
    if not incoming:
        out(f"Already up to date (version {old}).")
        return 0
    if int(git(repo, "rev-list", "--count", f"{upstream}..HEAD").stdout):
        raise UpdateError(f"This copy has its own commits that are not on GitHub, so it can't simply be fast-forwarded. "
                          f"Merge or rebase onto {upstream} by hand.")
    log = git(repo, "log", "--format=  %s", f"HEAD..{upstream}").stdout.rstrip()
    res = git(repo, "merge", "--ff-only", upstream, check=False)
    if res.returncode:
        # files you put there yourself that the update brings as well, e.g. new screenshots copied in by hand
        err = res.stderr
        if "untracked working tree files would be overwritten" in err:
            files = [ln.strip() for ln in err.split("overwritten by merge:", 1)[1].splitlines()
                     if ln.startswith(("\t", " ")) and ln.strip()]
            raise UpdateError("These files are in the way because the update brings its own copies of them:\n"
                              + "\n".join("  " + f for f in files)
                              + "\nMove or delete them, then run the update again.")
        raise UpdateError(f"git merge failed:\n{err.strip()}")
    new = app_version(repo)
    out(f"Updated with {incoming} new change{'s' if incoming != 1 else ''}:\n{log}")
    out(f"Version {old} -> {new}." if new != old else f"Version {new}.")
    out("Run `python lifelist.py` to build your life list with the new version.")
    return incoming


def main():
    try:
        update()
    except UpdateError as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
