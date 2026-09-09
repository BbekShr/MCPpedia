#!/usr/bin/env python3
"""PreToolUse(Bash) guard: refuse an admin-forced `gh pr merge`.

CLAUDE.md §6 makes three conditions the merge gate — checks green, no CONFIRMED
correctness bug, guard green — and says they are not waivable by the agent. The
`--admin` flag bypasses all three, and `Bash(gh pr merge:*)` is allowlisted in
settings.json, so nothing else stops it. Exit 2 = block, stderr goes to the model.

The match is anchored to a command position (start of string, or after a shell
separator) rather than anywhere in the text. Without that anchor the guard fires
on its own name appearing in a commit message, a PR body, or a retro line — which
is exactly how it failed the first time it ran.
"""
import json
import re
import sys

# start-of-string | shell separator | newline, then the command itself
ADMIN_MERGE = re.compile(
    r"(?:\A|[;&|(]|\n)\s*gh\s+pr\s+merge\b[^\n;&|]*?--admin\b"
)

try:
    command = json.load(sys.stdin).get("tool_input", {}).get("command") or ""
except (json.JSONDecodeError, AttributeError, TypeError):
    sys.exit(0)  # not our business; never block on a malformed payload

if ADMIN_MERGE.search(command):
    sys.stderr.write(
        "BLOCKED: forcing a merge with the admin flag bypasses the required checks.\n"
        "CLAUDE.md §6: a PR merges only when required checks are green AND review "
        "found no CONFIRMED correctness bug AND the guard is green. Those three are "
        "not waivable by the agent. Fix the red condition, or hand the PR to the "
        "maintainer — do not force it.\n"
    )
    sys.exit(2)

sys.exit(0)
