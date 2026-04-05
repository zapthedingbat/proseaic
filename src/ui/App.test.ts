import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { ChatPanel } from "./components/chat-panel.js";
import { DocumentPanel } from "./components/document-panel.js";
import { TextEditor } from "./components/text-editor.js";

if (!customElements.get("text-editor")) {
  customElements.define("text-editor", TextEditor);
}

if (!customElements.get("document-panel")) {
  customElements.define("document-panel", DocumentPanel);
}

if (!customElements.get("chat-panel")) {
  customElements.define("chat-panel", ChatPanel);
}

describe("App AI edit history", () => {
  let textEditor: TextEditor;
  let documentPanel: DocumentPanel;
  let chatPanel: ChatPanel;
  let logger: Console;

  const createChatStoreStub = () => ({
    addListener: vi.fn(() => () => {}),
    getHistory: vi.fn(() => []),
    getActive: vi.fn(() => null),
    getModels: vi.fn(() => []),
    clearHistory: vi.fn(),
    submitPrompt: vi.fn()
  });

  beforeEach(() => {
    localStorage.clear();

    textEditor = document.createElement("text-editor") as TextEditor;
    documentPanel = document.createElement("document-panel") as DocumentPanel;
    chatPanel = document.createElement("chat-panel") as ChatPanel;

    document.body.appendChild(documentPanel);
    document.body.appendChild(textEditor);
    document.body.appendChild(chatPanel);

    textEditor.value = "alpha beta";
    logger = {
      ...console,
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as Console;
  });

  afterEach(() => {
    textEditor.remove();
    documentPanel.remove();
    chatPanel.remove();
    localStorage.clear();
  });

  it("restores before and after states from chat checkpoints", async () => {
    const app = await App.create({
      chatStore: createChatStoreStub() as any,
      elements: {
        textEditor,
        documentPanel,
        chatPanel,
        pullButton: null
      },
      storage: localStorage,
      logger,
      documentStorageKey: "test.documents.undo-redo"
    });

    await app.initialize();

    (textEditor as any)._selectionRange = { start: 6, end: 10 };

    const toolHandler = (app as any)._toolHandler;
    const firstResult = await toolHandler({
      name: "replace_selection",
      arguments: {
        text: "gamma",
        explanation: "Updated the selected word."
      }
    });
    expect(textEditor.value).toBe("alpha gamma");

    (textEditor as any)._selectionRange = { start: 6, end: 11 };

    await toolHandler({
      name: "replace_selection",
      arguments: {
        text: "delta",
        explanation: "Updated the word again."
      }
    });

    expect(textEditor.value).toBe("alpha delta");

    const checkpoint = (firstResult as { result?: { checkpoint?: { id: string; documentId: string; label?: string } } })
      .result?.checkpoint;
    expect(checkpoint?.id).toBeTruthy();
    expect(checkpoint?.documentId).toBeTruthy();

    chatPanel.setHistory([
      {
        role: "tool",
        content: "Tool result: replace_selection",
        checkpoint
      }
    ]);

    const beforeButton = chatPanel.shadowRoot!.querySelector('button[data-checkpoint-target="before"]') as HTMLButtonElement;
    const afterButton = chatPanel.shadowRoot!.querySelector('button[data-checkpoint-target="after"]') as HTMLButtonElement;
    expect(beforeButton).toBeTruthy();
    expect(afterButton).toBeTruthy();

    beforeButton.click();

    expect(textEditor.value).toBe("alpha beta");

    afterButton.click();

    expect(textEditor.value).toBe("alpha gamma");
  });

  it("does not render chat checkpoint actions for manual edits", async () => {
    const app = await App.create({
      chatStore: createChatStoreStub() as any,
      elements: {
        textEditor,
        documentPanel,
        chatPanel,
        pullButton: null
      },
      storage: localStorage,
      logger,
      documentStorageKey: "test.documents.manual-edits"
    });

    await app.initialize();

    textEditor.value = "manual change";
    textEditor.dispatchEvent(new CustomEvent("change", {
      detail: { content: textEditor.value },
      bubbles: true,
      composed: true
    }));

    chatPanel.setHistory([
      {
        role: "tool",
        content: "Tool result: replace_selection"
      }
    ]);

    const restoreButton = chatPanel.shadowRoot!.querySelector(".checkpoint-button") as HTMLButtonElement | null;
    expect(restoreButton).toBeNull();
  });
});