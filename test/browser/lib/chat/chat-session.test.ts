import { describe, expect, it, vi } from "vitest";
import { ChatSession } from "../../../../src/browser/lib/chat/chat-session.js";
import type { ChatMessage } from "../../../../src/browser/lib/chat/chat-message.js";
import type { StreamEvent } from "../../../../src/browser/lib/platform/stream-event.js";

function streamFrom(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    }
  };
}

describe("ChatSession", () => {
  it("executes tools when tool_call stream events are received", async () => {
    const addedMessages: ChatMessage[] = [];

    const history = {
      addMessage: vi.fn(async (message: ChatMessage) => {
        addedMessages.push(message);
      }),
      getMessages: vi.fn(async () => [...addedMessages]),
      clearHistory: vi.fn(async () => {})
    };

    const execute = vi.fn(async (args: Record<string, unknown>) => ({ echoed: args }));

    const toolsService = {
      findTool: vi.fn((name: string) => {
        if (name !== "test_tool") {
          return undefined;
        }

        return {
          schema: {
            type: "function",
            function: {
              name: "test_tool",
              description: "A test tool",
              parameters: {
                type: "object",
                properties: {}
              }
            }
          },
          execute
        };
      }),
      listToolNames: vi.fn(() => ["test_tool"]),
      listToolSchemas: vi.fn(() => [
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "A test tool",
            parameters: {
              type: "object",
              properties: {}
            }
          }
        }
      ]),
      addContext: vi.fn(() => ({}))
    };

    let callCount = 0;
    const platformService = {
      generate: vi.fn(() => {
        callCount += 1;

        if (callCount === 1) {
          return streamFrom([
            {
              type: "tool_call",
              tool_call: {
                id: "tool-1",
                name: "test_tool",
                arguments: { text: "hello" }
              }
            },
            { type: "done" }
          ]);
        }

        return streamFrom([{ type: "done" }]);
      }),
      getModels: vi.fn(async () => [{ name: "demo-model", platform: "demo-platform", capabilities: [] }])
    };

    const loggerFactory = vi.fn(() => ({
      trace: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }));

    const session = new ChatSession(
      loggerFactory,
      platformService as any,
      history as any,
      toolsService as any
    );

    await session.submitUserPrompt("demo-model", "Use the tool", {});

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ text: "hello" });

    const toolMessages = addedMessages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]).toMatchObject({
      role: "tool",
      tool_call_id: "tool-1",
      model: "demo-model"
    });

    const assistantMessages = addedMessages.filter((m) => m.role === "assistant");
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect((assistantMessages[0] as any).tool_calls?.[0]).toMatchObject({
      id: "tool-1",
      name: "test_tool"
    });

    expect(platformService.generate).toHaveBeenCalledTimes(2);
  });
});