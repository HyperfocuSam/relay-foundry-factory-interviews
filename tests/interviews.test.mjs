import test from "node:test";
import assert from "node:assert/strict";
import {
  blockers,
  createExample,
  createSession,
  evidence,
  exportMarkdown,
  paragraphs,
  parseSessions,
  reviseStep,
  stage,
} from "../src/lib/interviews.ts";

test("empty input starts as a planned session without invented sources", () => {
  const session = createSession({
    factory: "Example",
    process: "Check",
    objective: "Understand the check",
    reviewer: "Lee",
  });
  assert.equal(stage(session), "Planned");
  assert.equal(session.sources.length, 0);
  assert.ok(blockers(session).length);
});

test("evidence references preserve multilingual paragraphs without inventing timestamps", () => {
  const source = {
    content: "師傅：先核對送貨單。\n訪問者：然後呢？\n\n師傅：檢查木板。",
  };
  assert.deepEqual(paragraphs(source), [
    "師傅：先核對送貨單。\n訪問者：然後呢？",
    "師傅：檢查木板。",
  ]);
  const session = createExample();
  assert.equal(
    evidence(session, session.steps[1]),
    paragraphs(session.sources[0])[1],
  );
});

test("editing a confirmed step invalidates confirmation and retains prior wording", () => {
  const step = createExample().steps[0];
  const updated = reviseStep(
    step,
    "Check only standard deliveries.",
    "Standard boards only.",
  );
  assert.equal(updated.confirmedBy, "");
  assert.equal(updated.history[0].text, step.text);
  assert.equal(updated.history[0].conditions, step.conditions);
  assert.equal(updated.sourceId, step.sourceId);
  assert.strictEqual(reviseStep(step, step.text, step.conditions), step);
});

test("unanswered and deferred questions block a ready decision", () => {
  const session = createExample();
  session.steps.forEach((step) => {
    step.confirmedBy = session.reviewer;
  });
  session.decision = {
    outcome: "ai",
    summary: "Try sourced lookup",
    rationale: "Compare existing lookup steps",
    owner: "Lee",
    alternative: "Indexed document",
    test: "Ten questions",
    baseline: "Measure current lookup time",
    success: "Faster correct responses",
    stop: "Any unsupported safety instruction",
  };
  for (const status of ["open", "unknown", "deferred", "declined"]) {
    session.gaps[0].status = status;
    assert.equal(stage(session), "Needs review");
  }
  session.gaps[0].status = "resolved";
  assert.equal(
    stage(session),
    "Needs review",
    "resolved without a response is not enough",
  );
  session.gaps[0].response = "Purchasing lead will confirm the custom process.";
  assert.equal(stage(session), "Ready for decision");
  session.decision.stop = "";
  assert.equal(stage(session), "Needs review");
});

test("corrupted and dangling source references are rejected without silently resetting", () => {
  assert.throws(() => parseSessions("not-json"));
  assert.throws(() =>
    parseSessions(JSON.stringify({ version: 2, sessions: [] })),
  );
  const session = createExample();
  session.steps[0].sourceId = "missing";
  assert.throws(
    () => parseSessions(JSON.stringify({ version: 1, sessions: [session] })),
    /Missing source/,
  );
});

test("saved records round-trip; duplicate sessions and empty resolved answers are rejected", () => {
  const session = createExample();
  assert.deepEqual(
    parseSessions(JSON.stringify({ version: 1, sessions: [session] })),
    [session],
  );
  assert.throws(
    () =>
      parseSessions(
        JSON.stringify({ version: 1, sessions: [session, session] }),
      ),
    /Duplicate/,
  );
  session.gaps[0].status = "resolved";
  assert.throws(
    () => parseSessions(JSON.stringify({ version: 1, sessions: [session] })),
    /Invalid question/,
  );
});

test("exports carry source material, revision, uncertainty, and synthetic provenance", () => {
  const session = createExample();
  const output = exportMarkdown(session);
  assert.match(output, /Status: NOT READY/);
  assert.match(output, /Material: Synthetic example/);
  assert.match(output, /Revision: 1/);
  assert.ok(output.includes(session.sources[0].id));
  assert.ok(output.includes("paragraph 2"));
  assert.ok(output.includes(session.gaps[0].question));
  assert.match(output, /UNCONFIRMED/);
  assert.match(output, /No response/);
});
