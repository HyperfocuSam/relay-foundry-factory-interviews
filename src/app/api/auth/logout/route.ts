import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { database } from "@/lib/server/database";
import { allowedOrigin, COOKIE_NAME, tokenHash } from "@/lib/server/auth";
export async function POST(request: Request) {
  if (!allowedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  try {
    if (token)
      await database().query(
        "DELETE FROM ai_cup_2026.auth_sessions WHERE token_hash=$1",
        [tokenHash(token)],
      );
    const response = NextResponse.redirect(new URL("/login", process.env.APP_ORIGIN!), 303);
    response.cookies.delete(COOKIE_NAME);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Sign-out failed. Please retry." },
      { status: 503 },
    );
  }
}
