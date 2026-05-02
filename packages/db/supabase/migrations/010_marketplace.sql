-- 010_marketplace.sql — Phase 7e: AI agent marketplace.
-- A `marketplace_agents` table holds the public catalog. Anyone can read
-- it (anon + authenticated); only service_role writes. Installing an
-- entry copies it into the workspace's private aio_control.agents table.

create table if not exists aio_control.marketplace_agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null,
  description text,
  -- Recommended provider + model. The user can override at install time.
  provider text not null,
  model text,
  -- Default kind (chat | worker | reviewer | generator | router).
  kind text not null default 'chat',
  -- Default config the install action copies into agents.config.
  config jsonb not null default '{}'::jsonb,
  category text,
  -- "official" entries get a green badge in the UI.
  official boolean not null default false,
  install_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketplace_category
  on aio_control.marketplace_agents(category);

alter table aio_control.marketplace_agents enable row level security;

drop policy if exists "marketplace_read_all" on aio_control.marketplace_agents;
create policy "marketplace_read_all"
  on aio_control.marketplace_agents for select using (true);
-- No client INSERT/UPDATE policies — only service_role seeds the catalog.

-- Atomic helper: increment install_count when someone installs an agent.
-- Called from the server action via supabase.rpc('increment_marketplace_install',...).
create or replace function aio_control.increment_marketplace_install(agent_slug text)
returns void
language sql
security definer
set search_path = aio_control
as $$
  update aio_control.marketplace_agents
  set install_count = install_count + 1
  where slug = agent_slug;
$$;

grant execute on function aio_control.increment_marketplace_install(text)
  to anon, authenticated, service_role;

-- Seed an opinionated starter catalog. These are dropped to the user's
-- agents.config when installed; the user picks the business + model.
insert into aio_control.marketplace_agents
  (slug, name, tagline, description, provider, model, kind, config, category, official)
values
  ('youtube-script-nl', 'YouTube Script Writer (NL)',
   'Schrijft scripts voor faceless YouTube kanalen in correct Nederlands',
   'Standaard hooks, retention beats, en CTA-sjablonen. Output is markdown met B-roll suggesties.',
   'minimax', 'MiniMax-M2.7-Highspeed', 'generator',
   '{"systemPrompt":"Je bent een Nederlandse YouTube scriptwriter. Schrijf scripts met een sterke hook (eerste 8 sec), 3-5 retention beats, en een CTA. Output in Markdown.","temperature":0.7,"maxTokens":2000}'::jsonb,
   'youtube', true),
  ('etsy-listing-generator', 'Etsy Listing Generator',
   'Productbeschrijvingen + tags + titels die converteren op Etsy',
   'Houdt rekening met Etsy SEO (lange tail keywords, eerste 40 chars van titel) en de toon van handgemaakte makers.',
   'claude', 'claude-sonnet-4-6', 'generator',
   '{"systemPrompt":"You write Etsy listings that convert. Output sections: Title (≤140 chars, keyword-rich), Description (under 350 words, scannable), Tags (13 comma-separated). Match the maker''s voice.","temperature":0.6}'::jsonb,
   'etsy', true),
  ('blog-seo-writer', 'Blog SEO Writer',
   'Long-form artikelen geoptimaliseerd voor zoekvolume',
   'Genereert artikelen met juiste H2/H3 structuur, internal-link suggesties, en een meta description.',
   'openrouter', 'anthropic/claude-sonnet-4', 'generator',
   '{"systemPrompt":"Write SEO blog posts. Always include: H1, 4-6 H2s, an FAQ section, a meta description (155 chars max), and 3 internal-link suggestions placeholders [LINK: ...].","temperature":0.65,"maxTokens":3500}'::jsonb,
   'blog', true),
  ('lead-research-agent', 'Lead Research Agent',
   'Verzamelt en synthetiseert info over een prospect-bedrijf',
   'Gegeven een bedrijfsnaam + URL: tech stack, recent funding, key personen, openings. Output bullet points.',
   'claude', 'claude-sonnet-4-6', 'worker',
   '{"systemPrompt":"You research B2B prospects. Given a company + website, output: tech stack, recent news, decision makers, top 3 angles for outreach. Be concise.","temperature":0.3}'::jsonb,
   'sales', true),
  ('hitl-reviewer', 'HITL Quality Reviewer',
   'Beoordeelt content + scoort op brand voice en feitenchecks',
   'Geeft een score 0-100, lijst met issues, en een verbeterde versie van de input.',
   'claude', 'claude-haiku-4-5', 'reviewer',
   '{"systemPrompt":"Score the content from 0 to 100 on (a) brand voice consistency, (b) factual accuracy, (c) call-to-action clarity. Then list issues + propose an improved version.","temperature":0.2}'::jsonb,
   'review', true),
  ('classifier-cheap', 'Cheap Classifier (Ollama)',
   'Snelle local classificatie zonder API-kosten',
   'Voor bulk-tagging: gegeven een lijst items, geef terug een JSON-array met categorieën. Lokaal via Ollama.',
   'ollama', 'llama3', 'router',
   '{"systemPrompt":"You are a classifier. Given input, output ONLY a JSON object {category: string, confidence: 0-1}. No prose.","temperature":0.1}'::jsonb,
   'utility', true)
on conflict (slug) do update
set name = excluded.name,
    tagline = excluded.tagline,
    description = excluded.description,
    provider = excluded.provider,
    model = excluded.model,
    kind = excluded.kind,
    config = excluded.config,
    category = excluded.category,
    official = excluded.official;
