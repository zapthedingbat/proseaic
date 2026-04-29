import { ChatMessage } from "../chat/chat-message.js";
import { ChatMessageEvent } from "../events.js";
import { IChatHistory } from "./chat-history.js";

export class BrowserChatHistory extends EventTarget implements IChatHistory {
  private _storageKey: string;
  private _storage: Storage;

  constructor(storageKey: string, storage: Storage) {
    super();
    this._storageKey = storageKey;
    this._storage = storage;
  }
  clearHistory(): Promise<void> {
    this._storage.removeItem(this._storageKey);
    return Promise.resolve();
  }

  async getMessages(maxMessages?: number): Promise<ChatMessage[]> {
    const raw = this._storage.getItem(this._storageKey);
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
    this._storage.setItem(this._storageKey, JSON.stringify(history));
    this.dispatchEvent(new ChatMessageEvent(message));
  }
}
