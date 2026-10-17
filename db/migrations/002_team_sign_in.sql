CREATE TABLE ai_cup_2026.users (
  email text PRIMARY KEY,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_cup_2026.auth_sessions (
  token_hash text PRIMARY KEY,
  email text NOT NULL REFERENCES ai_cup_2026.users(email) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX ON ai_cup_2026.auth_sessions (expires_at);
CREATE TABLE ai_cup_2026.login_attempts (
  email text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
