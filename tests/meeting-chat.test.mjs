import test from "node:test";
import assert from "node:assert/strict";
import { ChatCaptureCursor, appendChatMessages, chatTranscript } from "../src/lib/meeting-chat.ts";
import { paragraphs } from "../src/lib/interviews.ts";

const entry = (id, message, speaker = "Alice") => ({
  id, message, speaker, timestamp: Date.UTC(2026, 9, 1, 9),
});

test("capture excludes earlier history and stopped periods, while preserving streamed message updates", () => {
  const cursor = new ChatCaptureCursor();
  const old = entry("old", "Before consent");
  assert.deepEqual(cursor.read([old], false), []);
  assert.deepEqual(cursor.read([old], true), []);
  const partial = entry("new", "Factory");
  let draft = appendChatMessages([], cursor.read([old, partial], true));
  const complete = entry("new", "Factory inspection takes 20 minutes.");
  draft = appendChatMessages(draft, cursor.read([old, complete], true));
  assert.equal(draft.length, 1);
  assert.equal(draft[0].message, complete.message);
  assert.deepEqual(cursor.read([old, complete], true), []);
  const stopped = entry("stopped", "Not captured");
  assert.deepEqual(cursor.read([old, complete, stopped], false), []);
  assert.deepEqual(cursor.read([old, complete, stopped], true), []);
  assert.deepEqual(cursor.read([old, complete, stopped, entry("resumed", "Next part")], true), [entry("resumed", "Next part")]);
});

test("chat sources preserve names, timestamps and multilingual text as citable paragraphs", () => {
  const messages = [entry("1", "第一步\n\n檢查品質", "訪客"), entry("2", "Next step", "Anonymous")];
  const text = chatTranscript(messages);
  assert.match(text, /\[2026-10-01T09:00:00.000Z\] 訪客: 第一步\n檢查品質/);
  assert.match(text, /Anonymous: Next step/);
  assert.equal(paragraphs({ content: text }).length, 2);
});

test("oversized or invalid messages do not mutate the recoverable draft", () => {
  const draft = [entry("1", "Saved draft")];
  const original = structuredClone(draft);
  assert.throws(() => appendChatMessages(draft, [entry("2", "a".repeat(50_000))]), /limit/);
  assert.throws(() => appendChatMessages(draft, [{ ...entry("2", "bad"), timestamp: NaN }]), /timestamp/);
  assert.deepEqual(draft, original);
  assert.deepEqual(appendChatMessages(draft, [entry("2", "   ")]), draft);
});
