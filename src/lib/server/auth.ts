import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { Pool } from "pg";
const derive = promisify(scrypt);
export const COOKIE_NAME = "ai_cup_session";
export const TEAM_WORKSPACE = "team";
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const actual = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function currentUser(pool: Pool, token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await pool.query(
    "SELECT email FROM ai_cup_2026.auth_sessions WHERE token_hash=$1 AND expires_at > now()",
    [tokenHash(token)],
  );
  return result.rows[0]?.email as string | undefined;
}
export async function login(pool: Pool, email: string, password: string) {
  // Shared database throttling works across replicas. Five attempts per email per 15 minutes.
  const limit = await pool.query(
    `INSERT INTO ai_cup_2026.login_attempts(email,attempts) VALUES($1,1)
    ON CONFLICT(email) DO UPDATE SET
      attempts=CASE WHEN ai_cup_2026.login_attempts.window_start < now()-interval '15 minutes' THEN 1 ELSE ai_cup_2026.login_attempts.attempts+1 END,
      window_start=CASE WHEN ai_cup_2026.login_attempts.window_start < now()-interval '15 minutes' THEN now() ELSE ai_cup_2026.login_attempts.window_start END
    RETURNING attempts`,
    [email],
  );
  if (limit.rows[0].attempts > 5) return null;
  const user = await pool.query(
    "SELECT password_hash FROM ai_cup_2026.users WHERE email=$1",
    [email],
  );
  const hash =
    user.rows[0]?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`;
  if (!(await passwordMatches(password, hash)) || !user.rowCount) return null;
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO ai_cup_2026.auth_sessions(token_hash,email,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [tokenHash(token), email],
  );
  await pool.query("DELETE FROM ai_cup_2026.login_attempts WHERE email=$1", [
    email,
  ]);
  await pool.query(
    "DELETE FROM ai_cup_2026.auth_sessions WHERE expires_at < now()",
  );
  return token;
}
export async function createUser(pool: Pool, email: string, password: string) {
  email = email.trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("Use a valid email and a password of 12–256 characters.");
  // Bootstrap is repeatable and never resets an existing user's password.
  await pool.query(
    "INSERT INTO ai_cup_2026.users(email,password_hash) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [email, await passwordHash(password)],
  );
}
export function allowedOrigin(request: Request) {
  return (
    !!process.env.APP_ORIGIN &&
    request.headers.get("origin") === process.env.APP_ORIGIN
  );
}
