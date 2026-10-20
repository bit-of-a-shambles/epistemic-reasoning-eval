import test from "node:test";
import assert from "node:assert/strict";
import { createProvider, validateModel } from "../lib/providers.js";
const base = {
  model: "pinned-test-model",
  provider: "openai",
  maxOutputTokens: 2048,
  track: "default",
};
const messages = [
  { role: "system", content: "protocol" },
  { role: "user", content: "first" },
  { role: "assistant", content: "answer" },
  { role: "user", content: "update" },
];
test("OpenAI sends Responses messages and records reasoning-inclusive usage", async () => {
  let request;
  const provider = createProvider(
    { ...base, pricing: { inputPerMillion: 1, outputPerMillion: 2 } },
    {
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async (url, args) => {
        request = { url, ...args };
        return {
          ok: true,
          json: async () => ({
            id: "r",
            model: "resolved-version",
            status: "completed",
            output: [
              { type: "reasoning", summary: [] },
              {
                type: "message",
                content: [{ type: "output_text", text: "answer" }],
              },
            ],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              output_tokens_details: { reasoning_tokens: 10 },
            },
          }),
        };
      },
    },
  );
  const result = await provider(messages),
    body = JSON.parse(request.body);
  assert.equal(body.store, false);
  assert.equal(body.instructions, "protocol");
  assert.equal(body.input.length, 3);
  assert.equal(body.max_output_tokens, 2048);
  assert.equal(body.temperature, undefined);
  assert.equal(result.text, "answer");
  assert.equal(result.resolvedModel, "resolved-version");
  assert.equal(result.estimatedCost, 0.00014);
  assert.equal(JSON.stringify(result).includes("test-key"), false);
});
test("Anthropic separates system prompt and does not treat truncation as completion", async () => {
  let body, headers;
  const provider = createProvider(
    { ...base, provider: "anthropic" },
    {
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchImpl: async (url, args) => {
        body = JSON.parse(args.body);
        headers = args.headers;
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text: "partial" }],
            stop_reason: "max_tokens",
            usage: { input_tokens: 2, output_tokens: 3 },
          }),
        };
      },
    },
  );
  const result = await provider(messages);
  assert.equal(body.system, "protocol");
  assert.equal(body.messages.length, 3);
  assert.equal(body.max_tokens, 2048);
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(result.status, "incomplete");
  assert.equal(result.estimatedCost, null);
});
test("HTTP errors do not print response bodies or credentials", async () => {
  const provider = createProvider(base, {
    env: { OPENAI_API_KEY: "secret" },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => "secret echoed",
    }),
  });
  await assert.rejects(
    () => provider(messages),
    (e) => e.message.includes("429") && !e.message.includes("secret"),
  );
});
test("config requires explicit identities and excludes secrets", () => {
  assert.throws(
    () => validateModel({ ...base, apiKey: "secret" }),
    /credentials/,
  );
  assert.throws(
    () => validateModel({ ...base, model: "REPLACE_WITH_PINNED_MODEL_ID" }),
    /Replace/,
  );
  assert.throws(
    () => validateModel({ ...base, maxOutputTokens: 0 }),
    /maxOutputTokens/,
  );
  assert.throws(
    () => createProvider(base, { env: {} }),
    /Missing OPENAI_API_KEY/,
  );
});
