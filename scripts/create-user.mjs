import pg from "pg";
import { createUser } from "../src/lib/server/auth.ts";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
try {
  if (
    !process.env.DATABASE_URL ||
    !process.env.BOOTSTRAP_ADMIN_EMAIL ||
    !process.env.BOOTSTRAP_ADMIN_PASSWORD
  )
    throw new Error("Missing setup variables");
  await createUser(
    pool,
    process.env.BOOTSTRAP_ADMIN_EMAIL,
    process.env.BOOTSTRAP_ADMIN_PASSWORD,
  );
  console.log(
    "Team sign-in account provisioned (existing passwords are unchanged).",
  );
} catch {
  console.error(
    "Account provisioning failed. Check database access, email and password length (12–256).",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
