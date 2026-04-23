import { JSONValue } from "../JSONValue";

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type ChatMessageContentPart =
  | { type: "context"; name: string; data: JSONValue}
  | { type: "image"; url?: string; data?: string; mime_type?: string }
  | { type: "text"; text: string };

type BaseChatMessage = {
  model: string;
  content: ChatMessageContentPart[];
  meta?: Record<string, unknown>;
};

export type ErrorChatMessage = BaseChatMessage & {
  role: "error";
};

export type SystemChatMessage = BaseChatMessage & {
  role: "system";
};

export type UserChatMessage = BaseChatMessage & {
  role: "user";
};

export type AssistantChatMessage = BaseChatMessage & {
  role: "assistant";
  thinking?: string;
  tool_calls?: ToolCall[];
};

export type ToolChatMessage = BaseChatMessage & {
  role: "tool";
  tool_call_id: string;
  success?: boolean;
};

export type ChatMessage =
  | SystemChatMessage
  | UserChatMessage
  | AssistantChatMessage
  | ToolChatMessage
  | ErrorChatMessage;