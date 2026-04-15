import { Marked } from "marked";
import { ClearHistoryEvent, SelectCheckpointEvent, SubmitPromptEvent } from "../lib/events.js";
import { BaseHtmlElement } from "./base-html-element.js";
import { AssistantChatMessage, ChatMessage } from "../lib/chat/chat-message.js";
import { Model } from "../lib/models/model.js";

const css = `
:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: var(--input-radius);
  border: var(--input-border);
  padding: var(--gap);
  color: var(--output-text-color);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(var(--gap) * 2);
  font-size: 0.95rem;
}

.title {
  font-weight: 600;
  opacity: 0.9;
}

.header .button {
  border: none;
  background: transparent;
  color: var(--output-text-color);
  cursor: pointer;
  font-size: 1rem;
}

#chat-history {
  flex: 1;
  color: var(--output-text-color);
  height: 100%;
  overflow-y: auto;
  padding: var(--gap);
  font-size: 13px;
}

/* Chat message styles */

.chat-request {
  color: var(--chat-request-text-color);
  padding: 8px 12px;
  max-width: 90%;
  margin-left: auto;
  margin-bottom: var(--chat-vertical-gap);
  position: relative;
  background-color: var(--chat-request-bg-color);
  border-radius: 12px 12px 0;
  width: fit-content;


  /* Add a corner
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23ccc"><path d="M0 0 L16 0 L16 16 Z"/></svg>');
  background-repeat: no-repeat;
  background-position: right -8px top 50%;
  */
}

.chat-response {
  color: var(--chat-response-text-color);
  margin-bottom: var(--chat-vertical-gap);
}


/* Tool response */

.chat-tool {
  color: var(--chat-tool-text-color);
  margin-bottom: var(--chat-vertical-gap);
}

.chat-tool > summary {
  padding-left: 24px;
}

.chat-thinking {
  color: var(--chat-thinking-text-color);
  margin-bottom: var(--chat-vertical-gap);
}

.chat-error {
  color: var(--chat-error-text-color);
  margin-bottom: var(--chat-vertical-gap);
  border: 1px solid var(--chat-error-border-color);
  border-radius: 4px;
  padding: calc(var(--gap) * 2);
  background-color: var(--chat-error-bg-color);
}

.markdown a {
  color: inherit;
  text-decoration: underline;
}

.markdown code,
.markdown pre {
  overflow-x: auto;
}

/* Input textbox */

#chat-input {
  border: var(--input-border);
  border-radius: var(--input-radius);
  padding: 0 6px 6px;
  position: relative;
}

#chat-input:focus-within {
  border: var(--input-focus-border);
}

#chat-input textarea {
  background-color: transparent;
  border: none;
  box-sizing: border-box;
  color: var(--input-text-color);
  font-family: monospace;
  font-family: var(--font-family);
  font-size: 1rem;
  min-height: 60px;
  padding: calc(var(--gap) * 2);
  resize: none;
  width: 100%;
}

#chat-input textarea:focus {
  outline: none;
}

.monaco-workbench .monaco-action-bar:not(.vertical) .action-label:not(.disabled):hover, .monaco-workbench .monaco-action-bar:not(.vertical) .monaco-dropdown-with-primary:not(.disabled):hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}

.actions-container {
  display: flex;
  gap: 4px;
  margin: 0 auto;
  padding: 0;
  height: 100%;
  width: 100%;
  align-items: center;
}

.actions-container>.action-item {
  flex-shrink: 0;
}

.action-item {
  display: block;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  
  background-color: var(--input-bg-color);
  border-radius: var(--input-radius);
  border-style: none;
  color: var(--input-text-color);
  padding: 4px;
}

.action-item:not(:open):hover {
  background-color: rgba(255, 255, 255, 0.1);
}

select.action-item {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

select.action-item:open {
  background-color: var(--input-bg-color);
  color: var(--input-text-color);
}

select.action-item option {
  background-color: var(--input-bg-color);
  color: var(--input-text-color);
}

`;

