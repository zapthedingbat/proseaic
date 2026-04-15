
export type OpenAISystemMessage = {
  role: "system";
  content: string;
};

export type OpenAIUserMessage = {
  role: "user";
  content: string;
};

export type OpenAIAssistantMessage = {
  role: "assistant";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type OpenAIToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

export type OpenAIRequestMessage =
  | OpenAISystemMessage
  | OpenAIUserMessage
  | OpenAIAssistantMessage
  | OpenAIToolMessage;

export type OpenAIRequest = {
  model: string;
  messages: OpenAIRequestMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: object;
    };
  }>;
  stream: boolean;
  stream_options?: { include_usage: boolean };
};

export type OpenAIStreamChunk = {
  id: string;
  object: "chat.completion.chunk";
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
};

export type OpenAIModelListItem = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
};

export type OpenAIModelsResponse = {
  object: "list";
  data: OpenAIModelListItem[];
};
