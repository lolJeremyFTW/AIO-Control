-- Robust HITL review learning.
--
-- queue_items already stores the operator-facing review card. This table
-- stores the durable lesson trail around those cards: why an agent escalated,
-- what the operator decided, and what future agents should take into account.

CREATE TABLE IF NOT EXISTS aio_control.agent_review_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES aio_control.workspaces(id) ON DELETE CASCADE,
  business_id uuid REFERENCES aio_control.businesses(id) ON DELETE CASCADE,
  nav_node_id uuid REFERENCES aio_control.nav_nodes(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES aio_control.agents(id) ON DELETE SET NULL,
  run_id uuid REFERENCES aio_control.runs(id) ON DELETE SET NULL,
  queue_item_id uuid REFERENCES aio_control.queue_items(id) ON DELETE SET NULL,
  lesson_type text NOT NULL CHECK (
    lesson_type IN ('uncertainty', 'approval', 'rejection', 'operator_note', 'system')
  ),
  outcome text CHECK (
    outcome IN ('pending', 'approved', 'rejected', 'resolved', 'noted') OR outcome IS NULL
  ),
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES aio_control.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_review_lessons_workspace_created
  ON aio_control.agent_review_lessons(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_review_lessons_business_created
  ON aio_control.agent_review_lessons(business_id, created_at DESC)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_review_lessons_queue_item
  ON aio_control.agent_review_lessons(queue_item_id)
  WHERE queue_item_id IS NOT NULL;

ALTER TABLE aio_control.agent_review_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_review_lessons_read_member"
  ON aio_control.agent_review_lessons;
CREATE POLICY "agent_review_lessons_read_member"
  ON aio_control.agent_review_lessons FOR SELECT
  USING (aio_control.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "agent_review_lessons_insert_editor"
  ON aio_control.agent_review_lessons;
CREATE POLICY "agent_review_lessons_insert_editor"
  ON aio_control.agent_review_lessons FOR INSERT
  WITH CHECK (
    aio_control.workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "agent_review_lessons_update_editor"
  ON aio_control.agent_review_lessons;
CREATE POLICY "agent_review_lessons_update_editor"
  ON aio_control.agent_review_lessons FOR UPDATE
  USING (
    aio_control.workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  )
  WITH CHECK (
    aio_control.workspace_role(workspace_id) IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "agent_review_lessons_delete_admin"
  ON aio_control.agent_review_lessons;
CREATE POLICY "agent_review_lessons_delete_admin"
  ON aio_control.agent_review_lessons FOR DELETE
  USING (aio_control.workspace_role(workspace_id) IN ('owner', 'admin'));
