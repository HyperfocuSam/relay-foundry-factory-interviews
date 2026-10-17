import test from "node:test";
import assert from "node:assert/strict";
import { createExample, paragraphs } from "../src/lib/interviews.ts";
import { exportReportMarkdown, validateAnalysis } from "../src/lib/analysis.ts";
import { analyze, llmConfig } from "../src/lib/server/llm.ts";

const config = {
  provider: "gemini", key: "test-gemini-key-not-real", model: "gemini-test",
  url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
};
function fixture() {
  const session = createExample();
  const source = session.sources[0];
  const citation = { sourceId: source.id, paragraph: 0, quote: paragraphs(source)[0] };
  const output = {
    steps: [{ ...citation, text: "Check delivery paperwork.", conditions: "Before unloading." }],
    questions: [{ ...citation, question: "Who owns this check?", reason: "Assign responsibility." }],
    report: {
      overview: [{ ...citation, text: "Deliveries are checked before unloading." }],
      missingInformation: ["Responsible person and baseline are unknown."],
      recommendation: { ...session.decision, summary: "Confirm the process first.", rationale: "Responsibilities need review." },
      evidence: [citation],
    },
  };
  return { session, source, output };
}
const completion = (output, finishReason = "STOP") => Response.json({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(output) }] } }],
});

test("Gemini drafts a cited report with native structured output and preserves reviewed work", async () => {
  const { session, source, output } = fixture();
  const before = structuredClone(session);
  const draft = await analyze(session, [source.id], config, async (url, options) => {
    assert.equal(url, config.url);
    assert.equal(options.headers["x-goog-api-key"], config.key);
    assert.equal(options.headers["x-bf-vk"], undefined);
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.ok(body.generationConfig.responseFormat.text.schema.required.includes("report"));
    assert.ok(body.contents[0].parts[0].text.includes(source.id));
    assert.ok(!options.body.includes(config.key));
    assert.match(body.systemInstruction.parts[0].text, /inference, never an approval/);
    return completion(output);
  });
  assert.deepEqual(draft.report, output.report);
  assert.deepEqual(session, before);
  assert.match(draft.steps[0].id, /^[a-f0-9]{32}$/);
  const markdown = exportReportMarkdown(session, draft);
  assert.match(markdown, /UNREVIEWED/);
  assert.ok(markdown.includes(source.id));
  for (const line of output.report.evidence[0].quote.split("\n")) assert.ok(markdown.includes(`> ${line}`));
  assert.match(markdown, /Owner: unassigned/);
  assert.match(markdown, /comparison has not been completed/);
  assert.match(exportReportMarkdown({ ...session, revision: session.revision + 1 }, draft), /STALE/);
});

test("report validation rejects invented citations, malformed decisions and premature pilot outcomes", () => {
  const { session, source, output } = fixture();
  const mutations = [
    (report) => { report.overview[0].quote = "Invented evidence"; },
    (report) => { report.evidence[0].sourceId = "unselected"; },
    (report) => { report.evidence[0].paragraph = -1; },
    (report) => { report.recommendation.outcome = "ai"; },
    (report) => { report.recommendation.summary = ""; },
    (report) => { report.recommendation.outcome = "unknown"; },
    (report) => { report.evidence = []; },
    (report) => { report.overview = Array(9).fill(report.overview[0]); },
    (report) => { report.missingInformation = [null]; },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(output);
    mutate(bad.report);
    assert.throws(() => validateAnalysis(bad, session, [source.id]));
  }
  const premature = structuredClone(output);
  premature.report.missingInformation = [];
  premature.questions = [];
  premature.report.recommendation.outcome = "ai";
  assert.throws(() => validateAnalysis(premature, session, [source.id]));
  Object.assign(premature.report.recommendation, {
    alternative: "Manual checklist", test: "Proposed test: replay an exported sample",
    baseline: "Recorded current review time", success: "Proposed threshold: fewer missed checks",
    stop: "Proposed stop condition: missed rejection",
  });
  assert.equal(validateAnalysis(premature, session, [source.id]).report.recommendation.outcome, "ai");
});

test("Gemini retains multilingual evidence and joins text parts without exposing thought content", async () => {
  const { session, source, output } = fixture();
  source.content = "師傅：每次出貨都要檢查數量。";
  const citation = { sourceId: source.id, paragraph: 0, quote: "每次出貨都要檢查數量" };
  output.steps = [{ ...citation, text: "檢查出貨數量。", conditions: "每次出貨。" }];
  output.questions = [];
  output.report.overview = [{ ...citation, text: "出貨前檢查數量。" }];
  output.report.evidence = [citation];
  const json = JSON.stringify(output);
  const draft = await analyze(session, [source.id], config, async () => Response.json({
    candidates: [{ finishReason: "STOP", content: { parts: [
      { text: "Private thinking is not report content", thought: true },
      { text: json.slice(0, 80) }, { text: json.slice(80) },
    ] } }],
  }));
  assert.equal(draft.report.overview[0].quote, citation.quote);
  assert.match(exportReportMarkdown(session, draft), /出貨前檢查數量/);
  assert.ok(!JSON.stringify(draft).includes("Private thinking"));
});

test("Gemini rejects document-only input, missing reports, blocked, truncated and invalid outputs", async () => {
  const { session, source, output } = fixture();
  for (const response of [
    completion({ steps: [], questions: [] }), completion(output, "MAX_TOKENS"),
    Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
    new Response(config.key, { status: 403 }), new Response(config.key, { status: 429 }),
    completion({ ...output, report: null }),
  ]) {
    await assert.rejects(analyze(session, [source.id], config, async () => response), (error) => !error.message.includes(config.key));
  }
  source.kind = "document";
  await assert.rejects(analyze(session, [source.id], config, async () => assert.fail("Must not send")), /transcript/);
});

test("provider configuration selects Gemini without falling back after partial configuration", () => {
  const names = ["AI_ANALYSIS_PROVIDER", "QWEN_BASE_URL", "QWEN_MODEL", "QWEN_BIFROST_VIRTUAL_KEY", "LLM_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_BASE_URL", "GEMINI_GATEWAY_KEY", "LLM_BASE_URL", "LLM_MODEL", "BIFROST_VIRTUAL_KEY"];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.GEMINI_API_KEY = config.key;
    assert.throws(llmConfig, /Gemini is not configured/);
    process.env.GEMINI_MODEL = config.model;
    assert.deepEqual(llmConfig(), config);
    process.env.GEMINI_MODEL = "../invalid";
    assert.throws(llmConfig, /Gemini is not configured/);
    process.env.LLM_PROVIDER = "unsupported";
    assert.throws(llmConfig, /LLM_PROVIDER/);
    process.env.LLM_PROVIDER = "bifrost";
    process.env.LLM_BASE_URL = "https://example.test/v1";
    process.env.LLM_MODEL = "qwen";
    process.env.BIFROST_VIRTUAL_KEY = "fake-bifrost-key";
    assert.equal(llmConfig().provider, "bifrost");
    assert.equal(llmConfig().key, "fake-bifrost-key");
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
