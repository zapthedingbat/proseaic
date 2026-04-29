// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { AnthropicPlatform } from "../../../../src/browser/platform/anthropic/anthropic-platform";
import type { IAnthropicStreamReader } from "../../../../src/browser/platform/anthropic/anthropic-stream-reader";
import type { AnthropicStreamChunk } from "../../../../src/browser/platform/anthropic/anthropic-request";
import type { Model } from "../../../../src/browser/lib/models/model";
import { UrlResolver } from "../../../../src/browser/lib/url-resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger() {
  return { trace: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

function makeFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    body: new ReadableStream(),
    headers: { get: vi.fn().mockReturnValue(null) },
    json: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    ...overrides,
  });
}

function makeReaderFactory(chunks: AnthropicStreamChunk[] = []) {
  const reader: IAnthropicStreamReader = {
    read: vi.fn(async function* () {
      for (const chunk of chunks) yield chunk;
    }) as IAnthropicStreamReader["read"],
  };
  return vi.fn().mockReturnValue(reader);
}

function makePlatform(opts: { apiKey?: string; fetch?: ReturnType<typeof makeFetch>; readerFactory?: ReturnType<typeof makeReaderFactory> } = {}) {
  return new AnthropicPlatform(
    vi.fn().mockReturnValue(makeLogger()),
    opts.fetch ?? makeFetch(),
    () => opts.apiKey ?? "sk-ant-test",
    opts.readerFactory ?? makeReaderFactory([{ type: "message_stop" } as AnthropicStreamChunk]),
    new UrlResolver("https://api.anthropic.com", "https://api.anthropic.com")
  );
}

const model: Model = { name: "claude-3-5-sonnet-20241022", platform: "Anthropic" };
const userMsg = {
  role: "user" as const,
  model: model.name,
  content: [{ type: "text" as const, text: "Hello" }],
};

async function drain(gen: AsyncIterable<unknown>) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe("isAvailable", () => {
  it("returns true when an API key is configured", () => {
    expect(makePlatform({ apiKey: "sk-ant-abc" }).isAvailable()).toBe(true);
  });

  it("returns false when the API key is empty", () => {
    expect(makePlatform({ apiKey: "" }).isAvailable()).toBe(false);
  });

  it("returns false when the API key is whitespace only", () => {
    expect(makePlatform({ apiKey: "   " }).isAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------

describe("generate", () => {
  it("posts to /v1/messages", async () => {
    const fetch = makeFetch();
    await drain(makePlatform({ fetch }).generate(model, [userMsg], []));
    expect(String(fetch.mock.calls[0][0])).toContain("/v1/messages");
  });

  it("includes x-api-key and anthropic-version headers", async () => {
    const fetch = makeFetch();
    await drain(makePlatform({ fetch, apiKey: "sk-ant-key" }).generate(model, [userMsg], []));
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("yields text_delta events from the stream", async () => {
    const readerFactory = makeReaderFactory([
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } } as AnthropicStreamChunk,
      { type: "message_stop" } as AnthropicStreamChunk,
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({ type: "text_delta", text: "world" });
    expect(events).toContainEqual({ type: "done" });
  });

  it("assembles a tool_call event from content block start/delta/stop", async () => {
    const readerFactory = makeReaderFactory([
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: "search" } } as AnthropicStreamChunk,
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"q":"hi"}' } } as AnthropicStreamChunk,
      { type: "content_block_stop", index: 0 } as AnthropicStreamChunk,
      { type: "message_stop" } as AnthropicStreamChunk,
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({
      type: "tool_call",
      tool_call: { id: "tu_1", name: "search", arguments: { q: "hi" } },
    });
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 500, statusText: "Internal Server Error" });
    await expect(drain(makePlatform({ fetch }).generate(model, [userMsg], []))).rejects.toThrow("Anthropic API error");
  });
});

// ---------------------------------------------------------------------------
// getModels
// ---------------------------------------------------------------------------

describe("getModels", () => {
  it("fetches from /v1/models", async () => {
    const fetch = makeFetch();
    await makePlatform({ fetch }).getModels();
    expect(String(fetch.mock.calls[0][0])).toContain("/v1/models");
  });

  it("maps API items to Model objects with the Anthropic platform tag", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({
        data: [{ id: "claude-3-opus", capabilities: {} }],
        has_more: false,
      }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models[0]).toMatchObject({ name: "claude-3-opus", platform: "Anthropic" });
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(makePlatform({ fetch }).getModels()).rejects.toThrow("Anthropic API error");
  });
});
