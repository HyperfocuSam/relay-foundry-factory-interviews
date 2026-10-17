import { isDeepStrictEqual } from "node:util";
import type { Pool } from "pg";
import { parseSessions, reviseStep, type Session } from "../interviews.ts";

export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function validatedSession(value: unknown): Session {
  let session: Session;
  try {
    [session] = parseSessions(
      JSON.stringify({ version: 1, sessions: [value] }),
    );
  } catch {
    throw new RequestError("Invalid interview data.");
  }
  if (
    !/^[a-f0-9]{32}$/.test(session.id) ||
    !Number.isSafeInteger(session.revision) ||
    !session.factory.trim() ||
    !session.process.trim() ||
    !session.objective.trim() ||
    !session.reviewer.trim() ||
    [session.factory, session.process, session.reviewer].some(
      (text) => text.length > 120,
    ) ||
    session.objective.length > 1000 ||
    session.sources.length > 100 ||
    session.steps.length > 500 ||
    session.gaps.length > 500 ||
    session.sources.some((source) => source.content.length > 50000) ||
    [session.sources, session.steps, session.gaps].some(
      (items) => new Set(items.map((item) => item.id)).size !== items.length,
    )
  ) {
    throw new RequestError("Invalid interview fields or size limits exceeded.");
  }
  return session;
}
export async function listSessions(
  pool: Pool,
  workspace: string,
): Promise<Session[]> {
  const result = await pool.query(
    "SELECT data FROM ai_cup_2026.sessions WHERE workspace_id=$1 ORDER BY updated_at DESC, id",
    [workspace],
  );
  return result.rows.map((row) => row.data);
}
export async function writeSession(
  pool: Pool,
  workspace: string,
  method: "POST" | "PUT" | "DELETE",
  value: unknown,
): Promise<Session | null> {
  const input =
    method === "DELETE"
      ? (value as { id: string; revision: number })
      : validatedSession(value);
  if (
    !input ||
    !/^[a-f0-9]{32}$/.test(input.id) ||
    !Number.isSafeInteger(input.revision)
  )
    throw new RequestError("Invalid session reference.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO ai_cup_2026.workspaces(id) VALUES($1) ON CONFLICT DO NOTHING",
      [workspace],
    );
    // Serialize writes and enforce the workspace quota, including simultaneous creates.
    await client.query(
      "SELECT id FROM ai_cup_2026.workspaces WHERE id=$1 FOR UPDATE",
      [workspace],
    );
    const result = await client.query(
      "SELECT data FROM ai_cup_2026.sessions WHERE workspace_id=$1 AND id=$2",
      [workspace, input.id],
    );
    const previous: Session | undefined = result.rows[0]?.data;
    if (
      method !== "POST" &&
      (!previous || previous.revision !== input.revision)
    )
      throw new RequestError(
        "This session changed or was removed. Keep your draft, then reload before saving.",
        409,
      );
    if (method === "DELETE") {
      await client.query(
        "DELETE FROM ai_cup_2026.sessions WHERE workspace_id=$1 AND id=$2",
        [workspace, input.id],
      );
      await client.query("COMMIT");
      return null;
    }
    const next = input as Session;
    if (method === "POST") {
      if (previous)
        throw new RequestError("This session has already been saved.", 409);
      const count = await client.query(
        "SELECT count(*)::int AS total FROM ai_cup_2026.sessions WHERE workspace_id=$1",
        [workspace],
      );
      if (count.rows[0].total >= 30)
        throw new RequestError(
          "This workspace supports 30 sessions. Export and remove an old session first.",
          409,
        );
      next.revision = 1;
      next.createdAt = new Date().toISOString();
    } else if (previous) {
      for (const source of previous.sources) {
        if (
          !isDeepStrictEqual(
            next.sources.find((item) => item.id === source.id),
            source,
          )
        )
          throw new RequestError(
            "Saved sources cannot be removed or changed. Add a corrected source instead.",
          );
      }
      next.createdAt = previous.createdAt;
      next.synthetic = previous.synthetic;
      next.revision = previous.revision + 1;
      next.steps = next.steps.map((step) => {
        const old = previous.steps.find((item) => item.id === step.id);
        const revised = old
          ? reviseStep(old, step.text, step.conditions)
          : null;
        const changed =
          old &&
          (old.text !== step.text ||
            old.conditions !== step.conditions ||
            old.sourceId !== step.sourceId ||
            old.paragraph !== step.paragraph);
        return {
          ...step,
          history: revised?.history ?? [],
          confirmedBy:
            changed || previous.reviewer !== next.reviewer
              ? ""
              : step.confirmedBy,
        };
      });
    }
    if (
      next.steps.some(
        (step) => step.confirmedBy && step.confirmedBy !== next.reviewer,
      )
    )
      throw new RequestError("Confirmation must match the session reviewer.");
    next.updatedAt = new Date().toISOString();
    await client.query(
      `INSERT INTO ai_cup_2026.sessions(workspace_id,id,revision,data) VALUES($1,$2,$3,$4)
      ON CONFLICT(workspace_id,id) DO UPDATE SET revision=EXCLUDED.revision,data=EXCLUDED.data,updated_at=now()`,
      [workspace, next.id, next.revision, JSON.stringify(next)],
    );
    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
