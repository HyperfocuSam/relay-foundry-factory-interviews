import test from "node:test";
import assert from "node:assert/strict";
import { createExample, paragraphs } from "../src/lib/interviews.ts";
import { validateAnalysis } from "../src/lib/analysis.ts";
import { analyze } from "../src/lib/server/llm.ts";
const config = {
  url: "https://example.test/v1beta/models/gemini-test:generateContent",
  key: "test-gemini-key",
  model: "gemini-test",
};
function fixture() {
  const session = createExample();
  const source = session.sources[0];
  const result = {
    steps: [
      {
        text: "Check delivery paperwork.",
        conditions: "Before unloading.",
        sourceId: source.id,
        paragraph: 0,
        quote: paragraphs(source)[0],
      },
    ],
    questions: [],
  };
  return { session, source, result };
}
const completion = (result) =>
  Response.json({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(result) } },
    ],
  });
test("rejects invented quotes, sources, paragraphs, and excessive suggestions", () => {
  const { session, source, result } = fixture();
  for (const change of [
    { quote: "made-up source passage" },
    { sourceId: "unselected" },
    { paragraph: -1 },
    { paragraph: 999 },
  ]) {
    const invalid = structuredClone(result);
    Object.assign(invalid.steps[0], change);
    assert.throws(() => validateAnalysis(invalid, session, [source.id]));
  }
  assert.throws(() =>
    validateAnalysis(
      { ...result, steps: Array(21).fill(result.steps[0]) },
      session,
      [source.id],
    ),
  );
});
test("preserves Chinese evidence and validates clarification citations", () => {
  const { session, source } = fixture();
  source.content = "師傅：每次出貨都要檢查數量。";
  const citation = {
    sourceId: source.id,
    paragraph: 0,
    quote: "每次出貨都要檢查數量",
  };
  const result = validateAnalysis(
    {
      steps: [],
      questions: [
        { ...citation, question: "由誰檢查？", reason: "確認負責人。" },
      ],
    },
    session,
    [source.id],
  );
  assert.equal(result.questions[0].quote, citation.quote);
});
test("rejects oversized inputs before calling the model", async () => {
  const { session, source } = fixture();
  source.content = "A".repeat(40001);
  let calls = 0;
  await assert.rejects(
    analyze(session, [source.id], config, async () => {
      calls++;
      return completion({});
    }),
    /40,000/,
  );
  assert.equal(calls, 0);
});
test("redacts upstream errors and rejects incomplete or malformed responses", async () => {
  const { session, source } = fixture();
  for (const response of [
    new Response(config.key, { status: 403 }),
    completion({ steps: [{ text: config.key }], questions: [] }),
    Response.json({
      choices: [{ finish_reason: "length", message: { content: config.key } }],
    }),
  ]) {
    await assert.rejects(
      analyze(session, [source.id], config, async () => response),
      (error) => !error.message.includes(config.key),
    );
  }
  await assert.rejects(
    analyze(session, [source.id], config, async () => {
      throw new DOMException("timeout", "TimeoutError");
    }),
    /timed out/,
  );
});
