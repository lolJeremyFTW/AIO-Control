-- Self-improving dashboard: improvement proposals, approvals, and build log.

CREATE TABLE IF NOT EXISTS aio_control.improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES aio_control.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'built')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  built_at timestamptz,
  built_by text,
  built_notes text,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE aio_control.improvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read improvements" ON aio_control.improvements;
CREATE POLICY "workspace members can read improvements"
  ON aio_control.improvements FOR SELECT
  USING (workspace_id IN (
    SELECT w.id FROM aio_control.workspaces w
    JOIN aio_control.workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "service role can manage improvements" ON aio_control.improvements;
CREATE POLICY "service role can manage improvements"
  ON aio_control.improvements
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_improvements_workspace_status
  ON aio_control.improvements(workspace_id, status, sort_order);
