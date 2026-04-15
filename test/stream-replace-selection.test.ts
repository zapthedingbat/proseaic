import { describe, it, expect, vi } from "vitest";
import { StreamReplaceSelectionTool } from "../src/ui/tools/stream-replace-selection.js";
import { ChatHistory } from "../src/ui/lib/history/memory-chat-history.js";
import { ChatSession } from "../src/ui/lib/chat/chat-session.js";
import { ToolRegistry } from "../src/ui/lib/tools/tools-registry.js";
import { IPlatformService } from "../src/ui/lib/platform/platform-service.js";
import { StreamEvent } from "../src/ui/lib/platform/stream-event.js";
import { Model } from "../src/ui/lib/models/model.js";
import { IModelService } from "../src/ui/lib/models/model-service.js";

const silentLogger = () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });

const TEST_MODEL: Model = { name: "test-model", platform: "test", capabilities: [] };
const makeModelService = (): IModelService => ({ getModel: () => TEST_MODEL });

async function* makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const event of events) yield event;
}

// Minimal TextEditor stub: just records the last replaceSelection call.
function makeEditorStub() {
  const calls: string[] = [];
  return {
    replaceSelection: (text: string) => calls.push(text),
    calls,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// StreamReplaceSelectionTool unit tests
// ──────────────────────────────────────────────────────────────────────────────

describe("StreamReplaceSelectionTool", () => {

  it("returns a 'started' message on the first enabled:true call (not 'already active')", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);

    const result = await tool.execute({ enabled: true }) as { active: boolean; explanation: string };

    expect(result.active).toBe(true);
    expect(result.explanation).not.toMatch(/already active/i);
  });

  it("returns a 'reset' message only when streaming really was already running", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);

    await tool.execute({ enabled: true }); // first call → active
    const result = await tool.execute({ enabled: true }) as { explanation: string }; // second call

    expect(result.explanation).toMatch(/reset/i);
  });

  it("capture callback updates the editor with accumulated text_delta events", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);
    const capture = tool.getCapture();

    await tool.execute({ enabled: true });

    capture({ type: "text_delta", text: "Hello" });
    capture({ type: "text_delta", text: " world" });

    expect(editor.calls).toEqual(["Hello", "Hello world"]);
  });

  it("capture callback is a no-op when not active", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);
    const capture = tool.getCapture();

    capture({ type: "text_delta", text: "Should not be captured" });

    expect(editor.calls).toHaveLength(0);
  });

  it("stops capture and clears buffer on enabled:false", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);
    const capture = tool.getCapture();

    await tool.execute({ enabled: true });
    capture({ type: "text_delta", text: "partial" });
    await tool.execute({ enabled: false });

    // After enabled:false, capture events should be ignored
    capture({ type: "text_delta", text: "after stop" });
    expect(editor.calls).toEqual(["partial"]); // only the pre-stop text
  });

  it("onPromptComplete stops active capture (cleanup for abandoned capture)", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);
    const capture = tool.getCapture();

    await tool.execute({ enabled: true });
    capture({ type: "text_delta", text: "in progress" });

    // Simulate the prompt ending without the model calling enabled:false
    tool.onPromptComplete();

    // Capture should now be inactive
    capture({ type: "text_delta", text: "after cleanup" });
    expect(editor.calls).toEqual(["in progress"]);
  });

  it("onPromptComplete is a no-op when capture is not active", () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);

    expect(() => tool.onPromptComplete()).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: ChatSession calls notifyPromptComplete after submitUserPrompt
// ──────────────────────────────────────────────────────────────────────────────

describe("ChatSession + StreamReplaceSelectionTool integration", () => {

  it("calls notifyPromptComplete on all tools when the prompt finishes", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);
    const onPromptCompleteSpy = vi.spyOn(tool, "onPromptComplete");

    const toolRegistry = new ToolRegistry();
    toolRegistry.registerTool(tool);

    const platformService: IPlatformService = {
      getModels: async () => [TEST_MODEL],
      generate: vi.fn(() => makeStream([
        { type: "text_delta", text: "some text" },
        { type: "done" },
      ])),
    };

    const session = new ChatSession(
      silentLogger as any,
      platformService,
      new ChatHistory(),
      toolRegistry,
      makeModelService()
    );

    await session.submitUserPrompt("test-model", "hello", {});

    expect(onPromptCompleteSpy).toHaveBeenCalledOnce();
  });

  it("capture is inactive at the start of a second prompt even if stream:false was never called", async () => {
    const editor = makeEditorStub();
    const tool = new StreamReplaceSelectionTool(silentLogger as any, editor as any);
    const capture = tool.getCapture();

    const toolRegistry = new ToolRegistry();
    toolRegistry.registerTool(tool);

    let turn = 0;
    const platformService: IPlatformService = {
      getModels: async () => [TEST_MODEL],
      generate: vi.fn(() => {
        turn++;
        if (turn === 1) {
          // First prompt: model calls stream:true then outputs text (no stream:false)
          return makeStream([
            { type: "tool_call", tool_call: { id: "c1", name: "stream_to_selection", arguments: { enabled: true } } },
            { type: "done" },
          ]);
        }
        // Second prompt: just a text response
        return makeStream([
          { type: "text_delta", text: "second response" },
          { type: "done" },
        ]);
      }),
    };

    const session = new ChatSession(
      silentLogger as any,
      platformService,
      new ChatHistory(),
      toolRegistry,
      makeModelService()
    );

    await session.submitUserPrompt("test-model", "first prompt", {});
    // After first prompt, onPromptComplete should have reset capture
    capture({ type: "text_delta", text: "should not be captured" });
    expect(editor.calls).toHaveLength(0);

    await session.submitUserPrompt("test-model", "second prompt", {});
    // Second prompt text_delta events should not be captured either
    expect(editor.calls).toHaveLength(0);
  });
});
