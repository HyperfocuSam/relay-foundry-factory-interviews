import test from "node:test";
import assert from "node:assert/strict";
import { validateAudio, transcribeAudio, transcriptionConfig, AUDIO_BYTE_LIMIT } from "../src/lib/server/transcription.ts";

const input = { sessionId: "a".repeat(32), consent: true, mimeType: "audio/webm", audio: Buffer.from("audio fixture").toString("base64") };
const config = { key: "fake-key", model: "gemini-test" };
test("audio validation enforces agreement, session, format, canonical base64 and byte limits", () => {
  assert.equal(validateAudio(input).sessionId, input.sessionId);
  for (const override of [{ consent: false }, { sessionId: "../other" }, { mimeType: "video/webm" }, { audio: "###=" }, { audio: "YR==" }, { audio: "" }])
    assert.throws(() => validateAudio({ ...input, ...override }));
  assert.throws(() => validateAudio({ ...input, audio: Buffer.alloc(AUDIO_BYTE_LIMIT + 1).toString("base64") }), { status: 413 });
});
test("transcription sends only audio with server credentials and preserves source language", async () => {
  const text = await transcribeAudio(input, config, async (url, options) => {
    assert.match(url, /gemini-test:generateContent$/);
    assert.equal(options.headers["x-goog-api-key"], config.key);
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.contents[0].parts[0].inlineData, { mimeType: input.mimeType, data: input.audio });
    assert.match(body.systemInstruction.parts[0].text, /Do not translate/);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "private reasoning", thought: true }, { text: "檢查 machine one." }] } }] });
  });
  assert.equal(text, "檢查 machine one.");
});
test("silence can return an empty transcript without invented messages", async () => {
  assert.equal(await transcribeAudio(input, config, async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "" }] } }] })), "");
});
test("provider rejection, incomplete output, oversized output and timeout retain actionable retry errors", async () => {
  for (const send of [
    async () => new Response("denied", { status: 403 }),
    async () => new Response("busy", { status: 429 }),
    async () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "partial" }] } }] }),
    async () => new Response("x".repeat(250_001)),
    async () => { throw new DOMException("Timed out", "TimeoutError"); },
  ]) await assert.rejects(transcribeAudio(input, config, send), /retained/);
});
test("transcription configuration requires Gemini even when review uses Qwen", () => {
  const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_API_KEY;
    assert.throws(() => transcriptionConfig(), { status: 503 });
    process.env.GEMINI_API_KEY = "fake";
    process.env.GEMINI_MODEL = "../unsafe";
    assert.throws(() => transcriptionConfig(), { status: 503 });
  } finally {
    if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
    if (model === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = model;
  }
});
