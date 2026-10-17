import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { createExample } from "../src/lib/interviews.ts";
import { chatTranscript } from "../src/lib/meeting-chat.ts";
import { analyze } from "../src/lib/server/llm.ts";
import {
  listSessions,
  writeSession,
} from "../src/lib/server/session-repository.ts";

const url = process.env.TEST_DATABASE_URL;
test(
  "PostgreSQL migrations, persistence, isolation and concurrent writes",
  { skip: !url },
  async () => {
    // Dedicated disposable DB only. Never falls back to the deployment DATABASE_URL.
    const pool = new pg.Pool({ connectionString: url });
    try {
      await Promise.all([migrate(url), migrate(url)]);
      await migrate(url);
      const migrationCount = await pool.query(
        "SELECT count(*)::int AS total FROM ai_cup_2026.schema_migrations",
      );
      assert.equal(migrationCount.rows[0].total, 3);
      const workspace = crypto.randomUUID();
      const other = crypto.randomUUID();
      const source = createExample();
      const created = await writeSession(pool, workspace, "POST", source);
      assert.equal(created.revision, 1);
      assert.equal(
        (await listSessions(pool, workspace))[0].sources[0].content,
        source.sources[0].content,
      );
      assert.deepEqual(await listSessions(pool, other), []);
      await assert.rejects(writeSession(pool, other, "DELETE", created), {
        status: 409,
      });
      const edited = {
        ...created,
        steps: created.steps.map((step, i) =>
          i ? step : { ...step, text: "New wording" },
        ),
      };
      const races = await Promise.allSettled([
        writeSession(pool, workspace, "PUT", edited),
        writeSession(pool, workspace, "PUT", edited),
      ]);
      assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        races.find((r) => r.status === "rejected").reason.status,
        409,
      );
      const saved = (await listSessions(pool, workspace))[0];
      assert.equal(saved.revision, 2);
      assert.equal(saved.steps[0].confirmedBy, "");
      assert.equal(saved.steps[0].history.length, 1);
      const tampered = structuredClone(saved);
      tampered.sources[0].content = "Changed original";
      await assert.rejects(writeSession(pool, workspace, "PUT", tampered), {
        status: 400,
      });
      assert.equal((await listSessions(pool, workspace))[0].revision, 2);
      await assert.rejects(
        writeSession(pool, workspace, "POST", {
          ...createExample(),
          sources: [{ content: "bad" }],
        }),
        { status: 400 },
      );
      const chatSource = {
        id: "b".repeat(32), kind: "transcript", label: "Meeting chat",
        content: chatTranscript([
          { id: "alice:1", timestamp: Date.UTC(2026, 9, 1), speaker: "Alice", message: "Inspect every batch." },
          { id: "guest:2", timestamp: Date.UTC(2026, 9, 1, 0, 1), speaker: "Anonymous", message: "檢查品質" },
        ]),
        addedAt: new Date().toISOString(),
      };
      const withChat = await writeSession(pool, workspace, "PUT", {
        ...saved, sources: [...saved.sources, chatSource],
      });
      const reopened = (await listSessions(pool, workspace))[0];
      assert.deepEqual(reopened.sources.at(-1), chatSource);
      assert.equal(reopened.revision, 3);
      const changedChat = structuredClone(reopened);
      changedChat.sources.at(-1).content = "Rewritten chat";
      await assert.rejects(writeSession(pool, workspace, "PUT", changedChat), { status: 400 });
      const citation = { sourceId: chatSource.id, paragraph: 0, quote: "Inspect every batch." };
      const draft = await analyze(reopened, [chatSource.id], {
        provider: "gemini", key: "fake-key", model: "gemini-test", url: "https://example.test",
      }, async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
        steps: [], questions: [], report: {
          overview: [{ ...citation, text: "Inspect every batch." }],
          missingInformation: ["Baseline is unknown."],
          recommendation: { ...reopened.decision, summary: "Collect baseline data.", rationale: "A baseline is needed." },
          evidence: [citation],
        },
      }) }] } }] }));
      const savedDraft = await pool.query(
        `INSERT INTO ai_cup_2026.analysis_runs(id,workspace_id,session_id,revision,model,result)
         SELECT $1,workspace_id,id,revision,$2,$3 FROM ai_cup_2026.sessions WHERE workspace_id=$4 AND id=$5 AND revision=$6`,
        [draft.id, draft.model, JSON.stringify(draft), workspace, reopened.id, reopened.revision],
      );
      assert.equal(savedDraft.rowCount, 1);
      const reloadedDraft = await pool.query(
        "SELECT result FROM ai_cup_2026.analysis_runs WHERE workspace_id=$1 AND session_id=$2 ORDER BY created_at DESC LIMIT 1",
        [workspace, reopened.id],
      );
      assert.deepEqual(reloadedDraft.rows[0].result, draft);
      assert.deepEqual((await listSessions(pool, workspace))[0], reopened, "Generating a report leaves reviewed session data unchanged");
      await writeSession(pool, workspace, "DELETE", withChat);
      assert.equal((await pool.query("SELECT id FROM ai_cup_2026.analysis_runs WHERE id=$1", [draft.id])).rowCount, 0);
      assert.deepEqual(await listSessions(pool, workspace), []);
      await pool.query("DELETE FROM ai_cup_2026.workspaces WHERE id=ANY($1)", [
        [workspace, other],
      ]);
    } finally {
      await pool.end();
    }
  },
);

