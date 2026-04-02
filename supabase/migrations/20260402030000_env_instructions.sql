-- Add env_instructions field — explains where to get each API key/env var
alter table servers add column if not exists env_instructions jsonb default '{}';
-- e.g., { "GITHUB_PERSONAL_ACCESS_TOKEN": { "label": "GitHub Token", "url": "https://github.com/settings/tokens", "steps": "Go to Settings > Developer > Personal Access Tokens > Generate" } }

-- Add prerequisites field — what you need installed before using this server
alter table servers add column if not exists prerequisites text[] default '{}';
-- e.g., ['node-18', 'docker'] or ['python-3.10']
