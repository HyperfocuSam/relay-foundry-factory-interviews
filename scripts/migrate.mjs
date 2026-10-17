import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    // Session-level lock: use direct PostgreSQL or the session pooler (5432).
    await client.query("SELECT pg_advisory_lock(2026, 640)");
    // IF NOT EXISTS still checks database CREATE privileges. An administrator
    // may already have provisioned this schema for a restricted application role.
    const schema = await client.query(
      "SELECT 1 FROM pg_namespace WHERE nspname = 'ai_cup_2026'",
    );
    if (!schema.rowCount) await client.query("CREATE SCHEMA ai_cup_2026");
    await client.query(`CREATE TABLE IF NOT EXISTS ai_cup_2026.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = new URL("../db/migrations/", import.meta.url);
    for (const name of (await readdir(directory))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query(
        "SELECT checksum FROM ai_cup_2026.schema_migrations WHERE name=$1",
        [name],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        // Preserve the historical migration file/checksum. The runner has
        // already ensured this schema exists; omit only its legacy bootstrap
        // statement so schema owners do not need database-wide CREATE rights.
        const executable =
          name === "001_workspace.sql"
            ? sql.replace(/^CREATE SCHEMA IF NOT EXISTS ai_cup_2026;\r?\n/, "")
            : sql;
        await client.query(executable);
        await client.query(
          "INSERT INTO ai_cup_2026.schema_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("Database migrations are current.");
  } finally {
    await client.end(); // Releases advisory lock even after failure.
  }
}

if (import.meta.main) {
  migrate().catch((error) => {
    // Avoid printing connection strings, passwords or query parameter values.
    console.error(
      "Migration failed.",
      error.code ||
        "Check connectivity, schema permissions and migration checksums.",
    );
    process.exitCode = 1;
  });
}
