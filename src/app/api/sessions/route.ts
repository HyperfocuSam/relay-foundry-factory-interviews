import { readJson } from "@/lib/server/read-json";
import { cookies } from "next/headers";
import {
  allowedOrigin,
  COOKIE_NAME,
  currentUser,
  TEAM_WORKSPACE,
} from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import {
  listSessions,
  RequestError,
  writeSession,
} from "@/lib/server/session-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

async function handle(request: Request) {
  try {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token)
      throw new RequestError("Sign in to access your team workspace.", 401);
    const pool = database();
    if (!(await currentUser(pool, token)))
      throw new RequestError(
        "Your sign-in expired. Sign in again before saving.",
        401,
      );
    if (request.method !== "GET" && !allowedOrigin(request))
      throw new RequestError("Request origin is not allowed.", 403);
    const workspace = TEAM_WORKSPACE;
    if (request.method === "GET")
      return Response.json(
        { version: 1, sessions: await listSessions(pool, workspace) },
        { headers },
      );
    const data = await readJson(request, 2_000_000);
    const session = await writeSession(
      pool,
      workspace,
      request.method as "POST" | "PUT" | "DELETE",
      data,
    );
    return Response.json({ session }, { headers });
  } catch (error) {
    if (error instanceof RequestError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    // Never expose database errors or credentials to clients or deployment logs.
    return Response.json(
      {
        error:
          "Database unavailable. Your change was not confirmed; keep your draft and try again.",
      },
      { status: 503, headers },
    );
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
