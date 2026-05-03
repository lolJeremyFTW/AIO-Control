-- 028_business_intent.sql — give every business a "why" so agents
-- understand the goal:
--   description    plain prose about what the business is + does
--   mission        the operating principle / agent rules of engagement
--                  (acts like a system-prompt prefix for every agent
--                  in this business)
--   targets        an array of { id, name, target, current, deadline,
--                  status } objects so the user can list concrete
--                  goals like "make the first 1k EUR by 2026-09-01"

alter table aio_control.businesses
  add column if not exists description text,
  add column if not exists mission text,
  add column if not exists targets jsonb not null default '[]'::jsonb;
