import { describe, expect, it, vi } from "vitest";
import { OllamaPlatform } from "../../../../src/ui/platform/ollama/ollama-platform.js";
import type { ChatMessage } from "../../../../src/ui/lib/chat/chat-message.js";
import type { Model } from "../../../../src/ui/lib/models/model.js";
import type { ToolSchema } from "../../../../src/ui/lib/tools/tool-schema.js";

function createLogger() {
  return {
    trace: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("OllamaPlatform", () => {
  it("builds model input and posts it to /api/chat", async () => {
    const loggerFactory = vi.fn(() => createLogger());

    const responseBody = new ReadableStream<Uint8Array>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      statusText: "OK",
      body: responseBody
    }));

    const reader = {
      read: vi.fn(async function* () {
        yield { done: true };
      })
    };

    const platform = new OllamaPlatform(
      loggerFactory,
      fetchMock as any,
      "http://localhost:11434",
      () => reader
    );

    const model: Model = {
      name: "llama3.1",
      platform: "Ollama"
    };

    const chatMessages: ChatMessage[] = [
      {
        role: "user",
        model: "llama3.1",
        content: [
          { type: "text", text: "Write a short tagline" },
          { type: "context", name: "selection", data: { start: 1, end: 2 } }
        ]
      }
    ];

    const tools: ToolSchema[] = [
      {
        type: "function",
        function: {
          name: "count_letters",
          description: "Counts letters in text",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string" }
            },
            required: ["text"]
          }
        }
      }
    ];

    const events = [];
    for await (const event of platform.generate(model, chatMessages, tools)) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "done" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://localhost:11434/api/chat");
    expect(requestInit).toBeDefined();
    if (!requestInit) {
      throw new Error("Expected request init for Ollama /api/chat call");
    }
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(requestInit.body as string);
    expect(body.model).toBe("llama3.1");
    expect(body.stream).toBe(true);
    expect(body.think).toBe(true);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "count_letters",
          description: "Counts letters in text",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string" }
            },
            required: ["text"]
          }
        }
      }
    ]);

    expect(body.messages.length).toBe(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1]).toMatchObject({ role: "user" });
    expect(body.messages[1].content).toContain("Write a short tagline");
    expect(body.messages[1].content).toContain("<selection>");

    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(reader.read).toHaveBeenCalledWith(responseBody);
  });

  it("emits tool_call StreamEvents from tool call chunks", async () => {
    const loggerFactory = vi.fn(() => createLogger());
    const responseBody = new ReadableStream<Uint8Array>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      statusText: "OK",
      body: responseBody
    }));

    const reader = {
      read: vi.fn(async function* () {
        yield {
          message: {
            tool_calls: [
              {
                id: "call_123",
                function: {
                  name: "replace_selection",
                  arguments: { text: "Updated copy" }
                }
              }
            ]
          }
        };
        yield { done: true };
      })
    };

    const platform = new OllamaPlatform(
      loggerFactory,
      fetchMock as any,
      "http://localhost:11434",
      () => reader
    );

    const model: Model = {
      name: "llama3.1",
      platform: "Ollama"
    };

    const chatMessages: ChatMessage[] = [
      {
        role: "user",
        model: "llama3.1",
        content: [{ type: "text", text: "Fix this sentence" }]
      }
    ];

    const emitted = [];
    for await (const event of platform.generate(model, chatMessages, [])) {
      emitted.push(event);
    }

    expect(emitted).toEqual([
      {
        type: "tool_call",
        tool_call: {
          id: "call_123",
          name: "replace_selection",
          arguments: { text: "Updated copy" }
        }
      },
      { type: "done" }
    ]);
  });
});