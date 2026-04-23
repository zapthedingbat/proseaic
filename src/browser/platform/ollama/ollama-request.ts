import { JSONValue } from "../../lib/JSONValue";

type OllamaRequestFormat = "json" | object;

export type OllamaRequestMessageRole = "system" | "user" | "assistant" | "tool";

export type OllamaRequestMessage = 
  | OllamaSystemRequestMessage
  | OllamaUserRequestMessage
  | OllamaAssistantRequestMessage
  | OllamaToolRequestMessage;

export type OllamaToolRequestMessage = {
  role: "tool";
  content: string;
  tool_call_id: string;
}

export type OllamaAssistantRequestMessage = {
  role: "assistant";
  images?: string[];
} & (
  | { tool_calls: Array<{ id: string; type: "function"; function: { name: string; arguments: string | JSONValue } }> }
  | { content: string }
);

export type OllamaUserRequestMessage = {
  role: "user";
  content: string;
  images?: string[];
}

export type OllamaSystemRequestMessage = {
  role: "system";
  content: string;
}

export type OllamaRequest = {
  model: string;
  messages: Array<OllamaRequestMessage>,
  tools?: Array<{
     type: "function";
     function: {
        name: string;
        parameters: object;
        description?: string;
     };
  }>,
  format?: OllamaRequestFormat;
  options?: {
    seed?: number;
    temperature?: number;
    top_k?: number;
    top_p?: number;
    min_p?: number;
    stop?: string;
    num_ctx: number;
    num_predict?: number;
  },
  stream?: boolean;
  think?: boolean;
  keep_alive?: boolean;
  logprobs?: boolean;
  top_logprobs?: number;
}

