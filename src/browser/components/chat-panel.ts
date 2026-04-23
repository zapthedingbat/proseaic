import { Marked } from "marked";
import { ClearHistoryEvent, InsertContentEvent, NewDocumentEvent, SelectCheckpointEvent, SubmitPromptEvent } from "../lib/events.js";
import { BaseHtmlElement } from "./base-html-element.js";
import { AssistantChatMessage, ChatMessage, ChatMessageContentPart, ToolChatMessage } from "../lib/chat/chat-message.js";
import { Model } from "../lib/models/model.js";
import { PaneAction } from "./pane.js";

const html = `
<div class="panel">
  <div id="chat-history" class="chat-history scroll-box bottom-up"></div>
  <div id="chat-input" class="textarea-input">
    <textarea id="chat-textarea"></textarea>
    <div class="actions-container">
      <select id="chat-model-select" class="action-item"></select>
      <button class="action-item" type="button" id="chat-send"><i class="codicon codicon-arrow-up"></i></button>
    </div>
  </div>
</div>
`;

type MessageElementFactory = (message: ChatMessage) => HTMLElement | null;
type MessageElementFactoryMap = {
  [role in ChatMessage["role"]]: MessageElementFactory;
};

type ActiveMessageState = {
  message: ChatMessage;
  think: ActiveMessageStateBuffer;
  response: ActiveMessageStateBuffer;
} | null;

type ActiveMessageStateBuffer = {
  markdown: string;
  line: string[];
}

// <chat-panel> WebComponent
export class ChatPanel extends BaseHtmlElement {

  private modelsSelect!: HTMLSelectElement;
  private textarea!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private historyDiv!: HTMLDivElement;
  private _models: Array<Model>;
  private _state: {
    history: ChatMessage[];
    active: ActiveMessageState;
  };
  private _marked: Marked;
  private _activeMessageElement: HTMLElement | null;
  private _messageElementFactories: MessageElementFactoryMap;

  constructor() {
    super();
    this._models = [];
    this._state = {
      history: [],
      active: null
    };
    this._activeMessageElement = null;

    // TODO: Move the markdown rendering and buffering out to a separate class.
    this._marked = new Marked({ breaks: true });
  
    this._messageElementFactories = {
      system: this._createSystemMessageElement,
      user: this._createUserMessageElement,
      assistant: this._createAssistantMessageElement,
      tool: this._createToolMessageElement,
      error: this._createErrorMessageElement
    };

  }

  connectedCallback(): void {
    if (!this.sendButton) {
      this.innerHTML = html;
      this.modelsSelect = this.querySelector("#chat-model-select") as HTMLSelectElement;
      this.textarea = this.querySelector("#chat-textarea") as HTMLTextAreaElement;
      this.sendButton = this.querySelector("#chat-send") as HTMLButtonElement;
      this.historyDiv = this.querySelector("#chat-history") as HTMLDivElement;
      this._renderModels();
      if (this._state.history.length > 0) {
        this.setHistory(this._state.history);
      }
      if (this._state.active?.message?.role === "assistant") {
        this.setAssistantMessage(this._state.active.message);
      }
    }
    this.sendButton.addEventListener("click", this._handleSendButtonClick);
    this.textarea.addEventListener("keydown", this._handleTextareaKeydown);
    this.textarea.addEventListener("input", this._handleTextareaInput);
    this.historyDiv.addEventListener("click", this._handleHistoryClick);
    this.historyDiv.addEventListener("click", this._handleContentActionClick);
  }

  disconnectedCallback(): void {
    this.sendButton.removeEventListener("click", this._handleSendButtonClick);
    this.textarea.removeEventListener("keydown", this._handleTextareaKeydown);
    this.textarea.removeEventListener("input", this._handleTextareaInput);
    this.historyDiv.removeEventListener("click", this._handleHistoryClick);
    this.historyDiv.removeEventListener("click", this._handleContentActionClick);
  }

  getPaneActions(): PaneAction[] {
    return [
      { id: "settings", title: "Settings", icon: "codicon-gear" },
      { id: "clear", title: "Clear chat", icon: "codicon-archive" }
    ];
  }

  onPaneAction(actionId: string): void {
    if (actionId === "settings") {
      const settingsPanel = this.ownerDocument.getElementById("ui-settings-panel") as HTMLElement | null;
      settingsPanel?.showPopover();
      return;
    }
    if (actionId === "clear") {
      this.dispatchEvent(new ClearHistoryEvent());
    }
  }

  get model(): string {
    return this.modelsSelect.value;
  }

