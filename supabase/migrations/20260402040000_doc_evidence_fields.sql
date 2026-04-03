-- Add documentation evidence fields for ScoreCard display
alter table servers add column if not exists doc_readme_quality text;
alter table servers add column if not exists doc_has_setup boolean default false;
alter table servers add column if not exists doc_has_examples boolean default false;
alter table servers add column if not exists doc_tool_schema_ratio real;
