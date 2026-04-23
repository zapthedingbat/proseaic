import { describe, it, expect, vi } from "vitest";
import { ChatSession } from "../../src/browser/lib/chat/chat-session.js";
import { ChatHistory } from "../../src/browser/lib/history/memory-chat-history.js";
import { AssistantChatMessage, ChatMessage } from "../../src/browser/lib/chat/chat-message.js";
import { IPlatformService } from "../../src/browser/lib/platform/platform-service.js";
import { IToolService } from "../../src/browser/lib/tools/tool-service.js";
import { StreamEvent } from "../../src/browser/lib/platform/stream-event.js";
import { Model } from "../../src/browser/lib/models/model.js";
import { ToolSchema } from "../../src/browser/lib/tools/tool-schema.js";
import { Agent } from "../../src/browser/lib/agent/agent.js";

// Silent logger factory for tests
const silentLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

const TEST_MODEL: Model = { name: "test-model", platform: "test", capabilities: [] };

const testAgent: Agent = {
  id: "test",
  buildSystemPrompt: () => "",
  filterTools: (tools) => tools,
};

function makeToolService(toolExecute: (args: Record<string, unknown>) => Promise<unknown> = async () => ({ done: true })): IToolService {
  return {
    findTool: (name: string) => ({
      schema: { type: "function", function: { name, description: "", parameters: { type: "object", properties: {}, required: [] } } },
      execute: toolExecute,
    }),
    listToolNames: () => ["replace_selection"],
    listToolSchemas: (): ToolSchema[] => [
      { type: "function", function: { name: "replace_selection", description: "Replace selection", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } } }
    ],
    addContext: () => ({}),
  };
}

/**
 * Builds an AsyncIterable<StreamEvent> from an array of events.
 */
async function* makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

/**
 * Reproduces the Ollama streaming behaviour where tool_calls and done:true arrive
 * in the same chunk — meaning the platform emits a tool_call event but NO done event.
 *
 * This was the root cause: without a done event the AssistantChatMessage was never
 * pushed onto contextMessages, so the second API request was missing the assistant
 * turn that contained the tool calls.
 */
describe("ChatSession tool-call history", () => {

  it("includes the AssistantChatMessage in context when replaying tool results (done event fires)", async () => {
    // Simulates a well-behaved platform that emits tool_call then done
    const capturedRequests: ChatMessage[][] = [];

    const platformService: IPlatformService = {
      getModels: async () => [TEST_MODEL],
      generate: vi.fn((model, messages, tools) => {
        capturedRequests.push([...messages]);
        const turn = capturedRequests.length;
        if (turn === 1) {
          // First turn: emit a tool call followed by done
          return makeStream([
            { type: "tool_call", tool_call: { id: "call_abc", name: "replace_selection", arguments: { text: "hello" } } },
            { type: "done" },
          ]);
        }
        // Second turn: just complete
        return makeStream([
          { type: "text_delta", text: "Done!" },
          { type: "done" },
        ]);
      }),
    };

    const history = new ChatHistory();
    const session = new ChatSession(silentLogger as any, platformService, history, makeToolService(), testAgent);

    await session.submitUserPrompt("test-model", "write something", {});

    expect(capturedRequests.length).toBe(2);

    // The second request must contain an assistant message with tool_calls
    const secondRequestMessages = capturedRequests[1];
    const assistantMsg = secondRequestMessages.find(
      (m): m is AssistantChatMessage => m.role === "assistant" && Array.isArray((m as AssistantChatMessage).tool_calls)
    );
    expect(assistantMsg, "Second request is missing the AssistantChatMessage with tool_calls").toBeDefined();
    expect(assistantMsg!.tool_calls).toHaveLength(1);
    expect(assistantMsg!.tool_calls![0].id).toBe("call_abc");

    // The tool result must appear AFTER the assistant message
    const assistantIndex = secondRequestMessages.indexOf(assistantMsg!);
    const toolMsg = secondRequestMessages.find(m => m.role === "tool");
    expect(toolMsg, "Second request is missing the ToolChatMessage").toBeDefined();
    const toolIndex = secondRequestMessages.indexOf(toolMsg!);
    expect(assistantIndex).toBeLessThan(toolIndex);
  });

  it("includes the AssistantChatMessage in context when done event is missing (Ollama tool_call+done in same chunk bug)", async () => {
    // Simulates the broken Ollama behaviour: tool_call emitted but NO done event.
    // Before the fix, the assistantMessage was never added to contextMessages in this case.
    const capturedRequests: ChatMessage[][] = [];

    const platformService: IPlatformService = {
      getModels: async () => [TEST_MODEL],
      generate: vi.fn((model, messages, tools) => {
        capturedRequests.push([...messages]);
        const turn = capturedRequests.length;
        if (turn === 1) {
          // First turn: emit tool_call only — no done event (simulates the bug)
          return makeStream([
            { type: "tool_call", tool_call: { id: "call_xyz", name: "replace_selection", arguments: { text: "poem" } } },
          ]);
        }
        return makeStream([
          { type: "text_delta", text: "Done!" },
          { type: "done" },
        ]);
      }),
    };

    const history = new ChatHistory();
    const session = new ChatSession(silentLogger as any, platformService, history, makeToolService(), testAgent);

    await session.submitUserPrompt("test-model", "write a poem into the selection", {});

    expect(capturedRequests.length).toBe(2);

    const secondRequestMessages = capturedRequests[1];
    const assistantMsg = secondRequestMessages.find(
      (m): m is AssistantChatMessage => m.role === "assistant" && Array.isArray((m as AssistantChatMessage).tool_calls)
    );
    expect(assistantMsg, "Safety net failed: AssistantChatMessage missing from context when done event was not emitted").toBeDefined();
    expect(assistantMsg!.tool_calls![0].id).toBe("call_xyz");

    const assistantIndex = secondRequestMessages.indexOf(assistantMsg!);
    const toolMsg = secondRequestMessages.find(m => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(assistantIndex).toBeLessThan(secondRequestMessages.indexOf(toolMsg!));
  });

  it("does not loop infinitely when the model keeps calling tools without a task_complete", async () => {
    // Guard against the looping behaviour reported in the bug: without the assistant
    // message in context, the model would be confused and keep re-calling the same tool.
    let callCount = 0;
    const MAX_TURNS = 5;

    const platformService: IPlatformService = {
      getModels: async () => [TEST_MODEL],
      generate: vi.fn((model, messages) => {
        callCount++;
        if (callCount > MAX_TURNS) {
          throw new Error(`generate() called more than ${MAX_TURNS} times — infinite loop detected`);
        }
        if (callCount < 3) {
          return makeStream([
            { type: "tool_call", tool_call: { id: `call_${callCount}`, name: "replace_selection", arguments: { text: "x" } } },
            { type: "done" },
          ]);
        }
        return makeStream([{ type: "text_delta", text: "All done." }, { type: "done" }]);
      }),
    };

    const history = new ChatHistory();
    const session = new ChatSession(silentLogger as any, platformService, history, makeToolService(), testAgent);

    await expect(
      session.submitUserPrompt("test-model", "do stuff", {})
    ).resolves.not.toThrow();

    expect(callCount).toBeLessThanOrEqual(MAX_TURNS);
  });
});
