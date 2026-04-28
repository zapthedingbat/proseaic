import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiInlineCompletionService } from "../../../../src/browser/lib/completion/inline-completion-service";
import type { IConfigurationService } from "../../../../src/browser/lib/configuration/configuration-service";
import type { IPlatformService } from "../../../../src/browser/lib/platform/platform-service";
import type { Model } from "../../../../src/browser/lib/models/model";
import type { StreamEvent } from "../../../../src/browser/lib/platform/stream-event";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* makeStream(...events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const event of events) yield event;
}

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const results: string[] = [];
  for await (const chunk of iterable) results.push(chunk);
  return results;
}

const testModel: Model = { name: "claude-3", platform: "anthropic" };

function makeConfig(completionModel?: string): IConfigurationService {
  return {
    get: vi.fn().mockImplementation((key: string) =>
      key === "ai.completion.model" ? completionModel : undefined
    ),
    set: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    keys: vi.fn().mockReturnValue([]),
  };
}

function makePlatform(
  models: Model[],
  stream: AsyncIterable<StreamEvent> = makeStream()
): IPlatformService {
  return {
    getModels: vi.fn().mockResolvedValue(models),
    generate: vi.fn().mockReturnValue(stream),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let signal: AbortSignal;

beforeEach(() => {
  signal = new AbortController().signal;
});

// ---------------------------------------------------------------------------
// getCompletion — early exit cases
// ---------------------------------------------------------------------------

describe("getCompletion", () => {
  it("yields nothing when no completion model is configured", async () => {
    const service = new AiInlineCompletionService(
      makeConfig(undefined),
      makePlatform([testModel])
    );
    expect(await collect(service.getCompletion("hello", signal))).toEqual([]);
  });

  it("yields nothing when the configured model is not in the platform model list", async () => {
    const service = new AiInlineCompletionService(
      makeConfig("unknown-model"),
      makePlatform([testModel])
    );
    expect(await collect(service.getCompletion("hello", signal))).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Stream event handling
  // -------------------------------------------------------------------------

  it("yields text from text_delta events", async () => {
    const service = new AiInlineCompletionService(
      makeConfig("claude-3"),
      makePlatform([testModel], makeStream(
        { type: "text_delta", text: "Hello" },
        { type: "text_delta", text: ", world" },
        { type: "done" }
      ))
    );
    expect(await collect(service.getCompletion("start", signal))).toEqual(["Hello", ", world"]);
  });

  it("stops yielding after a done event", async () => {
    const service = new AiInlineCompletionService(
      makeConfig("claude-3"),
      makePlatform([testModel], makeStream(
        { type: "text_delta", text: "before" },
        { type: "done" },
        { type: "text_delta", text: "after" }
      ))
    );
    expect(await collect(service.getCompletion("start", signal))).toEqual(["before"]);
  });

  it("ignores non-text stream events such as reasoning_delta", async () => {
    const service = new AiInlineCompletionService(
      makeConfig("claude-3"),
      makePlatform([testModel], makeStream(
        { type: "reasoning_delta", text: "thinking..." },
        { type: "text_delta", text: "result" },
        { type: "done" }
      ))
    );
    expect(await collect(service.getCompletion("start", signal))).toEqual(["result"]);
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const service = new AiInlineCompletionService(
      makeConfig("claude-3"),
      makePlatform([testModel], makeStream(
        { type: "text_delta", text: "should not appear" }
      ))
    );
    expect(await collect(service.getCompletion("start", controller.signal))).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Context truncation
  // -------------------------------------------------------------------------

  it("passes the full document when it is within the 4000-char limit", async () => {
    const platform = makePlatform([testModel], makeStream({ type: "done" }));
    const service = new AiInlineCompletionService(makeConfig("claude-3"), platform);
    const doc = "a".repeat(4000);

    await collect(service.getCompletion(doc, signal));

    const [, messages] = vi.mocked(platform.generate).mock.calls[0];
    const userContent = messages[1].content[0] as { type: "text"; text: string };
    expect(userContent.text).toContain(doc);
  });

  it("truncates to the last 4000 chars when the document exceeds the limit", async () => {
    const platform = makePlatform([testModel], makeStream({ type: "done" }));
    const service = new AiInlineCompletionService(makeConfig("claude-3"), platform);
    const prefix = "X".repeat(500);
    const tail = "Y".repeat(4000);

    await collect(service.getCompletion(prefix + tail, signal));

    const [, messages] = vi.mocked(platform.generate).mock.calls[0];
    const userContent = messages[1].content[0] as { type: "text"; text: string };
    expect(userContent.text).toContain(tail);
    expect(userContent.text).not.toContain(prefix);
  });

  // -------------------------------------------------------------------------
  // Platform call options
  // -------------------------------------------------------------------------

  it("passes the abort signal and think:false to the platform", async () => {
    const platform = makePlatform([testModel], makeStream({ type: "done" }));
    const service = new AiInlineCompletionService(makeConfig("claude-3"), platform);

    await collect(service.getCompletion("text", signal));

    expect(platform.generate).toHaveBeenCalledWith(
      testModel,
      expect.any(Array),
      [],
      { signal, think: false }
    );
  });
});
