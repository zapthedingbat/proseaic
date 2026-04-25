
export type GeminiTextPart = {
  text: string;
};

export type GeminiFunctionCallPart = {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
};

export type GeminiFunctionResponsePart = {
  functionResponse: {
    name: string;
    response: { content: string };
  };
};

export type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart;

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export type GeminiFunctionDeclaration = {
  name: string;
  description?: string;
  parameters?: object;
};

export type GeminiRequest = {
  system_instruction?: { parts: [{ text: string }] };
  contents: GeminiContent[];
  tools?: Array<{ function_declarations: GeminiFunctionDeclaration[] }>;
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    thinkingConfig?: {
      thinkingLevel?: "minimal" | "low" | "medium" | "high";
    }
  };
};

export type GeminiStreamChunk = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
      role?: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: Record<string, unknown>;
};

export type GeminiModelListItem = {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
};

export type GeminiModelsResponse = {
  models: GeminiModelListItem[];
  nextPageToken?: string;
};
