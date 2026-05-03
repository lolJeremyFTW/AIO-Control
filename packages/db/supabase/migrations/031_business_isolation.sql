-- 031_business_isolation.sql — let a business be fully self-contained:
-- when `isolated` is true the resolver layers (api keys, telegram,
-- email, custom integrations) do NOT fall back to the workspace
-- defaults. Useful for client work where you don't want any
-- credentials or routing leaking from your main TrompTech setup.
--
-- The actual gating happens app-side in the resolvers — see
-- lib/api-keys/resolve.ts, lib/notify/email.ts and
-- lib/notify/dispatch.ts.

alter table aio_control.businesses
  add column if not exists isolated boolean not null default false;

-- Optional per-business email recipients was already added in 021,
-- but isolated businesses ALSO want their own SMTP creds. We reuse
-- the api_keys table with business-scope rows for smtp_host /
-- smtp_user / smtp_pass / smtp_from / smtp_port — no schema change
-- needed there.

-- Same idea for Telegram: an isolated business needs its own bot
-- token (provider="telegram" with scope="business"). Already
-- supported by the api_keys system.