test(
  "team sign-in hashes passwords, preserves bootstrap accounts, expires and revokes sessions",
  { skip: !url },
  async () => {
    const { createUser, login, currentUser, tokenHash } = await import(
      "../src/lib/server/auth.ts"
    );
    const pool = new pg.Pool({ connectionString: url });
    const email = `test-${crypto.randomUUID()}@example.test`;
    try {
      await migrate(url);
      await createUser(pool, email, "test-password-long-enough");
      await createUser(pool, email, "another-password-never-applied");
      assert.equal(await login(pool, email, "incorrect"), null);
      const token = await login(pool, email, "test-password-long-enough");
      assert.ok(token);
      assert.equal(await currentUser(pool, token), email);
      assert.equal(await currentUser(pool, "a".repeat(64)), undefined);
      const stored = await pool.query(
        "SELECT password_hash FROM ai_cup_2026.users WHERE email=$1",
        [email],
      );
      assert.notEqual(
        stored.rows[0].password_hash,
        "test-password-long-enough",
      );
      await pool.query(
        "UPDATE ai_cup_2026.auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
        [tokenHash(token)],
      );
      assert.equal(await currentUser(pool, token), undefined);
      const next = await login(pool, email, "test-password-long-enough");
      await pool.query("DELETE FROM ai_cup_2026.users WHERE email=$1", [email]);
      assert.equal(await currentUser(pool, next), undefined);
      for (let i = 0; i < 6; i++)
        assert.equal(await login(pool, email, "bad"), null);
      await createUser(pool, email, "test-password-long-enough");
      assert.equal(
        await login(pool, email, "test-password-long-enough"),
        null,
        "throttled account",
      );
    } finally {
      await pool.query("DELETE FROM ai_cup_2026.users WHERE email=$1", [email]);
      await pool.query(
        "DELETE FROM ai_cup_2026.login_attempts WHERE email=$1",
        [email],
      );
      await pool.end();
    }
  },
);

test(
  "migrations work with schema ownership and no database CREATE permission",
  { skip: !url },
  async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const role = `cup_role_${suffix}`;
    const name = `cup_db_${suffix}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    let target;
    try {
      await admin.query(
        `CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
      await admin.query(`CREATE DATABASE ${name}`);
      const connection = new URL(url);
      connection.pathname = `/${name}`;
      target = new pg.Client({ connectionString: connection.toString() });
      await target.connect();
      await target.query(`REVOKE CREATE ON DATABASE ${name} FROM PUBLIC`);
      await target.query(`CREATE SCHEMA ai_cup_2026 AUTHORIZATION ${role}`);
      connection.searchParams.set("options", `-c role=${role}`);
      await migrate(connection.toString());
      await migrate(connection.toString());
      const result = await target.query(
        `SELECT has_database_privilege($1,current_database(),'CREATE') AS can_create`,
        [role],
      );
      assert.equal(result.rows[0].can_create, false);
    } finally {
      if (target) await target.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
      await admin.end();
    }
  },
);
