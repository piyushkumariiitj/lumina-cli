import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import { AIServiceModelClient, toModelMessages, classifyModelError } from "../src/agent/model-client.js";
import { TOOL_DEFINITIONS } from "../src/agent/tools.js";

const usage = {
  inputTokens: { total: 30, noCache: 30, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 12, text: 12, reasoning: 0 },
};

test("toModelMessages maps the neutral format to AI SDK messages", () => {
  const messages = toModelMessages([
    { role: "user", content: "do it" },
    { role: "assistant", text: "Looking.", toolCalls: [{ id: "c1", name: "read_file", input: { path: "a.js" } }] },
    { role: "tool", results: [{ id: "c1", name: "read_file", output: { ok: true, content: "x" } }] },
  ]);
  assert.deepEqual(messages, [
    { role: "user", content: "do it" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Looking." },
        { type: "tool-call", toolCallId: "c1", toolName: "read_file", input: { path: "a.js" } },
      ],
    },
    {
      role: "tool",
      content: [
        { type: "tool-result", toolCallId: "c1", toolName: "read_file", output: { type: "json", value: { ok: true, content: "x" } } },
      ],
    },
  ]);
});

test("generate() sends real tool schemas and returns parsed tool calls", async () => {
  let seenTools;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      seenTools = options.tools;
      return {
        content: [
          { type: "text", text: "Reading the file." },
          { type: "tool-call", toolCallId: "t1", toolName: "read_file", input: JSON.stringify({ path: "src/a.js" }) },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage,
        warnings: [],
      };
    },
  });
  const client = new AIServiceModelClient({ ensureApiKey: async () => "k", model, fallbackModel: null });
  const res = await client.generate({ system: "s", messages: [{ role: "user", content: "hi" }], tools: TOOL_DEFINITIONS });

  // The bug in tool.config.js was empty schemas; make sure ours carry properties.
  const readFile = seenTools.find((t) => t.name === "read_file");
  assert.deepEqual(Object.keys(readFile.inputSchema.properties).sort(), ["endLine", "path", "startLine"]);
  assert.deepEqual(readFile.inputSchema.required, ["path"]);

  assert.equal(res.text, "Reading the file.");
  assert.deepEqual(res.toolCalls, [{ id: "t1", name: "read_file", input: { path: "src/a.js" }, invalid: false, error: undefined }]);
  assert.deepEqual(res.usage, { inputTokens: 30, outputTokens: 12 });
});

test("invalid tool arguments are surfaced instead of executed", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "tool-call", toolCallId: "t1", toolName: "read_file", input: JSON.stringify({ wrong: 1 }) }],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
      warnings: [],
    }),
  });
  const client = new AIServiceModelClient({ ensureApiKey: async () => "k", model });
  const res = await client.generate({ system: "s", messages: [{ role: "user", content: "hi" }], tools: TOOL_DEFINITIONS });
  assert.equal(res.toolCalls[0].invalid, true);
  assert.ok(res.toolCalls[0].error);
});

test("rate limits fall back to the secondary model", async () => {
  const primary = new MockLanguageModelV4({
    doGenerate: async () => {
      const err = new Error("Rate limit reached");
      err.statusCode = 429;
      throw err;
    },
  });
  const fallback = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: "from fallback" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });
  const client = new AIServiceModelClient({ ensureApiKey: async () => "k", model: primary, fallbackModel: fallback });
  const res = await client.generate({ system: "s", messages: [{ role: "user", content: "hi" }], tools: TOOL_DEFINITIONS });
  assert.equal(res.text, "from fallback");
});

test("classifyModelError recognizes provider failures", () => {
  const withStatus = (statusCode, message = "x") => Object.assign(new Error(message), { statusCode });
  assert.equal(classifyModelError(withStatus(429)).kind, "rate_limit");
  assert.equal(classifyModelError(withStatus(401)).kind, "auth");
  assert.equal(classifyModelError(withStatus(400, "tool_use_failed: Failed to call a function")).kind, "tool_use_failed");
  assert.equal(classifyModelError(withStatus(413, "Request too large")).kind, "context_too_large");
  assert.equal(classifyModelError({ lastError: withStatus(503) }).kind, "model_unavailable");
});
