import { cookies } from "next/headers";
import { allowedOrigin, COOKIE_NAME, currentUser, TEAM_WORKSPACE } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { readJson } from "@/lib/server/read-json";
import { RequestError } from "@/lib/server/session-repository";
import { transcribeAudio, validateAudio } from "@/lib/server/transcription";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  try {
    if (!allowedOrigin(request)) throw new RequestError("Request origin is not allowed.", 403);
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) throw new RequestError("Sign in to transcribe the meeting.", 401);
    const pool = database();
    if (!await currentUser(pool, token)) throw new RequestError("Sign in again to transcribe the meeting.", 401);
    const input = validateAudio(await readJson(request, 5_400_000));
    const session = await pool.query("SELECT id FROM ai_cup_2026.sessions WHERE workspace_id=$1 AND id=$2", [TEAM_WORKSPACE, input.sessionId]);
    if (!session.rowCount) throw new RequestError("Session not found.", 404);
    return Response.json({ text: await transcribeAudio(input) }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof RequestError ? error.message : "Could not transcribe the meeting. Retry with your retained audio draft." },
      { status: error instanceof RequestError ? error.status : 503, headers });
  }
}
