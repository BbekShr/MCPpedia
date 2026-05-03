-- Track whether `servers.description` was last written by a human or a bot.
-- Lets enrich-descriptions.ts skip rows a human has curated, even if the
-- text is later trimmed below the 30-char length guard the bot uses today.
alter table public.servers
  add column description_source text not null default 'bot'
    check (description_source in ('bot', 'human'));

comment on column public.servers.description_source is
  'Author of the current value of `description`. Set to ''human'' on direct admin edits and on approved user edit proposals; left as ''bot'' otherwise so enrich-descriptions can populate empty rows.';
