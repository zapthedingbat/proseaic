
export type MistralSystemMessage = {
  role: "system";
  content: string;
};

export type MistralUserMessage = {
  role: "user";
  content: string;
};

export type MistralAssistantMessage = {
  role: "assistant";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type MistralToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
};

export type MistralRequestMessage =
  | MistralSystemMessage
  | MistralUserMessage
  | MistralAssistantMessage
  | MistralToolMessage;

export type MistralRequest = {
  model: string;
  messages: MistralRequestMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: object;
    };
  }>;
  stream: boolean;
};

export type MistralStreamChunk = {
  id: string;
  object: "chat.completion.chunk";
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
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

export type MistralModelListItem = {
  id: string;
  object: "model";
  capabilities?: {
    completion_chat?: boolean;
    completion_fim?: boolean;
    function_calling?: boolean;
    fine_tuning?: boolean;
    vision?: boolean;
    classification?: boolean;
  };
  archived?: boolean;
};
