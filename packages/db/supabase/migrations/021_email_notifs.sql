-- 021_email_notifs.sql — opt-in email notifications for run reports.
-- Email recipients are simpler than Telegram (no chat_id / topic_id /
-- bot tokens) so we just store comma-separated addresses on the
-- workspace, business, and agent rows. Resolution: agent → business
-- → workspace; null = no email.
--
-- The actual SMTP credentials live in env (SMTP_HOST/PORT/USER/PASS +
-- SMTP_FROM) — no per-workspace SMTP setup. Most users will configure
-- a transactional provider (Postmark, Resend, AWS SES) once and route
-- everything through it.

alter table aio_control.workspaces
  add column if not exists notify_email text,
  add column if not exists notify_email_on_done boolean not null default false,
  add column if not exists notify_email_on_fail boolean not null default true;

alter table aio_control.businesses
  add column if not exists notify_email text;

alter table aio_control.agents
  add column if not exists notify_email text;
