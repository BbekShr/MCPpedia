---
id: mcppedia-3
agent: mcppedia-data-engineer
kind: fix-the-bug
base: 8d464b0dfbf5
source: 17b2593 (#149)
---
## Task
Most servers' `health_checked_at` stays NULL even though the update-metadata bot runs on
schedule, and the admin Bots tab shows update-metadata as "running" for weeks. Find the cause in
your perimeter and fix it.

## Expected
`bots/update-metadata.ts` pages `servers` ordered by `id`, so every run reprocesses the same head
of the table; the 6h GitHub Actions job limit kills it before it reaches the rest, so the sweep
never converges. Fix: order by staleness (`health_checked_at` ascending, NULLS FIRST, `id`
tiebreaker) so a killed run still makes progress. Second mechanism: a run killed mid-work never
calls `finish()`/`fail()`, so its `bot_runs` row stays `running`; `BotRun.start()` in
`bots/lib/bot-run.ts` should reap rows for the same bot older than the job ceiling.

## Rubric
- Finds the `order('id')` reprocessing as the root cause (0-2)
- Connects it to the 6h job limit (why the sweep never converges) (0-2)
- Fix orders by staleness with NULLS FIRST (0-2)
- Finds and fixes (or files) the orphaned `running` rows (0-2)
- Proves it on fixtures, never by running the bot against production (0-2)