const html = `

<link rel="stylesheet" href="/codicon.css" />
<style>${css}</style>
<div class="header">
  <div class="title">Chat</div>
  <button id="chat-clear" class="action-item" type="button" title="Clear chat"><i class="codicon codicon-archive"></i></button>
</div>

<template id="assistant-message-template">
  <div class="chat-tool markdown">
  </div>
  <div class="chat-thinking markdown">
  </div>
  <div class="chat-response markdown">
  </div>
</template>

<div id="chat-history"></div>
<div id="chat-input">
  <textarea id="chat-textarea"></textarea>
  <div class="chat-input-toolbars">
    <div class="actions-container">
      <select id="chat-model-select" class="action-item"></select>
      <button class="action-item" type="button" id="chat-send"><i class="codicon codicon-arrow-up"></i></button>
    </div>
  </div>
</div>
`;

// <chat-panel> WebComponent
export class ChatPanel extends BaseHtmlElement {

  private modelsSelect: HTMLSelectElement;
  private textarea: HTMLTextAreaElement;
  private clearHistoryButton: HTMLButtonElement;
  private sendButton: HTMLButtonElement;
  private historyDiv: HTMLDivElement;
  private _models: Array<Model>;
  private _state: {
    history: ChatMessage[];
    activeMessage: ChatMessage | null;
  };
  private _marked: Marked;
  private _activeMessageElement: HTMLDivElement | null;
  private _activeMessageReference: ChatMessage | null;
  private _activeThinkingElement: HTMLDivElement | null;
  private _activeResponseElement: HTMLDivElement | null;
  private _activeThinkingText: string;
  private _activeContentText: string;
  private _historySignatures: string[];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = html;
    this.modelsSelect = this.shadowRoot!.getElementById("chat-model-select") as HTMLSelectElement;
    this.textarea = this.shadowRoot!.getElementById("chat-textarea") as HTMLTextAreaElement;
    this.clearHistoryButton = this.shadowRoot!.getElementById("chat-clear") as HTMLButtonElement;
    this.sendButton = this.shadowRoot!.getElementById("chat-send") as HTMLButtonElement;
    this.historyDiv = this.shadowRoot!.getElementById("chat-history") as HTMLDivElement;
    this._models = [];
    this._state = {
      history: [],
      activeMessage: null
    };
    this._marked = new Marked();
    this._activeMessageElement = null;
    this._activeMessageReference = null;
    this._activeThinkingElement = null;
    this._activeResponseElement = null;
    this._activeThinkingText = "";
    this._activeContentText = "";
    this._historySignatures = [];
  }

  connectedCallback(): void {
    this.sendButton.addEventListener("click", this._handleSendButtonClick);
    this.clearHistoryButton.addEventListener("click", this._handleClearHistoryButtonClick);
    this.textarea.addEventListener("keydown", this._handleTextareaKeydown);
    this.textarea.addEventListener("input", this._handleTextareaInput);
    this.historyDiv.addEventListener("click", this._handleHistoryClick);
  }

  disconnectedCallback(): void {
    this.sendButton.removeEventListener("click", this._handleSendButtonClick);
    this.clearHistoryButton.removeEventListener("click", this._handleClearHistoryButtonClick);
    this.textarea.removeEventListener("keydown", this._handleTextareaKeydown);
    this.textarea.removeEventListener("input", this._handleTextareaInput);
    this.historyDiv.removeEventListener("click", this._handleHistoryClick);
  }

  get model(): string {
    return this.modelsSelect.value;
  }

  setHistory(history: ChatMessage[]): void {
    const nextHistory = history || [];
    const nextHistorySignatures = nextHistory.map(message => JSON.stringify(message));
    const isSameHistory = nextHistorySignatures.length === this._historySignatures.length
      && nextHistorySignatures.every((signature, index) => this._historySignatures[index] === signature);

    this._state.history = nextHistory;
    this._historySignatures = nextHistorySignatures;
    if (isSameHistory) {
      return;
    }

    this.historyDiv.innerHTML = "";
    this._clearActiveMessageElement();

    for (const message of nextHistory) {
      this.historyDiv.appendChild(this._createMessageElement(message));
    }

    this._scrollHistoryToBottom();
  }

  setActive(entry: ChatMessage | null): void {
    const nextActive = entry || null;
    this._state.activeMessage = nextActive;

    if (!nextActive) {
      this._clearActiveMessageElement();
      return;
    }

    if (this._activeMessageReference === nextActive && this._activeMessageElement) {
      return;
    }

    this._clearActiveMessageElement();

    this._activeMessageElement = this._createMessageElement(nextActive);
    this.historyDiv.appendChild(this._activeMessageElement);
    this._activeMessageReference = nextActive;

    if (nextActive.role === "assistant") {
      this._activeThinkingElement = this._activeMessageElement.querySelector(".chat-thinking") as HTMLDivElement | null;
      this._activeResponseElement = this._activeMessageElement.querySelector(".chat-response") as HTMLDivElement | null;
      this._activeThinkingText = nextActive.thinking || "";
      this._activeContentText = this._extractTextContent(nextActive);
    }

    this._scrollHistoryToBottom();
  }

  appendActiveChatMessageContent(deltaType: "text_delta" | "reasoning_delta", text: string): void {
    if (!text) {
      return;
    }

    this._ensureActiveAssistantMessageElement();
    if (!this._activeMessageElement) {
      return;
    }

    if (deltaType === "reasoning_delta") {
      this._activeThinkingText += text;
      if (this._activeThinkingElement) {
        this._activeThinkingElement.innerHTML = this._renderMarkdown(this._activeThinkingText);
      }
    } else {
      this._activeContentText += text;
      if (this._activeResponseElement) {
        this._activeResponseElement.innerHTML = this._renderMarkdown(this._activeContentText);
      }
    }

    this._scrollHistoryToBottom();
  }

  setModels(models: Array<Model>): void {
    this._models = models;
    this._renderModels();
  }

  private _renderMarkdown(markdown: string): string {
    return this._marked.parseInline(markdown) as string;
  }

  private _handleTextareaKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this._submit();
    }
  };

  private _handleTextareaInput = (event: InputEvent): void => {
    const target = event.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 250)}px`;
  };

  private _handleSendButtonClick = (event: MouseEvent): void => {
    event.preventDefault();
    this._submit();
  };

  private _handleClearHistoryButtonClick = (event: MouseEvent): void => {
    event.preventDefault();
    this.dispatchEvent(new ClearHistoryEvent());
  };

  private _handleHistoryClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button[data-checkpoint-id]") as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const checkpointId = button.dataset.checkpointId || "";
    this.dispatchEvent(new SelectCheckpointEvent(checkpointId));
  };

  private _submit(): void {
    const promptText = this.textarea.value.trim();
    if (!promptText){
      return;
    }
    this.dispatchEvent(new SubmitPromptEvent(promptText));
    this.textarea.value = "";
  }

  private _createMessageElement(message: ChatMessage): HTMLDivElement {
    if (message.role === "assistant") {
      return this._createAssistantElement(message);
    }

    if (message.role === "user") {
      const userElement = this._createDiv("chat-request");
      userElement.appendChild(this._createContentFragment(message));
      return userElement;
    }

    if (message.role === "tool") {
      const toolElement = this._createDiv("chat-tool markdown");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Tool: ${message.tool_call_id}`;
      const content = this._createDiv("chat-tool-content markdown");
      content.innerHTML = this._renderMarkdown(this._extractTextContent(message));
      details.appendChild(summary);
      details.appendChild(content);
      toolElement.appendChild(details);
      return toolElement;
    }

    if (message.role === "error") {
      const errorElement = this._createDiv("chat-error markdown");
      errorElement.innerHTML = this._renderMarkdown(this._extractTextContent(message));
      return errorElement;
    }

    const systemElement = this._createDiv("chat-system markdown");
    systemElement.innerHTML = this._renderMarkdown(this._extractTextContent(message));
    return systemElement;
  }

  private _createAssistantElement(message: Extract<ChatMessage, { role: "assistant" }>): HTMLDivElement {
    const template = this.shadowRoot!.getElementById("assistant-message-template") as HTMLTemplateElement;
    const wrapper = this._createDiv();
    wrapper.appendChild(template.content.cloneNode(true));

    const toolElement = wrapper.querySelector(".chat-tool") as HTMLDivElement;
    const thinkingElement = wrapper.querySelector(".chat-thinking") as HTMLDivElement;
    const responseElement = wrapper.querySelector(".chat-response") as HTMLDivElement;

    toolElement.innerHTML = this._renderToolCalls(message.tool_calls || []);
    thinkingElement.innerHTML = this._renderMarkdown(message.thinking || "");
    responseElement.innerHTML = this._renderMarkdown(this._extractTextContent(message));

    return wrapper;
  }

  private _renderToolCalls(toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>): string {
    if (toolCalls.length === 0) {
      return "";
    }

    return toolCalls.map(toolCall => {
      const args = JSON.stringify(toolCall.arguments || {}, null, 2);
      return `<details><summary>${toolCall.name}</summary><pre><code>${args}</code></pre></details>`;
    }).join("");
  }

  private _createContentFragment(message: ChatMessage): DocumentFragment {
    const fragment = document.createDocumentFragment();
    for (const part of message.content || []) {
      if (part.type === "text") {
        fragment.appendChild(document.createTextNode(part.text));
      } else if (part.type === "image" && part.data) {
        const img = document.createElement("img");
        img.src = `data:base64,${part.data}`;
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        img.style.margin = "8px 0";
        fragment.appendChild(img);
      }
    }
    return fragment;
  }

  private _extractTextContent(message: ChatMessage): string {
    return (message.content || []).reduce((acc, part) => {
      if (part.type === "text") {
        return acc + part.text;
      }
      return acc;
    }, "");
  }

  private _createDiv(className = ""): HTMLDivElement {
    const element = document.createElement("div");
    if (className) {
      element.className = className;
    }
    return element;
  }

  private _ensureActiveAssistantMessageElement(): void {
    if (this._activeMessageElement) {
      return;
    }

    const activeMessage = this._state.activeMessage;
    const assistantMessage: AssistantChatMessage = activeMessage && activeMessage.role === "assistant"
      ? activeMessage
      : { model: this.model || "", role: "assistant", content: [] };

    this._activeMessageElement = this._createAssistantElement(assistantMessage);
    this.historyDiv.appendChild(this._activeMessageElement);
    this._activeMessageReference = activeMessage;
    this._activeThinkingElement = this._activeMessageElement.querySelector(".chat-thinking") as HTMLDivElement | null;
    this._activeResponseElement = this._activeMessageElement.querySelector(".chat-response") as HTMLDivElement | null;
    this._activeThinkingText = assistantMessage.thinking || "";
    this._activeContentText = this._extractTextContent(assistantMessage);
  }

  private _clearActiveMessageElement(): void {
    if (this._activeMessageElement?.parentNode) {
      this._activeMessageElement.parentNode.removeChild(this._activeMessageElement);
    }
    this._activeMessageElement = null;
    this._activeMessageReference = null;
    this._activeThinkingElement = null;
    this._activeResponseElement = null;
    this._activeThinkingText = "";
    this._activeContentText = "";
  }

  private _scrollHistoryToBottom(): void {
    this.historyDiv.scrollTop = this.historyDiv.scrollHeight;
  }

  private _renderModels(): void {
    if (this._models && this._models.length > 0) {
      this.modelsSelect.innerHTML = this._models.map(model => {
        const label = `${model.platform} - ${model.name}${model.version ? ` (${model.version})` : ""}`;
        const value = model.name || label;
        return `<option value="${value}">${label}</option>`;
      }).join("");
    }
  }
}
