-- Self-improving dashboard: improvement proposals, approvals, and build log.

CREATE TABLE IF NOT EXISTS improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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

ALTER TABLE improvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read improvements" ON improvements;
CREATE POLICY "workspace members can read improvements"
  ON improvements FOR SELECT
  USING (workspace_id IN (
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "service role can manage improvements" ON improvements;
CREATE POLICY "service role can manage improvements"
  ON improvements
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_improvements_workspace_status
  ON improvements(workspace_id, status, sort_order);
