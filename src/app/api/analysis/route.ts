import { cookies } from "next/headers";
import { database } from "@/lib/server/database";
import {
  allowedOrigin,
  COOKIE_NAME,
  currentUser,
  TEAM_WORKSPACE,
} from "@/lib/server/auth";
import { RequestError } from "@/lib/server/session-repository";
import { readJson } from "@/lib/server/read-json";
import { analyze, AnalysisError, llmConfig } from "@/lib/server/llm";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function handle(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) throw new RequestError("Sign in to analyze interviews.", 401);
    const pool = database();
    const email = await currentUser(pool, token);
    if (!email)
      throw new RequestError("Sign in again to analyze interviews.", 401);
    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("sessionId");
      if (!id || !/^[a-f0-9]{32}$/.test(id))
        throw new RequestError("Invalid session ID.");
      const result = await pool.query(
        "SELECT result FROM ai_cup_2026.analysis_runs WHERE workspace_id=$1 AND session_id=$2 ORDER BY created_at DESC LIMIT 1",
        [TEAM_WORKSPACE, id],
      );
      let service: { provider: string; model: string } | null = null;
      try {
        const config = llmConfig();
        service = { provider: config.provider, model: config.model };
      } catch { /* Saved drafts remain available when AI is unconfigured. */ }
      return Response.json(
        { analysis: result.rows[0]?.result ?? null, service },
        { headers },
      );
    }
    if (!allowedOrigin(request))
      throw new RequestError("Request origin is not allowed.", 403);
    const input = (await readJson(request, 8000)) as {
      sessionId?: unknown;
      revision?: unknown;
      sourceIds?: unknown;
    };
    if (
      !input ||
      typeof input.sessionId !== "string" ||
      !Array.isArray(input.sourceIds) ||
      input.sourceIds.length > 100 ||
      !input.sourceIds.every((s) => typeof s === "string") ||
      new Set(input.sourceIds).size !== input.sourceIds.length
    )
      throw new RequestError("Choose valid saved sources.");
    const config = llmConfig();
    const stored = await pool.query(
      "SELECT data FROM ai_cup_2026.sessions WHERE workspace_id=$1 AND id=$2",
      [TEAM_WORKSPACE, input.sessionId],
    );
    const session = stored.rows[0]?.data;
    if (!session || session.revision !== input.revision)
      throw new RequestError(
        "The session changed. Reload before analyzing.",
        409,
      );
    const limit = await pool.query(
      `INSERT INTO ai_cup_2026.analysis_limits(email,next_allowed_at) VALUES($1,now()+interval '2 minutes') ON CONFLICT(email) DO UPDATE SET next_allowed_at=EXCLUDED.next_allowed_at WHERE ai_cup_2026.analysis_limits.next_allowed_at<=now() RETURNING email`,
      [email],
    );
    if (!limit.rowCount)
      throw new RequestError(
        "An analysis is running or was just requested. Wait at least 30 seconds before trying again.",
        429,
      );
    release = async () => {
      await pool.query(
        "UPDATE ai_cup_2026.analysis_limits SET next_allowed_at=now()+interval '30 seconds' WHERE email=$1",
        [email],
      );
    };
    const result = await analyze(session, input.sourceIds, config);
    // Atomic revision check: never attach a result to a newer interview revision.
    const saved = await pool.query(
      `INSERT INTO ai_cup_2026.analysis_runs(id,workspace_id,session_id,revision,requested_by,model,result)
      SELECT $1,workspace_id,id,revision,$2,$3,$4 FROM ai_cup_2026.sessions WHERE workspace_id=$5 AND id=$6 AND revision=$7`,
      [
        result.id,
        email,
        result.model,
        JSON.stringify(result),
        TEAM_WORKSPACE,
        session.id,
        session.revision,
      ],
    );
    if (!saved.rowCount)
      throw new RequestError(
        "The interview changed during analysis. Reload and try again; your reviewed work was not changed.",
        409,
      );
    return Response.json({ analysis: result }, { headers });
  } catch (error) {
    const message =
      error instanceof RequestError || error instanceof AnalysisError
        ? error.message
        : "Analysis is unavailable. Your saved interview was not changed.";
    return Response.json(
      { error: message },
      { status: error instanceof RequestError ? error.status : 503, headers },
    );
  } finally {
    if (release) await release().catch(() => {});
  }
}
export { handle as GET, handle as POST };