  // Replaces the entire chat history with the provided messages
  // Messages are only pushed to the history when they are 'done'
  // So the history won't include messages that are still being generated.
  setHistory(history: ChatMessage[]): void {
    this._state.history = history;
    if (!this.historyDiv) {
      return;
    }
    this.historyDiv.innerHTML = "";
    for (const message of history) {
      const messageElement = this._createMessageElement(message);
      if(messageElement) {
        this.historyDiv.appendChild(messageElement);
      }
    }
    this._scrollHistoryToBottom();
  }

  setAssistantMessage(entry: AssistantChatMessage | null): void {
    this._logger.debug("Setting active assistant message:", entry);
    this._activeMessageElement = null;
    if (!this.historyDiv) {
      this._state.active = entry ? {
        message: entry,
        think: {
          markdown: this._renderMarkdown(entry.thinking ?? ""),
          line: []
        },
        response: {
          markdown: this._renderMarkdown(this._extractTextContent(entry?.content || [])),
          line: []
        }
      } : null;
      return;
    }
    if(entry !== null) {

      // Reset active message rendering buffers
      const thinkBuffer: ActiveMessageStateBuffer = {
        markdown: this._renderMarkdown(entry.thinking ?? ""),
        line: []
      }
      const responseBuffer: ActiveMessageStateBuffer = {
        markdown: this._renderMarkdown(this._extractTextContent(entry?.content || [])),
        line: []
      }
      this._state.active = entry ? {
        message: entry,
        think: thinkBuffer,
        response: responseBuffer
      } : null;

      // Create a new element for the message
      const messageElement = this._createMessageElement(entry);
      if(messageElement) {
        this.historyDiv.appendChild(messageElement);
        this._activeMessageElement = messageElement;
      } else {
        this._logger.warn("Failed to create message element for active assistant message");
      }
    }

    this._scrollHistoryToBottom();
  }

  appendResponseToActiveMessage(response: string): void {
    this._logger.debug("Appending to active message response:", response);
    if(this._state.active) {
      // Update response buffer
      this._state.active.response.markdown += response
      // Update content in the active message element
      if(this._activeMessageElement) {
        let contentElement = this._activeMessageElement.querySelector(".content");
        if(!contentElement) {
          contentElement = this.ownerDocument.createElement("div");
          contentElement.classList.add("content", "markdown");
          this._activeMessageElement.appendChild(contentElement);
        }
        const html = this._renderMarkdown(this._state.active.response.markdown);
        contentElement.innerHTML = html;
      } else {
        this._logger.warn("No active message element to append response to");
      }
    } else {
      this._logger.warn("No active message to append response to");
    }
    
    // TODO: Debounce the scrolling so that it doesn't happen on every update but still scrolls reasonably frequently for a good user experience.
    this._scrollHistoryToBottom();
  }

  appendThinkingToActiveMessage(thinking: string): void {
    this._logger.debug("Appending to active message thinking:", thinking);
    if(this._state.active) {
      // Update thinking buffer
      this._state.active.think.markdown += thinking;
      // Update thinking content in the active message element
      if(this._activeMessageElement) {
        let thinkingElement = this._activeMessageElement.querySelector(".thinking");
        if(!thinkingElement) {
          thinkingElement = this.ownerDocument.createElement("div");
          thinkingElement.classList.add("thinking", "markdown");
          this._activeMessageElement.appendChild(thinkingElement);
        }
        const html = this._renderMarkdown(this._state.active.think.markdown);
        thinkingElement.innerHTML = html;
      }
    }

    // TODO: Debounce the scrolling so that it doesn't happen on every update but still scrolls reasonably frequently for a good user experience.
    this._scrollHistoryToBottom();
  }

  appendImageToActiveMessage(src: string): void {
    if(this._activeMessageElement) {
      const imageElement = this.ownerDocument.createElement("img");
      imageElement.src = src;
      this._activeMessageElement.appendChild(imageElement);
    }
  }

  setModels(models: Array<Model>): void {
    this._models = models;
    if (!this.modelsSelect) {
      return;
    }
    this._renderModels();
  }

  private _renderMarkdown(markdown: string): string {
    return this._marked.parseInline(markdown) as string;
  }

