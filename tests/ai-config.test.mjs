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
    '. ./ci/configure-ai.sh\nprintf "%s\\n" "$AI_ANALYSIS_PROVIDER" "$QWEN_BASE_URL" "$QWEN_MODEL" "$QWEN_BIFROST_VIRTUAL_KEY" "$LLM_PROVIDER" "$LLM_BASE_URL" "$LLM_MODEL" "$BIFROST_VIRTUAL_KEY"',
  ], { env: { ...clean, ...env }, encoding: "utf8" });
}

test("Qwen names override legacy aliases in both runtime and CI, preserving rollback aliases", () => {
  const env = { ...legacy, ...qwen, AI_ANALYSIS_PROVIDER: "qwen", LLM_PROVIDER: "gemini" };
  const config = runtime(env);
  assert.equal(config.provider, "bifrost");
  assert.equal(config.url, `${qwen.QWEN_BASE_URL}/chat/completions`);
  assert.equal(config.model, qwen.QWEN_MODEL);
  assert.equal(config.key, qwen.QWEN_BIFROST_VIRTUAL_KEY);
  const result = ci(env);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "qwen", qwen.QWEN_BASE_URL, qwen.QWEN_MODEL, qwen.QWEN_BIFROST_VIRTUAL_KEY,
    "bifrost", qwen.QWEN_BASE_URL, qwen.QWEN_MODEL, qwen.QWEN_BIFROST_VIRTUAL_KEY,
  ]);
});

test("Qwen domain roots use the v1 API while explicit API paths are preserved", () => {
  for (const base of ["https://qwen.example.test", "https://qwen.example.test/", "https://qwen.example.test/v1", "https://qwen.example.test/v1/"]) {
    assert.equal(runtime({ ...qwen, QWEN_BASE_URL: base }).url, "https://qwen.example.test/v1/chat/completions");
  }
  assert.equal(runtime({ ...legacy, LLM_BASE_URL: "https://legacy.example.test" }).url, "https://legacy.example.test/v1/chat/completions");
  assert.equal(runtime({ ...qwen, QWEN_BASE_URL: "https://qwen.example.test/custom/v1" }).url, "https://qwen.example.test/custom/v1/chat/completions");
});

test("adding Gemini credentials does not switch a configured Qwen installation", () => {
  for (const config of [qwen, legacy]) {
    const env = { ...config, ...gemini };
    assert.equal(runtime(env).provider, "bifrost");
    assert.equal(ci(env).stdout.split("\n")[0], "qwen");
    const selected = { ...env, AI_ANALYSIS_PROVIDER: "gemini" };
    assert.equal(runtime(selected).provider, "gemini");
    assert.equal(runtime(selected).key, gemini.GEMINI_API_KEY);
    const result = ci(selected);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.split("\n")[0], "gemini");
    assert.equal(result.stdout.split("\n")[4], "gemini");
  }
});

test("legacy Qwen installations and explicit legacy selection stay compatible", () => {
  assert.equal(runtime(legacy).key, legacy.BIFROST_VIRTUAL_KEY);
  assert.equal(runtime({ ...qwen, ...gemini, LLM_PROVIDER: "gemini" }).provider, "gemini");
  assert.equal(runtime({ ...gemini, ...legacy, LLM_PROVIDER: "bifrost" }).provider, "bifrost");
  assert.equal(runtime(gemini).provider, "gemini");
  assert.equal(ci(legacy).status, 0);
  assert.equal(ci(gemini).stdout.split("\n")[0], "gemini");
  assert.equal(ci({}).status, 0, "AI remains optional for deployment");
});

test("invalid or incomplete provider selections fail without silently switching services", () => {
  for (const env of [
    { ...qwen, AI_ANALYSIS_PROVIDER: "unsupported" },
    { ...gemini, AI_ANALYSIS_PROVIDER: "qwen" },
    { ...qwen, AI_ANALYSIS_PROVIDER: "gemini" },
    { ...gemini, QWEN_MODEL: "partial" },
    { ...qwen, LLM_PROVIDER: "unsupported" },
  ]) {
    assert.throws(() => runtime(env));
    assert.notEqual(ci(env).status, 0);
  }
  // CI rejects partial inactive bundles too; runtime validates the selected service.
  assert.notEqual(ci({ ...qwen, GEMINI_API_KEY: gemini.GEMINI_API_KEY }).status, 0);
});
