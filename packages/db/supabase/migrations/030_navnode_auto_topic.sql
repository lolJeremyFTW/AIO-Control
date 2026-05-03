-- 030_navnode_auto_topic.sql — extend the auto-topic flow so nav
-- nodes (topics in our system) can also auto-create forum topics in
-- Telegram. Two configurations supported, picked per workspace via a
-- single enum:
--
--   manual                       user wires every chat_id+topic_id
--                                themselves (existing default)
--   topic_per_business           every new business → topic in the
--                                workspace's parent group
--                                (existing auto-create flag)
--   topic_per_business_and_node  same as above + every new nav-node
--                                also gets its own topic in the same
--                                group (named after the nav-node)

alter table aio_control.workspaces
  add column if not exists telegram_topology text not null default 'manual'
    check (telegram_topology in ('manual', 'topic_per_business', 'topic_per_business_and_node'));

alter table aio_control.nav_nodes
  add column if not exists telegram_topic_target_id uuid
    references aio_control.telegram_targets(id) on delete set null;