  private _handleContentActionClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement)?.closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    const contentId = button.dataset.contentSrc ?? "";
    const contentElement = this.querySelector(`[data-content-id="${contentId}"]`) as HTMLDivElement | null;
    if (!contentElement) return;
    const content = contentElement.textContent || "";
    if (button.dataset.action === "insert") {
      this.dispatchEvent(new InsertContentEvent(content));
    } else if (button.dataset.action === "new-document") {
      this.dispatchEvent(new NewDocumentEvent(content));
    }
  };

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

  private _handleHistoryClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button[data-checkpoint-id]") as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const checkpointId = button.dataset.checkpointId || "";
    this.dispatchEvent(new SelectCheckpointEvent(checkpointId));
  };

  setSendEnabled(enabled: boolean): void {
    if (this.sendButton) {
      this.sendButton.disabled = !enabled;
    }
  }

  private _submit(): void {
    const promptText = this.textarea.value.trim();
    if (!promptText){
      return;
    }
    this.sendButton.disabled = true;
    this.dispatchEvent(new SubmitPromptEvent(promptText));
    this.textarea.value = "";
  }

  private _createMessageElement(message: ChatMessage): HTMLElement | null {
    const factory = this._messageElementFactories[message.role];
    if (!factory) {
      this._logger.warn(`No message element factory found for role: ${message.role}`);
      return null;
    }
    return factory.call(this, message);
  }

  private _createSystemMessageElement(message: ChatMessage): HTMLElement {
    const messageElement = this.ownerDocument.createElement("div");
    messageElement.classList.add("chat-message");
    messageElement.dataset.role = "system";

    const contentDiv = this.ownerDocument.createElement("div");
    contentDiv.classList.add("content", "markdown");
    contentDiv.innerHTML = this._renderMarkdown(this._extractTextContent(message.content));
    messageElement.appendChild(contentDiv);
    return messageElement;
  }

  private _createUserMessageElement(message: ChatMessage): HTMLElement {
    const messageElement = this.ownerDocument.createElement("div");
    messageElement.classList.add("chat-message");
    messageElement.dataset.role = "user";

    const contentDiv = this.ownerDocument.createElement("div");
    contentDiv.classList.add("content", "markdown");
    contentDiv.innerHTML = this._renderMarkdown(this._extractTextContent(message.content));
    messageElement.appendChild(contentDiv);
    return messageElement;
  }

  private _createAssistantMessageElement(message: ChatMessage): HTMLElement | null {

    if(message.role !== "assistant") {
      this._logger.warn(`Expected assistant message but got message with role: ${message.role}`);
      return null;
    }

    const messageElement = this.ownerDocument.createElement("div");
    messageElement.classList.add("chat-message");
    messageElement.dataset.role = "assistant";

    if(message.thinking) {
      const thinkingDiv = this.ownerDocument.createElement("div");
      thinkingDiv.classList.add("thinking", "markdown");
      thinkingDiv.innerHTML = this._renderMarkdown(message.thinking);
      messageElement.appendChild(thinkingDiv);
    }

    if(message.content && message.content.length > 0) {
      const contentDiv = this.ownerDocument.createElement("div");
      contentDiv.classList.add("content", "markdown");
      contentDiv.innerHTML = this._renderMarkdown(this._extractTextContent(message.content));
      messageElement.appendChild(contentDiv);
    }

    if(message.tool_calls && message.tool_calls.length > 0) {
      for(const toolCall of message.tool_calls) {
        const toolCallDiv = this.ownerDocument.createElement("div");
        toolCallDiv.classList.add("tool-call");
        const toolCallContent = `${toolCall.name}(${JSON.stringify(toolCall.arguments)})`;
        toolCallDiv.textContent = toolCallContent;
        messageElement.appendChild(toolCallDiv);
      }
    }
   
    return messageElement;
  }

  private _createToolMessageElement(message: ChatMessage): HTMLElement | null {

    if(message.role !== "tool") {
      this._logger.warn(`Expected tool message but got message with role: ${message.role}`);
      return null;
    }

    if(message.success === false) {
      const messageElement = this.ownerDocument.createElement("div");
      messageElement.classList.add("chat-message");
      messageElement.dataset.role = "tool";
      return messageElement;
    }
    return null;
  }

  private _createErrorMessageElement(message: ChatMessage): HTMLElement {
    const messageElement = this.ownerDocument.createElement("div");
    messageElement.classList.add("chat-message");
    messageElement.dataset.role = "error";

    const contentDiv = this.ownerDocument.createElement("div");
    contentDiv.classList.add("content", "markdown");
    contentDiv.innerHTML = this._renderMarkdown(this._extractTextContent(message.content));
    messageElement.appendChild(contentDiv);
    return messageElement;
  }

  private _extractTextContent(content: ChatMessageContentPart[]): string {
    return (content).reduce((acc, part) => {
      if (part.type === "text") {
        return acc + part.text;
      }
      return acc;
    }, "");
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
