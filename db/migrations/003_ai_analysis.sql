CREATE TABLE ai_cup_2026.analysis_runs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  session_id text NOT NULL,
  revision integer NOT NULL,
  requested_by text REFERENCES ai_cup_2026.users(email) ON DELETE SET NULL,
  model text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, session_id) REFERENCES ai_cup_2026.sessions(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX ON ai_cup_2026.analysis_runs(workspace_id, session_id, created_at DESC);
CREATE TABLE ai_cup_2026.analysis_limits (
  email text PRIMARY KEY REFERENCES ai_cup_2026.users(email) ON DELETE CASCADE,
  next_allowed_at timestamptz NOT NULL
);
