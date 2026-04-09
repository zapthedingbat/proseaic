import { ClearHistoryEvent, SelectCheckpointEvent, SubmitPromptEvent } from "../lib/events.js";
import { BaseHtmlElement } from "./base-html-element.js";
import { Logger } from "../lib/logging/logger.js";
import { ChatMessage } from "../lib/chat/chat-message.js";

type ChatCheckpointRef = {
  id?: string;
  documentId?: string;
  label?: string;
  targets?: {
    before?: string;
    after?: string;
  };
};

// <chat-panel> WebComponent
export class ChatPanel extends BaseHtmlElement {

  private modelsSelect: HTMLSelectElement;
  private textarea: HTMLTextAreaElement;
  private clearHistoryButton: HTMLButtonElement;
  private sendButton: HTMLButtonElement;
  private historyDiv: HTMLDivElement;
  private statusDiv: HTMLDivElement | null;
  private _models: Array<string | { name?: string }>;
  private _state: {
    history: ChatMessage[];
    active: ChatMessage | null;
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
      <style>
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
        #chat-history .item {
          margin-bottom: var(--gap);
        }
        #chat-history .item.user {
          text-align: right;
        }
        #chat-history details.thinking {
          margin-top: 4px;
        }
        #chat-history details.thinking summary {
          color: var(--output-text-color);
          opacity: 0.7;
          cursor: pointer;
          list-style: none;
        }
        #chat-history details.thinking summary::-webkit-details-marker {
          display: none;
        }
        #chat-history details.thinking .thinking-text {
          color: var(--output-text-color);
          opacity: 0.85;
          font-size: 0.9rem;
          font-style: italic;
          margin-top: 4px;
          white-space: pre-wrap;
        }
        #chat-input {
          width: 100%;
          resize: none;
          border: var(--input-border);
          border-radius: var(--input-radius);
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
        #chat-options {
          display: flex;
          justify-content: space-between;
          border-top: var(--input-border);
        }
        #model-select, #send, #clear {
          font-size: 1rem;
          border: none;
          background-color: transparent;
          font-family: var(--font-family);
          color: var(--input-text-color);
        }
        #chat-status {
          color: var(--output-text-color);
          font-size: 0.9rem;
          padding: var(--gap);
          white-space: wrap;
          overflow-wrap: anywhere;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-request {
          color: var(--chat-request-text-color);
          padding: 8px 12px;
          max-width: 90%;
          margin-left: auto;
          width: fit-content;
          margin-bottom: var(--chat-vertical-gap);
          position: relative;
          background-color: var(--chat-request-bubble-bg);
          border-radius: 12px 12px 0;
        }

        .chat-response {
          color: var(--chat-response-text-color);
          margin-bottom: var(--chat-vertical-gap);
        }

        .chat-tool {
          color: var(--chat-response-text-color);
          margin-bottom: var(--chat-vertical-gap);
          background: rgba(255, 255, 255, 0.06);
          border: 1px dashed rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          padding: 8px 10px;
        }

        .checkpoint-action {
          margin: 0 0 var(--chat-vertical-gap);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .checkpoint-label {
          font-size: 0.82rem;
          opacity: 0.85;
        }

        .checkpoint-actions {
          display: flex;
          gap: 8px;
        }

        .checkpoint-button {
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 8px;
          padding: 6px 10px;
          font-family: var(--font-family);
          font-size: 0.9rem;
          color: var(--chat-response-text-color);
          background: rgba(255, 255, 255, 0.08);
          cursor: pointer;
        }

        .checkpoint-button:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        .chat-thinking {
          color: var(--chat-thinking-text-color);
          margin-bottom: var(--chat-vertical-gap);
        }

        .markdown a {
          color: inherit;
          text-decoration: underline;
        }

        .markdown code {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 4px;
          padding: 0 4px;
          font-family: var(--editor-font-family);
          font-size: 0.95em;
        }

        .markdown pre {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          padding: 10px;
          overflow-x: auto;
          margin: 8px 0;
        }

        .markdown pre code {
          background: transparent;
          padding: 0;
          display: block;
          white-space: pre-wrap;
        }

      </style>
      <div class="header">
        <div class="title">Chat</div>
        <button class="button clear" type="button" title="Clear chat">🗑️</button>
      </div>
      <div id="chat-history"></div>
      <div id="chat-input">
        <textarea></textarea>
        <div id="chat-options">
          <select id="model-select"></select>
          <button class="button send" type="button" id="send">⬆️</button>
        </div>
      </div>
    `;
    this.modelsSelect = this.shadowRoot!.getElementById("model-select") as HTMLSelectElement;
    this.textarea = this.shadowRoot!.querySelector("textarea") as HTMLTextAreaElement;
    this.clearHistoryButton = this.shadowRoot!.querySelector(".header .button.clear") as HTMLButtonElement;
    this.sendButton = this.shadowRoot!.querySelector(".button.send") as HTMLButtonElement;
    this.historyDiv = this.shadowRoot!.getElementById("chat-history") as HTMLDivElement;
    this.statusDiv = this.shadowRoot!.getElementById("chat-status") as HTMLDivElement | null;
    this._models = [];
    this._state = {
      history: [],
      active: null
    };
  }

  connectedCallback(): void {
    this.sendButton.addEventListener("click", this._handleSendButtonClick);
    this.clearHistoryButton.addEventListener("click", this._handleClearHistoryButtonClick);
    this.textarea.addEventListener("keydown", this._handleTextareaKeydown);
    this.historyDiv.addEventListener("click", this._handleHistoryClick);
  }

  disconnectedCallback(): void {
    this.sendButton.removeEventListener("click", this._handleSendButtonClick);
    this.clearHistoryButton.removeEventListener("click", this._handleClearHistoryButtonClick);
    this.textarea.removeEventListener("keydown", this._handleTextareaKeydown);
    this.historyDiv.removeEventListener("click", this._handleHistoryClick);
  }

  get model(): string {
    return this.modelsSelect.value;
  }

  setHistory(history: ChatMessage[]): void {
    this._state.history = history || [];
    this._renderState();
  }

  setActive(entry: ChatMessage | null): void {
    console.log("Setting active entry:", entry);
    this._state.active = entry || null;
    this._renderState();
  }

  setModels(models: Array<string | { name?: string }>): void {
    this._models = models;
    this._renderModels();
  }

  private _handleTextareaKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this._submit();
    }
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
      this._logger?.info("Nothing to send");
      return;
    }
    this._logger?.info("Send", promptText);
    this.dispatchEvent(new SubmitPromptEvent(promptText));
    this.textarea.value = "";
  }

  private _escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private _renderMarkdown(value: string): string {
    const escaped = this._escapeHtml(value);
    const blocks: string[] = [];
    const stash = (html: string): string => {
      const token = `@@MD${blocks.length}@@`;
      blocks.push(html);
      return token;
    };

    let output = escaped.replace(/```([\s\S]*?)```/g, (_match, code) => {
      return stash(`<pre><code>${String(code).replace(/^\n+|\n+$/g, "")}</code></pre>`);
    });

    output = output.replace(/`([^`]+)`/g, (_match, code) => stash(`<code>${code}</code>`));

    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, url) => {
      if (/^https?:\/\//i.test(url)) {
        return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
      }
      return label;
    });

    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/(^|[\s])\*([^*\n]+)\*(?=[\s.,!?:;]|$)/g, "$1<em>$2</em>");
    output = output.replace(/(^|[\s])_([^_\n]+)_(?=[\s.,!?:;]|$)/g, "$1<em>$2</em>");
    output = output.replace(/\n/g, "<br>");

    blocks.forEach((html, index) => {
      output = output.replace(`@@MD${index}@@`, html);
    });

    return output;
  }

  private _formatHistoryEntry(message: ChatMessage): string {
    const role = message.role;
    if(role === "assistant"){
      const thinkingHtml = message.thinking ? `<div class="chat-thinking markdown">${this._renderMarkdown(message.thinking)}</div>` : "";
      const content = message.content ? message.content.reduce((acc, part) => {
        if (part.type === "text") {
          return acc + this._escapeHtml(part.text);
        } else if (part.type === "image") {
          const src = this._escapeHtml(`data:base64,${part.data}`);
          return acc + `<img src="${src}" style="max-width: 100%; height: auto; margin: 8px 0;">`;
        }
        return acc;
      }, "") : "";
      const contentHtml = message.content ? `<div class="chat-response markdown">${this._renderMarkdown(content)}</div>` : "";
      return `${thinkingHtml}${contentHtml}`;
    } else if (role === "user") {
      const content = message.content ? message.content.reduce((acc, part) => {
        if (part.type === "text") {
          return acc + this._escapeHtml(part.text);
        } else if (part.type === "image") {
          const src = this._escapeHtml(`data:base64,${part.data}`);
          return acc + `<img src="${src}" style="max-width: 100%; height: auto; margin: 8px 0;">`;
        }
        return acc;
      }, "") : "";
      return `<div class="chat-request">${this._escapeHtml(content)}</div>`;
    } else if (role === "tool") {
      const content = message.content ? message.content.reduce((acc, part) => {
        if (part.type === "text") {
          return acc + this._escapeHtml(part.text);
        }
        return acc;
      }, "") : "";
      return `<div class="chat-tool markdown">${this._renderMarkdown(content)}</div>`;
    } else if (role === "system") {
      const content = message.content ? message.content.reduce((acc, part) => {
        if (part.type === "text") {
          return acc + this._escapeHtml(part.text);
        }
        return acc;
      }, "") : "";
      return `<div class="chat-system markdown">${this._renderMarkdown(content)}</div>`;
    }
    return "";
  }

  private _renderState(): void {
    if (this._state && this._state.history) {
      const entries = this._state.active
        ? [...this._state.history, this._state.active]
        : [...this._state.history];

      this.historyDiv.innerHTML = entries.map(item => this._formatHistoryEntry(item)).join("");
      this.historyDiv.scrollTop = this.historyDiv.scrollHeight;
    }
  }

  private _renderModels(): void {
    if (this._models && this._models.length > 0) {
      this.modelsSelect.innerHTML = this._models.map(model => {
        const label = typeof model === "string" ? model : (model.name || "");
        return `<option value="${label}">${label}</option>`;
      }).join("");
    }
  }
}
