import { describe, expect, it, vi } from "vitest";

import { ChatStore } from "./chat-store.js";

describe("ChatStore", () => {
  it("continues the agent loop after a tool result", async () => {
    localStorage.clear();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ capabilities: ["tools"] })
    })) as unknown as typeof fetch;

    try {
      const toolCall = {
        id: "call-1",
        function: {
          name: "read_document_lines",
          arguments: {
            startLine: 1,
            endLine: 10
          }
        }
      };

      const streamChat = vi.fn()
        .mockImplementationOnce(async (payload, onEvent) => {
          expect(Array.isArray(payload.messages)).toBe(true);
          expect(payload.messages).toHaveLength(2);
          expect(payload.messages[0]).toMatchObject({ role: "system" });
          expect(payload.messages[1]).toMatchObject({ role: "user" });
          await onEvent({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [toolCall]
            },
            done: true
          });
        })
        .mockImplementationOnce(async (_payload, onEvent) => {
          await onEvent({
            message: {
              role: "assistant",
              content: "Added a self-hosting with Docker requirement to the specification."
            },
            done: true
          });
        });

      const agentClient = {
        streamChat,
        loadModels: vi.fn(async () => [])
      };

      const toolHandler = vi.fn(async () => ({
        ok: true,
        result: {
          ok: true,
          startLine: 1,
          endLine: 10,
          content: "1: # Sample Document"
        }
      }));

      const store = new ChatStore(agentClient as any, "chat.history.agent-loop", { toolHandler });

      await store.submitPrompt("add the ability to self host the application using docker to the specs", {
        model: "test-model"
      });

      expect(streamChat).toHaveBeenCalledTimes(2);
      expect(toolHandler).toHaveBeenCalledTimes(1);

      const secondPayload = streamChat.mock.calls[1]?.[0] as { messages?: Array<Record<string, unknown>> };
      expect(secondPayload.messages).toHaveLength(4);
      expect(secondPayload.messages?.[2]).toMatchObject({
        role: "assistant",
        tool_calls: [toolCall]
      });
      expect(secondPayload.messages?.[3]).toMatchObject({
        role: "tool",
        tool_call_id: "call-1",
        name: "read_document_lines"
      });
      expect(JSON.parse(String(secondPayload.messages?.[3]?.content || "{}"))).toEqual({
        ok: true,
        result: {
          ok: true,
          startLine: 1,
          endLine: 10,
          content: "1: # Sample Document"
        }
      });

      const history = store.getHistory();
      expect(history.map(message => message.role)).toEqual(["user", "tool", "tool", "assistant"]);
      expect(history[0]?.content).toContain("self host");
      expect(history[1]?.content).toContain("Tool call: read_document_lines");
      expect(history[2]?.content).toContain("Tool result: read_document_lines");
      expect(history.at(-1)?.content).toContain("Added a self-hosting with Docker requirement");
      expect(store.getActive()).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes escaped multiline text in replace_document tool calls", async () => {
    localStorage.clear();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ capabilities: ["tools"] })
    })) as unknown as typeof fetch;

    try {
      const toolCall = {
        id: "call-escaped-newlines",
        function: {
          name: "replace_document",
          arguments: {
            text: "# Sample Document\\n\\n## Overview\\nLine two of the document.",
            explanation: "Apply the updated outline."
          }
        }
      };

      const streamChat = vi.fn(async (_payload, onEvent) => {
        await onEvent({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
          },
          done: true
        });
      });

      const toolHandler = vi.fn(async () => ({
        ok: true,
        result: { ok: true }
      }));

      const agentClient = {
        streamChat,
        loadModels: vi.fn(async () => [])
      };

      const store = new ChatStore(agentClient as any, "chat.history.escaped-newlines", { toolHandler });

      await store.submitPrompt("rewrite the document", {
        model: "test-model"
      });

      expect(toolHandler).toHaveBeenCalledTimes(1);
      expect(toolHandler).toHaveBeenCalledWith(expect.objectContaining({
        name: "replace_document",
        arguments: expect.objectContaining({
          text: "# Sample Document\n\n## Overview\nLine two of the document.",
          explanation: "Apply the updated outline."
        })
      }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});