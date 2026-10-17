import test from "node:test";
import assert from "node:assert/strict";
import { geminiGateway } from "../src/lib/server/gemini-gateway.ts";
import { transcribeAudio } from "../src/lib/server/transcription.ts";

test("gateway builds an authenticated HTTPS route and rejects unsafe configurations", () => {
  const previous = [process.env.GEMINI_BASE_URL, process.env.GEMINI_GATEWAY_KEY];
  try {
    delete process.env.GEMINI_BASE_URL; delete process.env.GEMINI_GATEWAY_KEY;
    assert.equal(geminiGateway("gemini-test").url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    process.env.GEMINI_BASE_URL = "https://meet.example.test/gemini/v1beta";
    assert.throws(() => geminiGateway("gemini-test"), /GEMINI_GATEWAY_KEY/);
    process.env.GEMINI_GATEWAY_KEY = "dedicated-gateway-key";
    assert.equal(geminiGateway("gemini-test").gatewayKey, "dedicated-gateway-key");
    for (const base of ["http://example.test", "https://user:password@example.test", "https://example.test?key=secret", "https://example.test/#fragment"])
      { process.env.GEMINI_BASE_URL = base; assert.throws(() => geminiGateway("gemini-test")); }
  } finally {
    for (const [index, name] of ["GEMINI_BASE_URL", "GEMINI_GATEWAY_KEY"].entries()) {
      if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
    }
  }
});
test("transcription gateway sends separate relay and Gemini credentials", async () => {
  const config = { key: "gemini-key", model: "gemini-test", url: "https://meet.example.test/gemini/v1beta/models/gemini-test:generateContent", gatewayKey: "relay-key" };
  const text = await transcribeAudio({ audio: "YQ==", mimeType: "audio/webm" }, config, async (url, options) => {
    assert.equal(url, config.url); assert.equal(options.headers["x-ai-cup-gateway-key"], config.gatewayKey);
    assert.equal(options.headers["x-goog-api-key"], config.key);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Actual speech" }] } }] });
  });
  assert.equal(text, "Actual speech");
});
