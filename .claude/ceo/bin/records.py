#!/usr/bin/env python3
"""Deterministic record keeping for the MCPpedia org, so no model ever reads or rewrites the
256 KB BACKLOG.md or hand-edits memory files.

  records.py list [--status open,in-review] [--width 400]   one line per matching row (truncated)
  records.py get <ID>                                       the full row
  records.py ids                                            every ID, one per line
  records.py apply [--date YYYY-MM-DD] < edits.json         apply a batch of edits (below)

Edits JSON (every key optional):
  {"backlog": [{"op": "set",    "id": "S36", "status": "done (PR #192; closed 2026-11-07)"},
               {"op": "note",   "id": "S44", "text": "cycle-failed: review found ..."},
               {"op": "append", "prefix": "S", "p": "P3", "item": "...", "criteria": "...",
                "protected": "no"}],
   "facts": ["claim — file.ts:42"], "lessons": ["..."], "retro": "...",
   "scorecard": "| 2026-11-07 | S44 | #201 | landed-clean | no | 0 | — | 210k |"}

BACKLOG bright line (BACKLOG.md header): only a row's Status changes, notes are appended, rows
are appended. `set` replaces only the leading status token of the Status cell and keeps every
existing note; `note` appends to the Status cell; `append` adds a new row with the next free ID.
Priority, item and acceptance criteria are never touched, and no row is ever deleted.
"""
import json
import os
import re
import sys

ROOT = os.getcwd()
# The token plus a parenthetical the cycle itself writes, like "(PR #195)" or "(run …)". Any other
# parenthetical is a human's note and is kept, and a rewrite never cuts through a backtick span.
STATUS_TOKEN = re.compile(r"^\s*(open|in-progress|in-review|done)\b(\s*\((?:PR #|run |cycle |filed |verified |reclaimed )[^)`]{0,80}\))?", re.I)
ROW = re.compile(r"^\| ([SRWM]\d+) \|")


def path(*p):
    return os.path.join(ROOT, *p)


def split_cells(line):
    """Split a table row on `|`, ignoring pipes inside backtick code spans."""
    cells, cur, code = [], [], False
    for ch in line.strip():
        if ch == "`":
            code = not code
        if ch == "|" and not code:
            cells.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    cells.append("".join(cur))
    return cells[1:-1]  # drop the empty cells outside the leading and trailing pipe


def cell_text(s):
    """Text written into a cell can't break the row: no pipes, no newlines, balanced backticks."""
    s = " ".join(str(s).replace("|", "/").split())
    return s + "`" if s.count("`") % 2 else s


def join_cells(cells):
    return "| " + " | ".join(c.strip() for c in cells) + " |"


def load_backlog():
    with open(path("BACKLOG.md"), encoding="utf-8") as f:
        return f.read().split("\n")


def find(lines, rid):
    for i, line in enumerate(lines):
        m = ROW.match(line)
        if m and m.group(1) == rid:
            return i
    raise SystemExit(f"records.py: no backlog row {rid}")


def status_of(line):
    cells = split_cells(line)
    return cells[-2].strip() if len(cells) >= 2 else ""


def set_status(line, fn):
    cells = split_cells(line)
    if len(cells) != 6:  # a stray pipe or backtick: refuse rather than write into the wrong column
        raise SystemExit(f"records.py: row has {len(cells)} cells, expected 6; fix it by hand: {line[:80]}")
    cells[-2] = fn(cells[-2].strip())  # Status is always second from the end
    return join_cells(cells)


def cmd_list(args):
    statuses = None
    width = 400
    if "--status" in args:
        statuses = args[args.index("--status") + 1].split(",")
    if "--width" in args:
        width = int(args[args.index("--width") + 1])
    for line in load_backlog():
        if not ROW.match(line):
            continue
        st = status_of(line)
        tok = STATUS_TOKEN.match(st)
        if statuses and not (tok and tok.group(1).lower() in statuses):
            continue
        cells = split_cells(line)
        rid, pri, item = cells[0].strip(), cells[1].strip(), cells[2].strip()
        prot = cells[-1].strip()
        out = f"{rid} | {pri} | {item} | status: {st} | protected: {prot}"
        print(out if len(out) <= width else out[: width - 1] + "…")


