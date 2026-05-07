-- Fix MCP dashboard publishing and recent-run reporting.
--
-- 048_module_dashboards.sql created the table after the initial default
-- privileges were configured, but the live table ended up without PostgREST
-- role grants. RLS policies alone are not enough: the role also needs table
-- privileges before policies are evaluated.

grant all on table aio_control.module_dashboards to service_role;
grant select, insert, update, delete on table aio_control.module_dashboards to authenticated;
grant select on table aio_control.module_dashboards to anon;
