-- 026_profile_avatar.sql — let users upload a profile picture (re-uses
-- the node-logos bucket so we don't need another one). Avatar URL is
-- a public bucket URL; render priority in the UI is logo > letter.

alter table aio_control.profiles
  add column if not exists avatar_url text,
  add column if not exists timezone text not null default 'Europe/Amsterdam';
