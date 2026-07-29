-- extract-schemas picked its batch with `tools = '[]'` and no ordering, so
-- Postgres was free to hand back the same 200 rows every run. Once the
-- empty-tools backlog grew past the batch size, every row outside that window
-- starved indefinitely — and since the bot only wrote on a successful
-- extraction, there was no attempt recorded to order by either.
--
-- This column is that record: the bot stamps every row it takes off the queue,
-- including the attempts that yielded nothing, and orders by it NULLS FIRST.
-- Same queue pattern compute-scores already uses with `score_computed_at`.
-- See #70.
alter table servers
  add column if not exists tools_extracted_at timestamptz;

-- Matches the bot's query exactly: only empty-tools rows are ever selected,
-- ordered oldest-attempt-first with never-attempted rows ahead of them.
create index if not exists servers_tools_extraction_queue_idx
  on servers (tools_extracted_at nulls first)
  where tools = '[]'::jsonb;
