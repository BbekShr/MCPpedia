#!/usr/bin/env python3
"""Build the args for the mcppedia-cycle workflow, so the CEO session never reads BACKLOG.md and
passes a ~2 KB JSON object instead of the backlog.

  python3 .claude/ceo/bin/cycle_args.py [--id S44] [--audit] [--no-merge] [--lens performance]

Prints one JSON object on stdout. Reconciliation (M11) happens here: every `in-review` row whose
`improve/<ID>-` branch, `(ID)` title or `PR #n` cites a merged PR is returned under `reconcile`.
"""
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or os.getcwd()
sys.path.insert(0, os.path.join(ROOT, ".claude", "ceo", "bin"))
import records  # noqa: E402

records.ROOT = ROOT


def sh(*cmd):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise SystemExit(f"cycle_args.py: {' '.join(cmd)} failed: {r.stderr.strip()[:300]}")
    return r.stdout


def main():
    a = sys.argv[1:]
    opt = lambda k: a[a.index(k) + 1] if k in a else None  # noqa: E731
    date = datetime.date.today().isoformat()
    rid = opt("--id")

    lines = records.load_backlog()
    rows = {m.group(1): l for l in lines for m in [records.ROW.match(l)] if m}
    if rid and rid not in rows:
        raise SystemExit(f"cycle_args.py: no backlog row {rid}")

    sh("git", "fetch", "-q", "origin")  # mainSha and the premise check must see the real main
    merged = json.loads(sh("gh", "pr", "list", "--state", "merged", "--limit", "200", "--json", "number,headRefName,title"))
    # A revert PR's title cites the row ID too: it never proves the row shipped.
    merged = [p for p in merged if not p["headRefName"].startswith("revert/") and not p["title"].lower().startswith("revert")]
    opened = json.loads(sh("gh", "pr", "list", "--state", "open", "--limit", "100", "--json", "number,headRefName,title,isDraft"))

    reconcile = []
    for i, line in rows.items():
        st = records.status_of(line)
        if not st.lower().startswith("in-review") or "reverted automatically" in st:
            continue
        cited = {int(n) for n in re.findall(r"PR #(\d+)", st)}
        for p in merged:
            if re.match(rf"improve/{i}-", p["headRefName"]) or re.search(rf"\({i}\)", p["title"]) or p["number"] in cited:
                reconcile.append({"id": i, "pr": p["number"]})
                break

    blocked = sorted({i for p in opened for i in re.findall(r"\b([SRWM]\d+)\b", p["headRefName"] + " " + p["title"]) if i in rows})
    org_open = [p for p in opened if p["headRefName"].startswith(("improve/", "revert/"))]

    shared = open(os.path.join(ROOT, ".claude", "ceo", "learnings", "_shared.md"), encoding="utf-8").read()
    m = re.search(r"^## Active\s*\n(.*?)(?=^## |\Z)", shared, re.S | re.M)

    print(json.dumps({
        "mode": "audit" if "--audit" in a else "run",
        "id": rid,
        "root": ROOT,
        "date": date,
        "runId": f"{date}-{rid or 'cycle'}",
        "mainSha": sh("git", "rev-parse", "--short", "origin/main").strip(),
        "reconcile": reconcile,
        "blockedIds": blocked,
        "openOrgPrs": [f"#{p['number']} {p['headRefName']}{' (draft)' if p['isDraft'] else ''}" for p in org_open],
        "lessons": (m.group(1).strip() if m else ""),
        "smoke": {
            "home": "https://mcppedia.org/", "homeMarker": "Find the Right MCP Server",
            "api": "https://mcppedia.org/api/v1/servers?limit=1", "apiMarker": '"servers":[',
        },
        "extraLenses": [opt("--lens")] if opt("--lens") else [],
        "noMerge": "--no-merge" in a,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
