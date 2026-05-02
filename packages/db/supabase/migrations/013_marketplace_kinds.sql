-- 013_marketplace_kinds.sql — Phase 7+: split the marketplace into four
-- tabs (agents, skills, plugins, MCP servers).
--
-- Reality check on where the catalog comes from: until this migration
-- the catalog held 6 hand-curated agent presets I (Claude) seeded as
-- starting templates. There is no external feed — the service_role key
-- inserts new rows. Ship a separate `marketplace-admin` UI later if
-- you want non-SQL editing.

alter table aio_control.marketplace_agents
  add column if not exists marketplace_kind text not null default 'agent';

-- Backfill: every existing row is an agent preset.
update aio_control.marketplace_agents
  set marketplace_kind = 'agent'
  where marketplace_kind is null or marketplace_kind = '';

-- Constrain to the four supported kinds.
alter table aio_control.marketplace_agents
  drop constraint if exists marketplace_agents_kind_check;
alter table aio_control.marketplace_agents
  add constraint marketplace_agents_kind_check
  check (marketplace_kind in ('agent', 'skill', 'plugin', 'mcp_server'));

create index if not exists idx_marketplace_kind
  on aio_control.marketplace_agents(marketplace_kind);

-- ─── Seed: skills (reusable system prompts) ─────────────────────────────────
insert into aio_control.marketplace_agents
  (slug, name, tagline, description, provider, model, kind, config, category, official, marketplace_kind)
values
  ('skill-brand-voice-tromptech', 'TrompTech Brand Voice',
   'Schrijf in TrompTech''s u-vorm met green-tech accent',
   'System-prompt module die de TrompTech merkstijl afdwingt — zakelijk, u-vorm, kort, geen jargon.',
   'claude', null, 'generator',
   '{"systemPromptAddon":"Schrijf altijd in u-vorm. Toon: zakelijk, kort, technisch correct. Vermijd Engelse leenwoorden waar Nederlands prima volstaat. Eindig met een concrete next step."}'::jsonb,
   'voice', true, 'skill'),
  ('skill-seo-meta', 'SEO Meta Generator',
   'Voegt meta-title + meta-description discipline toe',
   'Bij elke output: title ≤60 chars, description ≤155 chars, focus keyword bovenaan.',
   'openrouter', null, 'generator',
   '{"systemPromptAddon":"Output ALWAYS includes a `<meta>` block at the top with: title (≤60 chars, focus keyword first), description (≤155 chars, action verb), focus_keyword. Then the main content."}'::jsonb,
   'seo', true, 'skill'),
  ('skill-citation-checker', 'Citation Checker',
   'Verzint geen bronnen — markeert ontbrekende citaten',
   'Voor elke feitelijke claim: ofwel een [SOURCE: url] tag, ofwel [UNVERIFIED] zodat de reviewer snel kan checken.',
   'claude', null, 'reviewer',
   '{"systemPromptAddon":"For every factual claim, append [SOURCE: url] when you can cite, or [UNVERIFIED] when you can''t. Never invent sources."}'::jsonb,
   'review', true, 'skill')
on conflict (slug) do update
set marketplace_kind = excluded.marketplace_kind,
    description = excluded.description,
    config = excluded.config;

-- ─── Seed: plugins (worker integrations / output sinks) ─────────────────────
insert into aio_control.marketplace_agents
  (slug, name, tagline, description, provider, model, kind, config, category, official, marketplace_kind)
values
  ('plugin-youtube-publish', 'YouTube Publish Plugin',
   'Publiceert video output naar je YouTube channel',
   'Uploadt mp4 + thumbnail + description vanaf de agent run output. Vereist YouTube Data API integration.',
   'claude', null, 'worker',
   '{"plugin":"youtube_publish","requires":["youtube_data"]}'::jsonb,
   'youtube', true, 'plugin'),
  ('plugin-etsy-listing', 'Etsy Listing Plugin',
   'Schrijft agent output direct als Etsy listing',
   'Maakt een nieuwe listing aan in je shop met de agent''s title/description/tags. Vereist Etsy integration.',
   'claude', null, 'worker',
   '{"plugin":"etsy_listing","requires":["etsy"]}'::jsonb,
   'etsy', true, 'plugin'),
  ('plugin-slack-notify', 'Slack Notify Plugin',
   'Stuurt agent run summary naar een Slack channel',
   'Bij elke run: post een card met status + cost + output URL. Vereist Slack webhook URL.',
   'claude', null, 'worker',
   '{"plugin":"slack_webhook","requires":["slack_webhook_url"]}'::jsonb,
   'notifications', true, 'plugin')
on conflict (slug) do update
set marketplace_kind = excluded.marketplace_kind,
    description = excluded.description,
    config = excluded.config;

-- ─── Seed: MCP servers (Model Context Protocol providers) ───────────────────
insert into aio_control.marketplace_agents
  (slug, name, tagline, description, provider, model, kind, config, category, official, marketplace_kind)
values
  ('mcp-minimax-coder', 'MiniMax Coder Plan MCP',
   'Web search + image understanding voor MiniMax-via-Claude agents',
   'Voegt de MiniMax Coding Plan MCP toe aan je agents. Tools: web_search, understand_image. Vereist MINIMAX_API_KEY.',
   'minimax', null, 'router',
   '{"mcp":{"name":"minimax","command":"npx","args":["-y","@minimax-ai/coding-plan-mcp"]}}'::jsonb,
   'mcp', true, 'mcp_server'),
  ('mcp-filesystem', 'Filesystem MCP',
   'Geef agents lees/schrijf-toegang tot een lokale folder',
   'Officiële Anthropic MCP filesystem server. Sandbox via allowed paths in config.',
   'claude', null, 'router',
   '{"mcp":{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/path/to/sandbox"]}}'::jsonb,
   'mcp', true, 'mcp_server'),
  ('mcp-postgres', 'Postgres MCP',
   'Read-only Postgres queries voor data-driven agents',
   'Officiële Anthropic MCP Postgres server. Vereist DATABASE_URL.',
   'claude', null, 'router',
   '{"mcp":{"name":"postgres","command":"npx","args":["-y","@modelcontextprotocol/server-postgres","$DATABASE_URL"]}}'::jsonb,
   'mcp', true, 'mcp_server'),
  ('mcp-github', 'GitHub MCP',
   'Issue + PR + code search via GitHub',
   'Officiële Anthropic MCP GitHub server. Vereist GITHUB_PERSONAL_ACCESS_TOKEN.',
   'claude', null, 'router',
   '{"mcp":{"name":"github","command":"npx","args":["-y","@modelcontextprotocol/server-github"]}}'::jsonb,
   'mcp', true, 'mcp_server')
on conflict (slug) do update
set marketplace_kind = excluded.marketplace_kind,
    description = excluded.description,
    config = excluded.config;
