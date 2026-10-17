import { cookies } from "next/headers";
import {
  allowedOrigin,
  COOKIE_NAME,
  currentUser,
  TEAM_WORKSPACE,
} from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { readJson } from "@/lib/server/read-json";
import { RequestError } from "@/lib/server/session-repository";
import { meetingConfig, meetingToken, meetingDisplayName } from "@/lib/server/meeting";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  try {
    if (!allowedOrigin(request))
      throw new RequestError("Request origin is not allowed.", 403);
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token)
      throw new RequestError("Sign in to join your team’s meeting.", 401);
    const pool = database();
    const email = await currentUser(pool, token);
    if (!email)
      throw new RequestError("Sign in again to join the meeting.", 401);
    const input = (await readJson(request, 1024)) as {
      sessionId?: unknown;
      displayName?: unknown;
    } | null;
    if (
      !input ||
      typeof input.sessionId !== "string" ||
      !/^[a-f0-9]{32}$/.test(input.sessionId)
    )
      throw new RequestError("Invalid session ID.");
    const displayName = input.displayName === undefined
      ? undefined
      : meetingDisplayName(input.displayName);
    const session = await pool.query(
      "SELECT id FROM ai_cup_2026.sessions WHERE workspace_id=$1 AND id=$2",
      [TEAM_WORKSPACE, input.sessionId],
    );
    if (!session.rowCount) throw new RequestError("Session not found.", 404);
    const config = meetingConfig();
    if (!config)
      throw new RequestError(
        "Calls are not configured yet. You can still capture notes below.",
        503,
      );
    return Response.json(
      {
        token: await meetingToken(input.sessionId, email, config, displayName),
        serverUrl: config.url,
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RequestError
            ? error.message
            : "Could not join the meeting. Please retry.",
      },
      { status: error instanceof RequestError ? error.status : 503, headers },
    );
  }
}
