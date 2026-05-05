-- 049_realtime_publication.sql — Enable Supabase Realtime for the key
-- aio_control tables. Without this, postgres_changes subscriptions in the
-- browser receive nothing and the UI only updates on page refresh.
--
-- supabase_realtime is the publication Supabase's realtime service watches.
-- Tables must be explicitly added when they live in a custom schema.
-- Re-running ALTER PUBLICATION … ADD TABLE is idempotent when the table
-- is already a member (Postgres silently ignores duplicates).

ALTER PUBLICATION supabase_realtime ADD TABLE
  aio_control.runs,
  aio_control.queue_items,
  aio_control.agents,
  aio_control.businesses,
  aio_control.notification_dismissals;
