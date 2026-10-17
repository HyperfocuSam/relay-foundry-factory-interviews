import pg from "pg";

const globalDatabase = globalThis as unknown as { interviewPool?: pg.Pool };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  return (globalDatabase.interviewPool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
  }));
}
