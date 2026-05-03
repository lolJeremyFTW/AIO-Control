-- 027_auto_telegram_topics.sql — wire businesses to Telegram forum
-- topics. The user picks ONE workspace-scope telegram_target as the
-- "parent group", flips a flag, and from then on every new business
-- gets its own forum topic auto-created in that group.
--
-- Topic id lives on telegram_targets (already there as topic_id).
-- We just need:
--   - a marker on the workspace-scope target saying "this is the
--     parent group; auto-create topics off me"
--   - a marker on businesses so we can find which target row was
--     auto-spawned for them (and clean it up when the business is
--     archived)

alter table aio_control.telegram_targets
  add column if not exists auto_create_topics_for_businesses boolean
    not null default false;

-- The auto-spawned per-business target id, so updateBusiness +
-- archiveBusiness can find it and edit/close the topic.
alter table aio_control.businesses
  add column if not exists telegram_topic_target_id uuid
    references aio_control.telegram_targets(id) on delete set null;
