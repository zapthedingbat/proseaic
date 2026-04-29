// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ChatSession } from "../../../../src/browser/lib/chat/chat-session.js";
import type { ChatMessage, ErrorChatMessage } from "../../../../src/browser/lib/chat/chat-message.js";
import type { StreamEvent } from "../../../../src/browser/lib/platform/stream-event.js";
import type { Agent } from "../../../../src/browser/lib/agent/agent.js";
import type { Model } from "../../../../src/browser/lib/models/model.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function streamFrom(...events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
  };
}

function throwingStream(err: Error): AsyncIterable<StreamEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
      return { next: () => Promise.reject(err) };
    },
  };
}

function makeLogger() {
  return { trace: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

function makeHistory() {
  const stored: ChatMessage[] = [];
  return {
    addMessage: vi.fn(async (msg: ChatMessage) => { stored.push(msg); }),
    getMessages: vi.fn(async (max?: number) => (max !== undefined ? stored.slice(-max) : [...stored])),
    clearHistory: vi.fn(async () => { stored.length = 0; }),
    stored,
  };
}

const TEST_MODEL: Model = { name: "test-model", platform: "TestPlatform" };

function makePlatformService(responses: AsyncIterable<StreamEvent>[], models: Model[] = [TEST_MODEL]) {
  let idx = 0;
  return {
    generate: vi.fn((): AsyncIterable<StreamEvent> => responses[idx++] ?? streamFrom({ type: "done" })),
    getModels: vi.fn(async (): Promise<Model[]> => models),
  };
}

function makeToolsService(executors: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}) {
  return {
    findTool: vi.fn((name: string) => {
      const exec = executors[name];
      return exec ? { execute: exec } : undefined;
    }),
    listToolNames: vi.fn(() => Object.keys(executors)),
    listToolSchemas: vi.fn(() => []),
    addContext: vi.fn(() => ({})),
  };
}

function makeAgent(opts: { continuation?: string | null; continuationOnce?: boolean } = {}): Agent {
  const agent: Agent = {
    id: "test",
    buildSystemPrompt: vi.fn(() => "System prompt."),
    filterTools: vi.fn((tools) => tools),
  };
  if (opts.continuation !== undefined) {
    let fired = false;
    (agent as Agent & { buildContinuationPrompt: () => string | null }).buildContinuationPrompt = vi.fn(() => {
      if (opts.continuationOnce) {
        const result = fired ? null : opts.continuation!;
        fired = true;
        return result;
      }
      return opts.continuation!;
    });
  }
  return agent;
}

function makeSession(opts: {
  responses?: AsyncIterable<StreamEvent>[];
  executors?: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
  agent?: Agent;
  models?: Model[];
} = {}) {
  const logger = makeLogger();
  const history = makeHistory();
  const toolsService = makeToolsService(opts.executors);
  const platform = makePlatformService(opts.responses ?? [streamFrom({ type: "done" })], opts.models);
  const agent = opts.agent ?? makeAgent();
  const session = new ChatSession(
    vi.fn().mockReturnValue(logger),
    platform as any,
    history as any,
    toolsService as any,
    agent,
  );
  return { session, history, platform, toolsService, logger };
}

// ---------------------------------------------------------------------------
// Delegation
// ---------------------------------------------------------------------------

describe("delegation", () => {
  it("getMessages delegates to history", async () => {
    const { session, history } = makeSession();
    await session.getMessages(5);
    expect(history.getMessages).toHaveBeenCalledWith(5);
  });

  it("clearHistory delegates to history", async () => {
    const { session, history } = makeSession();
    await session.clearHistory();
    expect(history.clearHistory).toHaveBeenCalled();
  });

  it("getActiveAssistantChatMessage returns null initially", () => {
    const { session } = makeSession();
    expect(session.getActiveAssistantChatMessage()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// submitUserPrompt — text response
// ---------------------------------------------------------------------------

describe("submitUserPrompt — text response", () => {
  it("adds user and assistant messages to history", async () => {
    const { session, history } = makeSession({
      responses: [streamFrom({ type: "text_delta", text: "Hi" }, { type: "done" })],
    });
    await session.submitUserPrompt("test-model", "Hello");
    expect(history.stored.some(m => m.role === "user")).toBe(true);
    expect(history.stored.some(m => m.role === "assistant")).toBe(true);
  });

  it("accumulates text_delta events into assistant message content", async () => {
    const { session, history } = makeSession({
      responses: [streamFrom({ type: "text_delta", text: "Hello" }, { type: "text_delta", text: ", world" }, { type: "done" })],
    });
    await session.submitUserPrompt("test-model", "Hi");
    const assistant = history.stored.find(m => m.role === "assistant") as { content: Array<{ text: string }> };
    expect(assistant?.content[0]?.text).toBe("Hello, world");
  });

  it("accumulates reasoning_delta events into assistantMessage.thinking", async () => {
    const { session, history } = makeSession({
      responses: [streamFrom({ type: "reasoning_delta", text: "think" }, { type: "reasoning_delta", text: "ing..." }, { type: "done" })],
    });
    await session.submitUserPrompt("test-model", "Hi");
    const assistant = history.stored.find(m => m.role === "assistant") as { thinking?: string };
    expect(assistant?.thinking).toBe("thinking...");
  });
});

// ---------------------------------------------------------------------------
// submitUserPrompt — model resolution
// ---------------------------------------------------------------------------

describe("submitUserPrompt — model resolution", () => {
  it("caches the model list and calls getModels only once across two prompts", async () => {
    const { session, platform } = makeSession({
      responses: [streamFrom({ type: "done" }), streamFrom({ type: "done" })],
    });
    await session.submitUserPrompt("test-model", "first");
    await session.submitUserPrompt("test-model", "second");
    expect(platform.getModels).toHaveBeenCalledTimes(1);
  });

  it("adds an error message to history when the model identifier is not found", async () => {
    const { session, history } = makeSession({ models: [] });
    await session.submitUserPrompt("test-model", "Hello");
    const errors = history.stored.filter(m => m.role === "error") as ErrorChatMessage[];
    expect(errors).toHaveLength(1);
    expect((errors[0].content[0] as { text: string }).text).toContain("Model not found");
  });
});

// ---------------------------------------------------------------------------
// submitUserPrompt — tool execution
// ---------------------------------------------------------------------------

describe("submitUserPrompt — tool execution", () => {
  it("executes the named tool and adds its result to history", async () => {
    const execute = vi.fn(async (args: Record<string, unknown>) => ({ echoed: args.value }));
    const { session, history } = makeSession({
      executors: { my_tool: execute },
      responses: [
        streamFrom({ type: "tool_call", tool_call: { id: "c1", name: "my_tool", arguments: { value: "x" } } }, { type: "done" }),
        streamFrom({ type: "done" }),
      ],
    });
    await session.submitUserPrompt("test-model", "run tool");
    expect(execute).toHaveBeenCalledWith({ value: "x" });
    const toolMsg = history.stored.find(m => m.role === "tool");
    expect(toolMsg).toMatchObject({ role: "tool", tool_call_id: "c1" });
  });

  it("returns an error tool result when the tool is not registered", async () => {
    const { session, history } = makeSession({
      responses: [
        streamFrom({ type: "tool_call", tool_call: { id: "c2", name: "missing_tool", arguments: {} } }, { type: "done" }),
        streamFrom({ type: "done" }),
      ],
    });
    await session.submitUserPrompt("test-model", "use missing tool");
    const toolMsg = history.stored.find(m => m.role === "tool") as { success: boolean; content: Array<{ text: string }> } | undefined;
    expect(toolMsg?.success).toBe(false);
    expect(JSON.parse(toolMsg!.content[0].text)).toMatchObject({ ok: false, tool: "missing_tool" });
  });

  it("returns an error tool result when tool.execute throws", async () => {
    const execute = vi.fn(async () => { throw new Error("tool failed"); });
    const { session, history } = makeSession({
      executors: { bad_tool: execute },
      responses: [
        streamFrom({ type: "tool_call", tool_call: { id: "c3", name: "bad_tool", arguments: {} } }, { type: "done" }),
        streamFrom({ type: "done" }),
      ],
    });
    await session.submitUserPrompt("test-model", "use bad tool");
    const toolMsg = history.stored.find(m => m.role === "tool") as { success: boolean; content: Array<{ text: string }> } | undefined;
    expect(toolMsg?.success).toBe(false);
    expect(JSON.parse(toolMsg!.content[0].text)).toMatchObject({ ok: false, error: "tool failed" });
  });

  it("stops the agent loop after a single iteration when task_complete is called", async () => {
    const { session, platform } = makeSession({
      responses: [
        streamFrom({ type: "tool_call", tool_call: { id: "tc1", name: "task_complete", arguments: {} } }, { type: "done" }),
        streamFrom({ type: "done" }),
      ],
    });
    await session.submitUserPrompt("test-model", "finish");
    expect(platform.generate).toHaveBeenCalledTimes(1);
  });

  it("persists task_complete tool result to history so subsequent turns have coherent message sequences", async () => {
    const { session, history } = makeSession({
      responses: [
        streamFrom({ type: "tool_call", tool_call: { id: "tc1", name: "task_complete", arguments: {} } }, { type: "done" }),
        streamFrom({ type: "done" }),
      ],
    });
    await session.submitUserPrompt("test-model", "finish");
    const toolMsg = history.stored.find(m => m.role === "tool");
    expect(toolMsg).toMatchObject({ role: "tool", tool_call_id: "tc1" });
  });
});

// ---------------------------------------------------------------------------
// submitUserPrompt — agent loop control
// ---------------------------------------------------------------------------

describe("submitUserPrompt — agent loop control", () => {
  it("continues the loop when agent provides a continuation prompt after a text-only response", async () => {
    const { session, platform } = makeSession({
      agent: makeAgent({ continuation: "Please continue.", continuationOnce: true }),
      responses: [
        streamFrom({ type: "text_delta", text: "thinking" }, { type: "done" }),
        streamFrom({ type: "done" }),
      ],
    });
    await session.submitUserPrompt("test-model", "go");
    expect(platform.generate).toHaveBeenCalledTimes(2);
  });

  it("stops after one text-only turn when the agent has no continuation prompt", async () => {
    const { session, platform } = makeSession({
      agent: makeAgent(),
      responses: [
        streamFrom({ type: "text_delta", text: "done here" }, { type: "done" }),
        streamFrom({ type: "done" }),
      ],
    });
    await session.submitUserPrompt("test-model", "go");
    expect(platform.generate).toHaveBeenCalledTimes(1);
  });

  it("stops the loop after MAX_ITERATIONS and logs a warning", async () => {
    const { session, platform, logger } = makeSession({
      agent: makeAgent({ continuation: "Continue." }),
      responses: Array.from({ length: 10 }, () => streamFrom({ type: "done" })),
    });
    await session.submitUserPrompt("test-model", "go forever");
    expect(platform.generate).toHaveBeenCalledTimes(10);
    expect(logger.warn).toHaveBeenCalledWith("Agent loop hit iteration limit, stopping.");
  });
});

// ---------------------------------------------------------------------------
// submitUserPrompt — error handling
// ---------------------------------------------------------------------------

describe("submitUserPrompt — error handling", () => {
  it("adds an error message to history on an error stream event", async () => {
    const { session, history } = makeSession({
      agent: makeAgent(),
      responses: [streamFrom({ type: "error", error: new Error("boom") })],
    });
    await session.submitUserPrompt("test-model", "Hello");
    const errors = history.stored.filter(m => m.role === "error") as ErrorChatMessage[];
    expect(errors).toHaveLength(1);
    expect((errors[0].content[0] as { text: string }).text).toContain("boom");
  });

  it("finalizes the assistant message when stream ends without a done event", async () => {
    const { session, history, logger } = makeSession({
      agent: makeAgent(),
      responses: [streamFrom({ type: "text_delta", text: "partial" })],
    });
    await session.submitUserPrompt("test-model", "Hello");
    const assistant = history.stored.find(m => m.role === "assistant");
    expect(assistant).toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith("Stream ended without 'done' event. Finalizing assistant message.");
  });

  it("rejects the PromptStream when platform.generate throws during iteration", async () => {
    const { session } = makeSession({
      responses: [throwingStream(new Error("network error"))],
    });
    await expect(session.submitUserPrompt("test-model", "Hello")).rejects.toThrow("network error");
  });
});
