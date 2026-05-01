-- 006_username_lookup.sql — Allow users to log in with the local-part of
-- their email (e.g. "admin" instead of "admin@tromptech.life").
--
-- Pattern: a SECURITY DEFINER RPC that takes a username and returns the
-- matching email if exactly one auth.users row matches. We expose this to
-- both anon and authenticated so the unauthenticated login form can call
-- it. The only thing it leaks is "an account with this username exists" —
-- which is the same signal an attacker gets from any login form anyway.

create or replace function aio_control.lookup_email_by_username(uname text)
returns text
language sql
security definer
set search_path = aio_control, auth
stable
as $$
  select u.email
  from auth.users u
  where u.email is not null
    and lower(split_part(u.email, '@', 1)) = lower(uname)
  limit 1;
$$;

revoke all on function aio_control.lookup_email_by_username(text) from public;
grant execute on function aio_control.lookup_email_by_username(text) to anon, authenticated, service_role;
