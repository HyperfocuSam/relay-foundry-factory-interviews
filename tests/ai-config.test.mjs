import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { llmConfig } from "../src/lib/server/llm.ts";

const names = [
  "AI_ANALYSIS_PROVIDER", "QWEN_BASE_URL", "QWEN_MODEL", "QWEN_BIFROST_VIRTUAL_KEY",
  "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_BASE_URL", "GEMINI_GATEWAY_KEY", "LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL", "BIFROST_VIRTUAL_KEY",
];
const qwen = {
  QWEN_BASE_URL: "https://qwen.example.test/v1",
  QWEN_MODEL: "vllm-qwen3-6-35b-a3b/qwen3.6-35b-a3b",
  QWEN_BIFROST_VIRTUAL_KEY: "fake-qwen-key",
};
const gemini = { GEMINI_API_KEY: "fake-gemini-key", GEMINI_MODEL: "gemini-test" };
const legacy = {
  LLM_BASE_URL: "https://legacy.example.test/v1", LLM_MODEL: "legacy-qwen",
  BIFROST_VIRTUAL_KEY: "fake-legacy-key",
};
function runtime(env) {
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, env);
    return llmConfig();
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}
function ci(env) {
  const clean = { ...process.env };
  for (const name of names) delete clean[name];
  return spawnSync("sh", ["-c",
    '. ./ci/configure-ai.sh\nprintf "%s\\n" "$GEMINI_MODEL"',
  ], { env: { ...clean, ...env }, encoding: "utf8" });
}

test("Gemini is the sole provider even with retired Qwen settings", () => {
  const env = { ...legacy, ...qwen, ...gemini, AI_ANALYSIS_PROVIDER: "qwen", LLM_PROVIDER: "bifrost" };
  assert.equal(runtime(env).provider, "gemini");
  assert.equal(runtime(env).key, gemini.GEMINI_API_KEY);
  const result = ci(env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), gemini.GEMINI_MODEL);
});
test("Missing or invalid Gemini configuration never falls back to Qwen", () => {
  for (const env of [qwen, { ...qwen, GEMINI_API_KEY: "test" }, { ...gemini, GEMINI_MODEL: "../bad" }]) {
    assert.throws(() => runtime(env));
  }
  assert.notEqual(ci({ GEMINI_API_KEY: "test" }).status, 0);
  assert.notEqual(ci({ ...gemini, GEMINI_MODEL: "../bad" }).status, 0);
  assert.equal(ci({}).status, 0, "Manual review remains available without AI");
});
