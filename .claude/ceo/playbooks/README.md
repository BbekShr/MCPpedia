# MCPpedia playbooks

A brief says *what* to change; a playbook says *how* this kind of change is done well. The CEO
classifies every item into one kind and names the playbook in the brief. The editor reads it
before writing anything.

| Kind | Playbook | Use for |
|---|---|---|
| bug fix | `bug-fix.md` | wrong output, crash, regression |
| perf | `perf.md` | slow, heavy, too many calls, memory growth |
| feature | `feature.md` | new behaviour, including `request` mode items |
| refactor | `refactor.md` | structure changes with NO behaviour change |
| security | `security-fix.md` | anything from the security engineer or a security lens |
| upgrade | `upgrade.md` | dependency, framework, or toolchain version changes |
| test gap | `test-gap.md` | adding missing tests or a missing test layer |

An item that is two kinds (a refactor needed for a perf fix) is two dispatches, refactor first.
Never mix a refactor with a behaviour change in one commit.

**If Pstack is installed** (it isn't today: these playbooks are the whole method), load it and follow its matching playbook for the
method. These files then supply only the "In this project" sections: this repo's commands, tools,
and traps. On anything about this repo, these files win; on general method, Pstack wins.
