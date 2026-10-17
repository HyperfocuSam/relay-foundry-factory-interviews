import { readJson } from "@/lib/server/read-json";
import { RequestError } from "@/lib/server/session-repository";
import { NextResponse } from "next/server";
import { database } from "@/lib/server/database";
import { allowedOrigin, COOKIE_NAME, login } from "@/lib/server/auth";
export async function POST(request: Request) {
  if (!allowedOrigin(request))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  try {
    const input = await readJson(request, 4096);
    if (!input || typeof input !== "object")
      throw new RequestError("Invalid sign-in request.");
    const { email, password } = input as { email: unknown; password: unknown };
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 256
    )
      return NextResponse.json(
        { error: "Invalid sign-in request." },
        { status: 400 },
      );
    const token = await login(database(), email.trim().toLowerCase(), password);
    if (!token)
      return NextResponse.json(
        {
          error:
            "Sign-in failed. Check your details, or wait 15 minutes if you have tried repeatedly.",
        },
        { status: 401 },
      );
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ORIGIN?.startsWith("https://"),
      path: "/",
      maxAge: 604800,
    });
    return response;
  } catch (error) {
    if (error instanceof RequestError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Sign-in is unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
