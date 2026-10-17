import test from "node:test";
import assert from "node:assert/strict";
import { TokenVerifier } from "livekit-server-sdk";
import { meetingToken, meetingConfig, meetingDisplayName } from "../src/lib/server/meeting.ts";

test("meeting credentials grant only one session room, without administrative access", async () => {
  const config = {
    url: "wss://meet.example.test",
    key: "testkey",
    secret: "test-secret-for-local-validation-only",
  };
  const jwt = await meetingToken("a".repeat(32), "member@example.test", config);
  const claims = await new TokenVerifier(config.key, config.secret).verify(jwt);
  assert.equal(claims.video.room, "ai-cup-team-" + "a".repeat(32));
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.roomAdmin, false);
  assert.equal(claims.name, "member@example.test");
  assert.ok(claims.exp - claims.nbf <= 300);
  await assert.rejects(
    meetingToken("../other-room", "member@example.test", config),
  );
});
test("meeting config stays disabled when credentials are absent", () => {
  const previous = process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_API_SECRET;
  try {
    assert.equal(meetingConfig(), null);
  } finally {
    if (previous !== undefined) process.env.LIVEKIT_API_SECRET = previous;
  }
});

test("the same account can join the same room from multiple browser connections", async () => {
  const config = {
    url: "wss://meet.example.test",
    key: "testkey",
    secret: "test-secret-for-local-validation-only",
  };
  const verifier = new TokenVerifier(config.key, config.secret);
  const first = await verifier.verify(
    await meetingToken("a".repeat(32), "member@example.test", config, " Alice "),
  );
  const second = await verifier.verify(
    await meetingToken("a".repeat(32), "member@example.test", config, "Anonymous"),
  );
  assert.ok(first.sub);
  assert.ok(second.sub);
  assert.notEqual(first.sub, second.sub);
  assert.equal(first.name, "Alice");
  assert.equal(second.name, "Anonymous");
  assert.equal(first.video.room, second.video.room);
  assert.equal(first.video.canPublishData, true);
  assert.equal(second.video.canPublishData, true);
});

test("meeting names accept aliases and reject empty, oversized or control-character input", () => {
  assert.equal(meetingDisplayName("  訪客  "), "訪客");
  assert.equal(meetingDisplayName("a".repeat(80)), "a".repeat(80));
  for (const value of [null, 42, {}, "", "   ", "a".repeat(81), "Alice\nBob", "A\u0000B"]) {
    assert.throws(() => meetingDisplayName(value), { status: 400 });
  }
});
