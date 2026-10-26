#!/usr/bin/env python3
"""org-doctor: static health check for an agent org generated or adopted by agent-org.

Usage: org_doctor.py [repo_root] [--json]
Exit 0 = no errors (warnings allowed), 1 = errors, 2 = no org found.
Stdlib only, so it runs in any project regardless of language.
"""
import json
import os
import re
import subprocess
import sys

PLAYBOOK_KINDS = ("bug-fix", "perf", "feature", "refactor", "security-fix", "upgrade", "test-gap")
LEVELS = ("L0", "L1", "L2", "L3", "L4")
WRITE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


class Doctor:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.user_data = []
        self._tracked_all = None
        self.errors, self.warnings, self.info = [], [], []

    def p(self, *parts):
        return os.path.join(self.root, *parts)

    def rel(self, path):
        return os.path.relpath(path, self.root)

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    # ---------- helpers ----------
    def frontmatter(self, path):
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            return None, ""
        m = re.match(r"---\n(.*?)\n---\n", text, re.S)
        if not m:
            return None, text
        fm = {}
        for line in m.group(1).splitlines():
            if ":" in line and not line.startswith(" "):
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip()
        return fm, text

    def tracked(self, glob):
        try:
            out = subprocess.run(["git", "ls-files", "--", f":(glob){glob}"], cwd=self.root,
                                 capture_output=True, text=True, timeout=20).stdout
        except (OSError, subprocess.SubprocessError):
            return None
        return [l for l in out.splitlines() if l]

    # ---------- checks ----------
    def run(self):
        org_path = self.p(".claude", "ceo", "org.json")
        if not os.path.exists(org_path):
            return None
        try:
            org = json.load(open(org_path))
        except ValueError as e:
            self.err(f"org.json does not parse: {e}")
            return org_path
        self.user_data = org.get("user_data_paths", [])
        self.check_org(org)
        agents = self.check_agents(org)
        self.check_ceo(org, agents)
        self.check_placeholders()
        self.check_memory()
        self.check_guard(org)
        self.check_evals(org)
        self.check_skills(org)
        self.check_playbooks(org)
        self.check_feedback(org)
        if os.path.exists(self.p(".claude", "ceo", "PAUSE")):
            self.info.append("kill switch is ON (.claude/ceo/PAUSE present): every CEO mode aborts")
        return org_path

    def check_org(self, org):
        for key in ("project", "slug", "ceo_skill", "base_branch", "autonomy_level", "gates", "agents"):
            if key not in org:
                self.err(f"org.json missing required key `{key}`")
        level = str(org.get("autonomy_level", ""))
        if level and level not in LEVELS:
            self.err(f"org.json autonomy_level `{level}` is not one of {', '.join(LEVELS)}")
        target = org.get("autonomy_target")
        if target and target in LEVELS and level in LEVELS and target < level:
            self.warn(f"autonomy_target {target} is below autonomy_level {level}")
        if not org.get("gates"):
            self.warn("no gates configured: the org has no verification bar (should be L0)")
        elif level in LEVELS and level >= "L1" and not any(g.get("cheap") for g in org["gates"]):
            self.warn("no gate marked `cheap`: parallel worktree editors have nothing safe to run")
        for gf in org.get("gate_files", []):
            if not os.path.exists(self.p(gf)) and not self.tracked(f"**/{gf}"):
                self.warn(f"gate_files entry `{gf}` matches no file")
        if os.path.exists(self.p(".claude", "ceo", "DEMOTED")):
            demoted = open(self.p(".claude", "ceo", "DEMOTED"), encoding="utf-8").read().strip()
            self.warn(f".claude/ceo/DEMOTED says {demoted or '?'}: a demotion is pending. Set "
                      "autonomy_level in org.json to match, then delete DEMOTED")
        self.info.append("control files (always guarded): .claude/ceo/org.json, AUTONOMY.md, "
                         "DEMOTED, .claude/settings.json, .claude/hooks/")
        self.info.append(f"autonomy {level or '?'} (target {target or 'unset'}), "
                         f"{len(org.get('agents', []))} agents, {len(org.get('gates', []))} gates")

    def check_agents(self, org):
        agents_dir = self.p(".claude", "agents")
        on_disk = {}
        if os.path.isdir(agents_dir):
            for f in sorted(os.listdir(agents_dir)):
                if f.endswith(".md"):
                    on_disk[f[:-3]] = os.path.join(agents_dir, f)
        declared = {a.get("name"): a for a in org.get("agents", []) if a.get("name")}

        for name, spec in declared.items():
            path = on_disk.get(name)
            if not path:
                self.err(f"agent `{name}` is declared in org.json but .claude/agents/{name}.md is missing")
                continue
            fm, text = self.frontmatter(path)
            if fm is None:
                self.err(f"{self.rel(path)}: no YAML frontmatter")
                continue
            if fm.get("name") != name:
                self.err(f"{self.rel(path)}: frontmatter name `{fm.get('name')}` != filename `{name}`")
            if len(fm.get("description", "")) < 40:
                self.err(f"{self.rel(path)}: description missing or too short to route on")
            tools = {t.strip() for t in fm.get("tools", "").split(",") if t.strip()}
            if spec.get("access") == "report-only":
                if not tools:
                    self.err(f"{self.rel(path)}: report-only agent has no `tools:` line, so it "
                             "inherits Edit/Write. Restrict it.")
                elif tools & WRITE_TOOLS:
                    self.err(f"{self.rel(path)}: report-only agent has write tools {sorted(tools & WRITE_TOOLS)}")
            excluded = set()
            for glob in spec.get("except", []):
                excluded.update(self.tracked(glob) or [])
            for glob in spec.get("perimeter", []):
                files = self.tracked(glob)
                if files is not None and not files:
                    self.err(f"agent `{name}` perimeter glob `{glob}` matches no tracked file")
                org_owned = [f for f in (files or []) if f not in excluded and self.is_org_file(f, org)]
                if org_owned:
                    self.err(f"agent `{name}` perimeter glob `{glob}` covers org files the CEO owns "
                             f"(e.g. {org_owned[0]}); narrow it or add an `except`")
            lines = text.count("\n")
            if lines > 250:
                self.warn(f"{self.rel(path)}: {lines} lines; long agents dilute their own instructions")
            self.check_refs(path, text)

        for name in on_disk:
            if name not in declared and name.startswith(org.get("slug", "\0") + "-"):
                self.warn(f".claude/agents/{name}.md looks like an org agent but isn't in org.json")
        return set(declared)

    def is_org_file(self, rel, org):
        ceo = f".claude/skills/{org.get('ceo_skill', '')}/"
        verify = f".claude/skills/{org.get('slug', '')}-verify/"
        return rel.startswith((".claude/agents/", ".claude/ceo/", ".claude/hooks/org_guard", ceo, verify))

    def ignored(self, ref):
        try:
            return subprocess.run(["git", "check-ignore", "-q", ref], cwd=self.root,
                                  timeout=10).returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False

    def resolves(self, ref, from_file):
        if os.path.exists(self.p(ref)) or os.path.exists(self.p(".claude", "ceo", ref)) \
                or os.path.exists(os.path.join(os.path.dirname(from_file), ref)):
            return True
        if self._tracked_all is None:
            self._tracked_all = self.tracked("**") or []
        return any(f.endswith("/" + ref) for f in self._tracked_all)

    def check_refs(self, path, text):
        # Backticked repo-relative paths that should exist. Globs, placeholders, commands and
        # paths under .claude/ceo (created lazily: reports, walks, per-agent learnings) are skipped.
        for ref in set(re.findall(r"`([A-Za-z0-9_.\-/]+/[A-Za-z0-9_.\-]+\.[A-Za-z0-9]+)`", text)):
            if any(c in ref for c in "*<>{}") or ref.startswith((".claude/ceo/", "http", "node_modules/")):
                continue
            if ref in self.user_data or any(ref.startswith(u.rstrip("*")) for u in self.user_data if u.endswith("*")):
                continue  # user data is legitimately absent from a clean checkout
            if not self.resolves(ref, path) and not self.ignored(ref):
                self.warn(f"{self.rel(path)}: references `{ref}`, which does not exist")

    def check_ceo(self, org, agents):
        skill = org.get("ceo_skill")
        if not skill:
            return
        path = self.p(".claude", "skills", skill, "SKILL.md")
        fm, text = self.frontmatter(path)
        if fm is None and not text:
            self.err(f"CEO skill missing: .claude/skills/{skill}/SKILL.md")
            return
        if fm is None or fm.get("name") != skill:
            self.err(f"CEO skill frontmatter name should be `{skill}`")
        slug = org.get("slug", "")
        name_re = r"`(" + re.escape(slug) + r"-[a-z0-9-]+)`"
        mentioned = set(re.findall(name_re, text)) - {skill}
        skills_dir = self.p(".claude", "skills")
        skill_names = set(os.listdir(skills_dir)) if os.path.isdir(skills_dir) else set()
        # Only a name in dispatch context (a spawn/dispatch line or a team-table row) is a claim
        # that an agent exists; memory names, skill names and prose mentions are not.
        dispatched = set()
        for line in text.splitlines():
            if re.search(r"\b(spawn|dispatch|launch|hand (?:it|the)|send it)\b", line, re.I) or line.lstrip().startswith("| `"):
                dispatched.update(re.findall(name_re, line))
        for name in sorted(dispatched - agents - skill_names - {skill}):
            self.err(f"CEO skill dispatches `{name}`, which is not a declared agent")
        for name in sorted(agents - mentioned):
            self.warn(f"agent `{name}` is never mentioned by the CEO skill, so nothing dispatches it")
        self.check_refs(path, text)

    def check_placeholders(self):
        roots = [self.p(".claude", "agents"), self.p(".claude", "ceo"), self.p(".claude", "skills")]
        for base in roots:
            for dirpath, dirnames, files in os.walk(base):
                dirnames[:] = [d for d in dirnames if d not in ("reports", "walks", "evals", "vendor")]
                for f in files:
                    if not f.endswith((".md", ".json", ".sh")):
                        continue
                    path = os.path.join(dirpath, f)
                    try:
                        text = open(path, encoding="utf-8").read()
                    except (OSError, UnicodeDecodeError):
                        continue
                    hits = sorted(set(re.findall(r"\{\{[A-Z_]+\}\}", text)))
                    if hits:
                        self.err(f"{self.rel(path)}: unfilled placeholders {', '.join(hits[:5])}")
                    if "<!-- FILL" in text:
                        self.err(f"{self.rel(path)}: a `<!-- FILL: ... -->` instruction was left in; "
                                 "replace it with content and delete the comment")

    def active_lines(self, path):
        text = open(path, encoding="utf-8").read()
        m = re.search(r"^## Active\s*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
        return 0 if not m else len([l for l in m.group(1).splitlines() if l.strip()])

    def check_memory(self):
        ceo = self.p(".claude", "ceo")
        for f in ("RULES.md", "backlog.md", "memory/codebase.md", "memory/retros.md", "memory/scorecard.md",
                  "AUTONOMY.md", "PRINCIPLES.md"):
            if not os.path.exists(os.path.join(ceo, f)):
                self.err(f".claude/ceo/{f} is missing")
        ldir = os.path.join(ceo, "learnings")
        if os.path.isdir(ldir):
            for f in sorted(os.listdir(ldir)):
                if f.endswith(".md") and f != "README.md":
                    n = self.active_lines(os.path.join(ldir, f))
                    if n > 60:
                        self.err(f"learnings/{f}: ## Active has {n} lines (>60); demote to ## Archive")
                    elif n > 40:
                        self.warn(f"learnings/{f}: ## Active has {n} lines (>40); it enters every brief")
        cb = os.path.join(ceo, "memory", "codebase.md")
        if os.path.exists(cb):
            n = open(cb, encoding="utf-8").read().count("\n")
            if n > 160:
                self.warn(f"memory/codebase.md is {n} lines (~120 target); prune duplicates and stale facts")

    def check_guard(self, org):
        if not os.path.exists(self.p(".claude", "hooks", "org_guard.py")):
            self.err(".claude/hooks/org_guard.py is missing")
        try:
            settings = json.load(open(self.p(".claude", "settings.json")))
        except (OSError, ValueError):
            self.err(".claude/settings.json missing or unparsable, so the guard is not wired")
            return
        blob = json.dumps(settings.get("hooks", {}))
        # `edit` is always required: even with gate_files: [] it guards the org's control files.
        for mode in ("bash", "edit"):
            if f"org_guard.py\\\" {mode}" not in blob and f"org_guard.py {mode}" not in blob:
                self.err(f"guard mode `{mode}` is not registered in .claude/settings.json hooks")

    def check_evals(self, org):
        cdir = self.p(".claude", "ceo", "evals", "cases")
        covered = set()
        if os.path.isdir(cdir):
            for f in os.listdir(cdir):
                fm, _ = self.frontmatter(os.path.join(cdir, f))
                if fm and fm.get("agent"):
                    covered.add(fm["agent"])
                    if fm.get("agent") not in {a.get("name") for a in org.get("agents", [])}:
                        self.warn(f"eval case {f} targets unknown agent `{fm.get('agent')}`")
        for a in org.get("agents", []):
            if a.get("access") == "editor" and a.get("name") not in covered:
                self.warn(f"editor `{a.get('name')}` has no eval case; its definition can't be regression-tested")




    def check_skills(self, org):
        declared = {a.get("name") for a in org.get("agents", [])}
        for skill, spec in (org.get("skills") or {}).items():
            for agent_name in spec.get("agents", []):
                if agent_name not in declared:
                    self.err(f"skill `{skill}` is wired to `{agent_name}`, which is not a declared agent")
                    continue
                path = self.p(".claude", "agents", agent_name + ".md")
                try:
                    text = open(path, encoding="utf-8").read()
                except OSError:
                    continue  # missing agent file is already an error
                fm, _ = self.frontmatter(path)
                tools = {t.strip() for t in (fm or {}).get("tools", "").split(",") if t.strip()}
                if tools and "Skill" not in tools:
                    self.err(f"skill `{skill}` is wired to `{agent_name}`, but its `tools:` line has no "
                             "Skill tool, so it can never load it")
                if f"`{skill}`" not in text:
                    self.warn(f"skill `{skill}` is wired to `{agent_name}` in org.json, but its agent "
                              "file never names it, so the agent won't load it")
            if not spec.get("fallback"):
                self.warn(f"skill `{skill}` has no fallback: agents will fail silently where it isn't installed")

    def check_playbooks(self, org):
        pdir = self.p(org.get("playbooks", ".claude/ceo/playbooks"))
        if not os.path.isdir(pdir):
            self.err(f"playbooks directory {self.rel(pdir)} is missing; editors are told to follow one per item")
            return
        for kind in ("README",) + PLAYBOOK_KINDS:
            if not os.path.exists(os.path.join(pdir, kind + ".md")):
                self.err(f"playbook {self.rel(os.path.join(pdir, kind + '.md'))} is missing")


    def check_feedback(self, org):
        fb = org.get("feedback")
        if fb is None:
            self.info.append("feedback: not configured (off); template findings stay local")
        else:
            enabled = fb.get("enabled")
            if not isinstance(enabled, bool):
                self.err("org.json feedback.enabled must be true or false")
            elif enabled and not re.fullmatch(r"[\w.-]+/[\w.-]+", str(fb.get("upstream", ""))):
                self.err("feedback is enabled but feedback.upstream is not an owner/repo")
            else:
                self.info.append(f"feedback: {'on (opt-in), sends only via /org-feedback' if enabled else 'off'}")
        if not os.path.exists(self.p(".claude", "ceo", "upstream.md")):
            self.warn(".claude/ceo/upstream.md is missing: template findings from micro-retros have nowhere to go")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = args[0] if args else os.getcwd()
    doc = Doctor(root)
    found = doc.run()
    if found is None:
        print(f"No agent org at {root} (.claude/ceo/org.json not found). Run /org-init or /org-init adopt.")
        return 2
    if "--json" in sys.argv:
        print(json.dumps({"errors": doc.errors, "warnings": doc.warnings, "info": doc.info}, indent=2))
    else:
        for line in doc.info:
            print(f"info   {line}")
        for line in doc.errors:
            print(f"ERROR  {line}")
        for line in doc.warnings:
            print(f"warn   {line}")
        print(f"\n{len(doc.errors)} error(s), {len(doc.warnings)} warning(s)")
    return 1 if doc.errors else 0


if __name__ == "__main__":
    sys.exit(main())
