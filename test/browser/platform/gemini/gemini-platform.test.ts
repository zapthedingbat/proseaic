// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { GeminiPlatform } from "../../../../src/browser/platform/gemini/gemini-platform";
import type { IGeminiStreamReader } from "../../../../src/browser/platform/gemini/gemini-stream-reader";
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
    json: vi.fn().mockResolvedValue({ models: [], nextPageToken: undefined }),
    ...overrides,
  });
}

type GeminiChunk = {
  candidates?: Array<{
    content?: { parts: Array<{ text?: string } | { functionCall: { name: string; args: Record<string, unknown> } }> };
    finishReason?: string;
  }>;
};

function makeReaderFactory(chunks: GeminiChunk[] = []) {
  const reader: IGeminiStreamReader = {
    read: vi.fn(async function* () {
      for (const chunk of chunks) yield chunk as never;
    }) as IGeminiStreamReader["read"],
  };
  return vi.fn().mockReturnValue(reader);
}

const doneChunk: GeminiChunk = {
  candidates: [{ content: { parts: [] }, finishReason: "STOP" }],
};

function makePlatform(opts: { apiKey?: string; fetch?: ReturnType<typeof makeFetch>; readerFactory?: ReturnType<typeof makeReaderFactory> } = {}) {
  return new GeminiPlatform(
    vi.fn().mockReturnValue(makeLogger()),
    opts.fetch ?? makeFetch(),
    () => opts.apiKey ?? "gemini-test-key",
    opts.readerFactory ?? makeReaderFactory([doneChunk]),
    new UrlResolver("https://generativelanguage.googleapis.com", "https://generativelanguage.googleapis.com")
  );
}

const model: Model = { name: "gemini-2.0-flash", platform: "Gemini" };
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
  it("posts to the streamGenerateContent endpoint for the model", async () => {
    const fetch = makeFetch();
    await drain(makePlatform({ fetch }).generate(model, [userMsg], []));
    expect(String(fetch.mock.calls[0][0])).toContain("gemini-2.0-flash:streamGenerateContent");
  });

  it("includes the API key as a query parameter", async () => {
    const fetch = makeFetch();
    await drain(makePlatform({ fetch, apiKey: "my-api-key" }).generate(model, [userMsg], []));
    expect(String(fetch.mock.calls[0][0])).toContain("key=my-api-key");
  });

  it("yields text_delta and done events", async () => {
    const readerFactory = makeReaderFactory([
      { candidates: [{ content: { parts: [{ text: "Hi there" }] } }] },
      doneChunk,
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({ type: "text_delta", text: "Hi there" });
    expect(events).toContainEqual({ type: "done" });
  });

  it("emits a done event even when no finishReason is present in any chunk", async () => {
    const readerFactory = makeReaderFactory([
      { candidates: [{ content: { parts: [{ text: "text" }] } }] },
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({ type: "done" });
  });

  it("emits a tool_call event from a functionCall part", async () => {
    const readerFactory = makeReaderFactory([
      {
        candidates: [{
          content: { parts: [{ functionCall: { name: "search", args: { q: "hi" } } }] },
          finishReason: "STOP",
        }],
      },
    ]);
    const events = await drain(makePlatform({ readerFactory }).generate(model, [userMsg], []));
    expect(events).toContainEqual({
      type: "tool_call",
      tool_call: expect.objectContaining({ name: "search", arguments: { q: "hi" } }),
    });
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 400, statusText: "Bad Request" });
    await expect(drain(makePlatform({ fetch }).generate(model, [userMsg], []))).rejects.toThrow("Gemini API error");
  });
});

// ---------------------------------------------------------------------------
// getModels
// ---------------------------------------------------------------------------

describe("getModels", () => {
  it("fetches from /v1beta/models", async () => {
    const fetch = makeFetch();
    await makePlatform({ fetch }).getModels();
    expect(String(fetch.mock.calls[0][0])).toContain("/v1beta/models");
  });

  it("maps items to Model objects, stripping the models/ prefix", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({
        models: [{ name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] }],
        nextPageToken: undefined,
      }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models[0]).toMatchObject({ name: "gemini-2.0-flash", platform: "Gemini" });
  });

  it("excludes models that do not support generateContent", async () => {
    const fetch = makeFetch({
      json: vi.fn().mockResolvedValue({
        models: [
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
        ],
        nextPageToken: undefined,
      }),
    });
    const models = await makePlatform({ fetch }).getModels();
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe("gemini-2.0-flash");
  });

  it("throws when the API returns an error status", async () => {
    const fetch = makeFetch({ ok: false, status: 403, statusText: "Forbidden" });
    await expect(makePlatform({ fetch }).getModels()).rejects.toThrow("Gemini API error");
  });
});
