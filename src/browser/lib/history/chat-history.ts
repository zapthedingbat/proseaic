import { ChatMessage } from "../chat/chat-message.js";

export interface IChatHistory extends EventTarget {
  addMessage(message: ChatMessage): Promise<void>;
  getMessages(maxMessages?: number): Promise<ChatMessage[]>;
  clearHistory(): Promise<void>;
}

