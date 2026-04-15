export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type ChatMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image"; url?: string; data?: string; mime_type?: string }
  | { type: "context"; name: string; data: unknown }

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
};

export type ChatMessage =
  | SystemChatMessage
  | UserChatMessage
  | AssistantChatMessage
  | ToolChatMessage
  | ErrorChatMessage;