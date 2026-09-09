#!/usr/bin/env python3
"""Self-check for block-admin-merge.py. Run: python3 .claude/hooks/test_block_admin_merge.py

Lives in a file rather than an inline shell command on purpose: a PreToolUse(Bash)
hook sees the whole command string, so a heredoc carrying these payloads is itself
blocked by the guard under test.
"""
import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).with_name("block-admin-merge.py")

# The flag is assembled, never written literally, so this file stays greppable
# without tripping the guard when it is edited through a shell command.
ADMIN = "--" + "admin"
MERGE = "gh pr merge"

CASES = [
    (f"{MERGE} {ADMIN} 123", 2, "bare"),
    (f"{MERGE} 12 --squash {ADMIN} --delete-branch", 2, "flags interleaved"),
    (f"npm test && {MERGE} {ADMIN} 5", 2, "after &&"),
    (f"set -e\n{MERGE} {ADMIN} 5", 2, "after a newline"),
    (f"(cd repo; {MERGE} {ADMIN} 5)", 2, "after a subshell separator"),
    (f"{MERGE} --squash 123", 0, "an ordinary merge"),
    ("npm test", 0, "unrelated command"),
    (f'git commit -m "note: {MERGE} {ADMIN} stays forbidden"', 0,
     "named in prose — the false positive that blocked the first commit"),
    (f"echo 'see {MERGE} {ADMIN}' > notes.md", 0, "named mid-command"),
]

failures = []
for command, expected, label in CASES:
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
    )
    if result.returncode != expected:
        failures.append(f"  {label}: got {result.returncode}, expected {expected}")

# Malformed input must never block — a broken payload should not wedge the session.
for raw, label in [("not json", "malformed"), ("{}", "empty object"),
                   ('{"tool_input":{"command":null}}', "null command"),
                   ('{"tool_input":"oops"}', "wrong tool_input type")]:
    result = subprocess.run([sys.executable, str(HOOK)], input=raw,
                            capture_output=True, text=True)
    if result.returncode != 0:
        failures.append(f"  {label}: got {result.returncode}, expected 0")

if failures:
    print(f"FAIL ({len(failures)})")
    print("\n".join(failures))
    sys.exit(1)

print(f"ok — {len(CASES) + 4} cases")
