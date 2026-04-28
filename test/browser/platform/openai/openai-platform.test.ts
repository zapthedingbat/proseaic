import { describe, it, expect, vi } from "vitest";
import { OpenAIPlatform } from "../../../../src/browser/platform/openai/openai-platform";
import type { IOpenAIStreamReader } from "../../../../src/browser/platform/openai/openai-stream-reader";
import type { Model } from "../../../../src/browser/lib/models/model";

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
    json: vi.fn().mockResolvedValue({ data: [] }),
    ...overrides,
  });
}

type OpenAIChunk = { choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }> };

function makeReaderFactory(chunks: OpenAIChunk[] = []) {
  const reader: IOpenAIStreamReader = {
    read: vi.fn(async function* () {
      for (const chunk of chunks) yield chunk as never;
    }) as IOpenAIStreamReader["read"],
  };
  return vi.fn().mockReturnValue(reader);
}

const doneChunk: OpenAIChunk = { choices: [{ delta: {}, finish_reason: "stop" }] };

function makePlatform(opts: { apiKey?: string; fetch?: ReturnType<typeof makeFetch>; readerFactory?: ReturnType<typeof makeReaderFactory> } = {}) {
  return new OpenAIPlatform(
    vi.fn().mockReturnValue(makeLogger()),
    opts.fetch ?? makeFetch(),
    () => opts.apiKey ?? "sk-test",
    opts.readerFactory ?? makeReaderFactory([doneChunk]),
    "https://api.openai.com"
  );
}

const model: Model = { name: "gpt-4o", platform: "OpenAI" };
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
    expect(makePlatform({ apiKey: "sk-abc" }).isAvailable()).toBe(true);
  });

  it("returns false when the API key is empty", () => {
    expect(makePlatform({ apiKey: "" }).isAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------

describe("generate", () => {
  it("posts to /v1/chat/completions", async () => {
    const fetch = makeFetch();
    await drain(makePlatform({ fetch }).generate(model, [userMsg], []));
    expect(String(fetch.mock.calls[0][0])).toContain("/v1/chat/completions");
  });

  it("includes Bearer auth header with the API key", async () => {
    const fetch = makeFetch();
    await drain(makePlatform({ fetch, apiKey: "sk-mykey" }).generate(model, [userMsg], []));
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-mykey");
  });

  it("yields text_delta and done events", async () => {
    const readerFactory = makeReaderFactory([
      { choices: [{ delta: { content: "Hi" }, finish_reason: null }] },
      doneChunk,
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({ type: "text_delta", text: "Hi" });
    expect(events).toContainEqual({ type: "done" });
  });

  it("emits tool_call events when finish_reason is tool_calls", async () => {
    const readerFactory = makeReaderFactory([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "search", arguments: '{"q":"hi"}' } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({
      type: "tool_call",
      tool_call: expect.objectContaining({ id: "call_1", name: "search", arguments: { q: "hi" } }),
    });
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(drain(makePlatform({ fetch }).generate(model, [userMsg], []))).rejects.toThrow("OpenAI API error");
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

  it("maps API items to Model objects", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({ data: [{ id: "gpt-4o" }] }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models[0]).toMatchObject({ name: "gpt-4o", platform: "OpenAI" });
  });

  it("excludes non-chat model IDs such as embedding and tts models", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({
        data: [
          { id: "gpt-4o" },
          { id: "text-embedding-ada-002" },
          { id: "tts-1" },
          { id: "whisper-1" },
        ],
      }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models.map(m => m.name)).toEqual(["gpt-4o"]);
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 403, statusText: "Forbidden" });
    await expect(makePlatform({ fetch }).getModels()).rejects.toThrow("OpenAI API error");
  });
});
