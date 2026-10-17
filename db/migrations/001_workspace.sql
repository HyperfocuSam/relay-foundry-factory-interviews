CREATE SCHEMA IF NOT EXISTS ai_cup_2026;
CREATE TABLE ai_cup_2026.workspaces (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_cup_2026.sessions (
  workspace_id text NOT NULL REFERENCES ai_cup_2026.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  CHECK (data->>'id' = id),
  CHECK ((data->>'revision')::integer = revision)
);