def next_id(lines, prefix):
    nums = [int(m.group(1)[1:]) for l in lines for m in [ROW.match(l)] if m and m.group(1)[0] == prefix]
    return f"{prefix}{max(nums, default=0) + 1}"


def insert_under(file, heading, bullets, before=None):
    """Append bullets at the end of `## heading`, creating the section (before `## before`) if absent."""
    with open(file, encoding="utf-8") as f:
        text = f.read()
    block = "".join(f"- {b}\n" for b in bullets)
    m = re.search(rf"^## {re.escape(heading)}\s*\n", text, re.M)
    if m:
        nxt = re.search(r"^## ", text[m.end():], re.M)
        at = m.end() + (nxt.start() if nxt else len(text) - m.end())
        head = text[:at].rstrip("\n") + "\n"
        text = head + block + ("\n" + text[at:] if nxt else "")
    else:
        sec = f"## {heading}\n{block}\n"
        b = re.search(rf"^## {re.escape(before)}", text, re.M) if before else None
        text = text[: b.start()] + sec + text[b.start():] if b else text.rstrip("\n") + "\n\n" + sec
    with open(file, "w", encoding="utf-8") as f:
        f.write(text)


def cmd_apply(args):
    date = args[args.index("--date") + 1] if "--date" in args else ""
    edits = json.load(sys.stdin)
    lines = load_backlog()
    done = []
    for e in edits.get("backlog", []):
        op = e["op"]
        if op == "set":
            i = find(lines, e["id"])
            new = cell_text(e["status"])
            lines[i] = set_status(lines[i], lambda st: STATUS_TOKEN.sub(lambda _m: new, st, count=1)
                                  if STATUS_TOKEN.match(st) else f"{new} — {st}")
            done.append(f"set {e['id']}")
        elif op == "note":
            i = find(lines, e["id"])
            note = f"NOTE {date}: {cell_text(e['text'])}" if date else f"NOTE: {cell_text(e['text'])}"
            lines[i] = set_status(lines[i], lambda st: f"{st} — {note}")
            done.append(f"note {e['id']}")
        elif op == "append":
            rid = next_id(lines, e.get("prefix", "S"))
            row = join_cells([cell_text(c) for c in (rid, e.get("p", "P3"), e["item"], e["criteria"],
                              e.get("status", f"open (filed {date} by mcppedia-cycle)"),
                              e.get("protected", "no"))])
            last = max(i for i, l in enumerate(lines) if ROW.match(l))
            lines.insert(last + 1, row)
            done.append(f"append {rid}")
        else:
            raise SystemExit(f"records.py: unknown backlog op {op}")
    with open(path("BACKLOG.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    stamp = f"{date} " if date else ""
    if edits.get("facts"):
        insert_under(path("docs", "org-memory", "codebase.md"), "Recent facts (fold in at the next prune)",
                     [stamp + f for f in edits["facts"]], before="Archive index")
        done.append(f"facts {len(edits['facts'])}")
    if edits.get("lessons"):
        insert_under(path(".claude", "ceo", "learnings", "_shared.md"), "Active", edits["lessons"])
        done.append(f"lessons {len(edits['lessons'])}")
    if edits.get("retro"):
        with open(path("docs", "org-memory", "retros.md"), "a", encoding="utf-8") as f:
            f.write(f"- {stamp}{edits['retro'].strip()}\n")
        done.append("retro")
    if edits.get("scorecard"):
        with open(path(".claude", "ceo", "memory", "scorecard.md"), "a", encoding="utf-8") as f:
            f.write(edits["scorecard"].strip() + "\n")
        done.append("scorecard")
    print("applied: " + ", ".join(done) if done else "applied: nothing")


def main():
    global ROOT
    args = sys.argv[1:]
    if "--root" in args:
        i = args.index("--root")
        ROOT = args[i + 1]
        del args[i:i + 2]
    if not args:
        raise SystemExit(__doc__)
    cmd = args[0]
    if cmd == "list":
        cmd_list(args)
    elif cmd == "get":
        print(load_backlog()[find(load_backlog(), args[1])])
    elif cmd == "ids":
        print("\n".join(m.group(1) for l in load_backlog() for m in [ROW.match(l)] if m))
    elif cmd == "apply":
        cmd_apply(args)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
