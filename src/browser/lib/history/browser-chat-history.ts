import { ChatMessage } from "../chat/chat-message.js";
import { ChatMessageEvent } from "../events.js";
import { IChatHistory } from "./chat-history.js";

export class BrowserChatHistory extends EventTarget implements IChatHistory {
  private _storageKey: string;

  constructor(storageKey: string) {
    super();
    this._storageKey = storageKey;
  }
  clearHistory(): Promise<void> {
    localStorage.removeItem(this._storageKey);
    return Promise.resolve();
  }

  async getMessages(maxMessages?: number): Promise<ChatMessage[]> {
    const raw = localStorage.getItem(this._storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    const messages = Array.isArray(parsed) ? parsed : [];
    if (maxMessages !== undefined) {
      return messages.slice(-maxMessages);
    }
    return messages;
  }

  async addMessage(message: ChatMessage): Promise<void> {
    const history = await this.getMessages();
    history.push(message);
    localStorage.setItem(this._storageKey, JSON.stringify(history));
    this.dispatchEvent(new ChatMessageEvent(message));
  }
}
