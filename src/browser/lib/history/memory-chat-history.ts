import { IChatHistory } from "./chat-history.js";
import { ChatMessage } from "../chat/chat-message.js";
import { ChatMessageEvent } from "../events.js";

export class ChatHistory extends EventTarget implements IChatHistory {
  private _messages: ChatMessage[];
  private _maxMessages: number;
  constructor(maxMessages: number = 100) {
    super();
    this._maxMessages = maxMessages;
    this._messages = [];
  }
  clearHistory(): Promise<void> {
    this._messages = [];
    return Promise.resolve();
  }
  async addMessage(message: ChatMessage): Promise<void> {
    this._messages.push(message);
    if (this._messages.length > this._maxMessages) {
      this._messages.shift();
    }
    this.dispatchEvent(new ChatMessageEvent(message));
  }
  async getMessages(maxMessages?: number): Promise<ChatMessage[]> {
    if (maxMessages !== undefined) {
      return this._messages.slice(-maxMessages);
    }
    return this._messages;
  }
}
