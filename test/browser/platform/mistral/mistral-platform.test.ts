// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { MistralPlatform } from "../../../../src/browser/platform/mistral/mistral-platform";
import type { IMistralStreamReader } from "../../../../src/browser/platform/mistral/mistral-stream-reader";
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
    json: vi.fn().mockResolvedValue({ object: "list", data: [] }),
    ...overrides,
  });
}

type MistralChunk = { choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }> };

function makeReaderFactory(chunks: MistralChunk[] = []) {
  const reader: IMistralStreamReader = {
    read: vi.fn(async function* () {
      for (const chunk of chunks) yield chunk as never;
    }) as IMistralStreamReader["read"],
  };
  return vi.fn().mockReturnValue(reader);
}

const doneChunk: MistralChunk = { choices: [{ delta: {}, finish_reason: "stop" }] };

function makePlatform(opts: { apiKey?: string; fetch?: ReturnType<typeof makeFetch>; readerFactory?: ReturnType<typeof makeReaderFactory> } = {}) {
  return new MistralPlatform(
    vi.fn().mockReturnValue(makeLogger()),
    opts.fetch ?? makeFetch(),
    () => opts.apiKey ?? "mistral-test-key",
    opts.readerFactory ?? makeReaderFactory([doneChunk]),
    new UrlResolver("https://api.mistral.ai", "https://api.mistral.ai")
  );
}

const model: Model = { name: "mistral-large-latest", platform: "Mistral" };
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
    expect(makePlatform({ apiKey: "my-key" }).isAvailable()).toBe(true);
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
    await drain(makePlatform({ fetch, apiKey: "mk-secret" }).generate(model, [userMsg], []));
    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer mk-secret");
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
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_x", function: { name: "lookup", arguments: '{"k":"v"}' } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({
      type: "tool_call",
      tool_call: expect.objectContaining({ name: "lookup", arguments: { k: "v" } }),
    });
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(drain(makePlatform({ fetch }).generate(model, [userMsg], []))).rejects.toThrow("Mistral API error");
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

  it("maps items to Model objects", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({
        object: "list",
        data: [{ id: "mistral-large-latest", capabilities: { completion_chat: true }, archived: false }],
      }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models[0]).toMatchObject({ name: "mistral-large-latest", platform: "Mistral" });
  });

  it("excludes archived models", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({
        object: "list",
        data: [
          { id: "mistral-large-latest", capabilities: { completion_chat: true }, archived: false },
          { id: "mistral-small-2312", capabilities: { completion_chat: true }, archived: true },
        ],
      }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models.map(m => m.name)).toEqual(["mistral-large-latest"]);
  });

  it("excludes models without completion_chat capability", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({
        object: "list",
        data: [
          { id: "mistral-large-latest", capabilities: { completion_chat: true }, archived: false },
          { id: "mistral-embed", capabilities: { completion_chat: false }, archived: false },
        ],
      }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models.map(m => m.name)).toEqual(["mistral-large-latest"]);
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 403, statusText: "Forbidden" });
    await expect(makePlatform({ fetch }).getModels()).rejects.toThrow("Mistral API error");
  });
});
