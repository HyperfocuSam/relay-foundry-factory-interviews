import test from "node:test";
import assert from "node:assert/strict";
import { createExample, paragraphs } from "../src/lib/interviews.ts";
import { validateAnalysis } from "../src/lib/analysis.ts";
import { analyze } from "../src/lib/server/llm.ts";
const config = {
  url: "https://example.test/v1/chat/completions",
  key: "test-vkey-not-real",
  model: "vllm-qwen3-6-35b-a3b/qwen3.6-35b-a3b",
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
test("analysis uses Bifrost virtual-key header, selected evidence and exact model", async () => {
  const { session, source, result } = fixture();
  const draft = await analyze(
    session,
    [source.id],
    config,
    async (url, options) => {
      assert.equal(url, config.url);
      assert.equal(options.headers["x-bf-vk"], config.key);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, "error");
      const body = JSON.parse(options.body);
      assert.equal(body.model, config.model);
      assert.equal(body.stream, false);
      assert.equal(body.response_format.type, "json_object");
      assert.ok(body.messages[1].content.includes(source.id));
      assert.ok(!body.messages[1].content.includes(config.key));
      return completion(result);
    },
  );
  assert.equal(draft.revision, session.revision);
  assert.match(draft.steps[0].id, /^[a-f0-9]{32}$/);
  assert.equal(
    session.steps.length,
    2,
    "analysis does not mutate reviewed steps",
  );
  assert.equal(draft.steps[0].confirmedBy, undefined);
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
