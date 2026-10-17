import { createHash, randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { RequestError } from "./session-repository.ts";

export function meetingDisplayName(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 80 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new RequestError("Enter a meeting name of 1–80 characters.");
  return value.trim();
}

export function meetingConfig() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "wss:" &&
      !(process.env.NODE_ENV !== "production" && parsed.protocol === "ws:")
    )
      return null;
    if (parsed.username || parsed.password) return null;
  } catch {
    return null;
  }
  return { url, key, secret };
}

export async function meetingToken(
  sessionId: string,
  email: string,
  config: NonNullable<ReturnType<typeof meetingConfig>>,
  displayName?: string,
) {
  if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("Invalid session ID");
  // Each join is a separate participant, including tabs using the same account.
  const identity = `${createHash("sha256").update(email).digest("hex")}:${randomUUID()}`;
  const token = new AccessToken(config.key, config.secret, {
    identity,
    name: displayName === undefined ? email : meetingDisplayName(displayName),
    ttl: "5m",
  });
  token.addGrant({
    roomJoin: true,
    room: `ai-cup-team-${sessionId}`,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: false,
  });
  return token.toJwt();
}
