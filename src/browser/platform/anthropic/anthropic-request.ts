
export type AnthropicTextPart = {
  type: "text";
  text: string;
};

export type AnthropicThinkingPart = {
  type: "thinking";
  thinking: string;
  signature: string;
};

export type AnthropicToolUsePart = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AnthropicToolResultPart = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export type AnthropicContentPart =
  | AnthropicTextPart
  | AnthropicThinkingPart
  | AnthropicToolUsePart
  | AnthropicToolResultPart;

export type AnthropicUserMessage = {
  role: "user";
  content: AnthropicContentPart[] | string;
};

export type AnthropicAssistantMessage = {
  role: "assistant";
  content: AnthropicContentPart[] | string;
};

export type AnthropicRequestMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type AnthropicRequest = {
  model: string;
  messages: AnthropicRequestMessage[];
  system?: string;
  tools?: AnthropicToolDefinition[];
  max_tokens: number;
  stream: boolean;
  thinking?: { type: "enabled"; budget_tokens: number };
};

export type AnthropicStreamChunk =
  | { type: "message_start"; message: { id: string; model: string } }
  | {
      type: "content_block_start";
      index: number;
      content_block:
        | { type: "text"; text: string }
        | { type: "thinking"; thinking: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "thinking_delta"; thinking: string }
        | { type: "input_json_delta"; partial_json: string };
    }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string } }
  | { type: "message_stop" }
  | { type: "ping" }
  | { type: "error"; error: { type: string; message: string } };

export type AnthropicModelListItem = {
  id: string;
  display_name: string;
  type: "model";
  capabilities?: Record<string, unknown>;
};

export type AnthropicModelsResponse = {
  data: AnthropicModelListItem[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
};
