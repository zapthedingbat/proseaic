
import { AssistantChatMessage, ChatMessage, ToolChatMessage, UserChatMessage } from "../../lib/chat/chat-message.js";
import { ToolSchema } from "../../lib/tools/tool-schema.js";
import { IPlatform } from "../../lib/platform/platform.js";
import { StreamEvent } from "../../lib/platform/stream-event.js";
import { Model } from "../../lib/models/model.js";
import { LoggerFactory } from "../../lib/logging/logger-factory.js";
import { Logger } from "../../lib/logging/logger.js";
import {
  GeminiContent,
  GeminiFunctionResponsePart,
  GeminiModelsResponse,
  GeminiPart,
  GeminiRequest,
} from "./gemini-request.js";
import { IGeminiStreamReader } from "./gemini-stream-reader.js";
import { UrlResolver } from "../../lib/url-resolver.js";
import { PlatformGenerateOptions } from "../../lib/platform/platform-registry.js";

export class GeminiPlatform implements IPlatform {
  private _logger: Logger;
  private _urlResolver: UrlResolver;
  private _getApiKey: () => string;
  private _streamReaderFactory: () => IGeminiStreamReader;
  private _fetch: typeof globalThis.fetch;

  constructor(
    loggerFactory: LoggerFactory,
    fetch: typeof globalThis.fetch,
    getApiKey: () => string,
    streamReaderFactory: () => IGeminiStreamReader,
    endpoint = "https://generativelanguage.googleapis.com"
  ) {
    this._urlResolver = new UrlResolver(endpoint, document.head);
    this._getApiKey = getApiKey;
    this._streamReaderFactory = streamReaderFactory;
    this._logger = loggerFactory("Gemini platform");
    this._fetch = fetch;
  }

  get name(): string {
    return "Gemini";
  }

  isAvailable(): boolean {
    return this._getApiKey().trim().length > 0;
  }

  async getModels(): Promise<Model[]> {
    const models: Model[] = [];
    let pageToken: string | undefined;

    do {
      const url = this._urlResolver.resolve("/v1beta/models");
      url.searchParams.set("key", this._getApiKey());
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await this._fetch(url, { method: "GET" });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data: GeminiModelsResponse = await response.json();

      for (const item of data.models) {
        if (!item.supportedGenerationMethods.includes("generateContent")) continue;

        // Strip "models/" prefix to get the plain model ID used in generate requests
        const modelId = item.name.startsWith("models/") ? item.name.slice("models/".length) : item.name;

        models.push({
          name: modelId,
          platform: this.name,
          supportsStreamingToolCalls: true,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return models;
  }

  async *generate(model: Model, chatMessages: ChatMessage[], tools: ToolSchema[], options?: PlatformGenerateOptions): AsyncIterable<StreamEvent> {
    
    // Default to thinking unless the caller explicitly sets thinkOption to false, or its not supported by the model.
    const think = ((options?.think !== false) && model.capabilities?.includes("thinking")) ?? false;

    // Format the messages for the Gemini API.
    const request = this._buildModelInput(model, chatMessages, tools, think);

    this._logger.debug("Sending request to Gemini API", request);

    const url = this._urlResolver.resolve(`/v1beta/models/${model.name}:streamGenerateContent`);
    url.searchParams.set("key", this._getApiKey());
    url.searchParams.set("alt", "sse");

    let response: Response;
    try {
      response = await this._fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: options?.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Gemini API error: No response body");
    }

    const reader = this._streamReaderFactory();
    let emittedDone = false;

    for await (const chunk of reader.read(response.body)) {
      const candidate = chunk.candidates?.[0];
      if (!candidate) continue;

      const parts = candidate.content?.parts ?? [];

      for (const part of parts) {
        if ("text" in part && typeof part.text === "string" && part.text.length > 0) {
          yield { type: "text_delta", text: part.text };
        } else if ("functionCall" in part) {
          const { name, args } = part.functionCall;
          yield {
            type: "tool_call",
            tool_call: {
              id: `call_${Math.random().toString(32).slice(-8)}`,
              name,
              arguments: args ?? {},
            },
          };
        }
      }

      if (candidate.finishReason && candidate.finishReason !== "FINISH_REASON_UNSPECIFIED") {
        yield { type: "done" };
        emittedDone = true;
      }
    }

    if (!emittedDone) {
      yield { type: "done" };
    }
  }

  private _buildModelInput(model: Model, chatMessages: ChatMessage[], toolSchemas: ToolSchema[], think: boolean): GeminiRequest {
    const systemText = "";

    const contents: GeminiContent[] = [];
    let i = 0;
    let extraSystemText = "";

    while (i < chatMessages.length) {
      const message = chatMessages[i];

      switch (message.role) {
        case "system":
          extraSystemText += "\n" + message.content.filter(p => p.type === "text").map(p => p.text).join("\n");
          i++;
          break;

        case "user":
          contents.push(this._formatUserContent(message));
          i++;
          break;

        case "assistant":
          contents.push(this._formatAssistantContent(message));
          i++;
          break;

        case "tool": {
          // Collect consecutive tool result messages into a single user turn
          const responseParts: GeminiFunctionResponsePart[] = [];
          while (i < chatMessages.length && chatMessages[i].role === "tool") {
            const toolMsg = chatMessages[i] as ToolChatMessage;
            const resultText = toolMsg.content.filter(p => p.type === "text").map(p => p.text).join("\n");
            // Gemini requires the function name, not just the ID. We use the tool_call_id as the name
            // fallback since we may not have the name here. In practice the session should include it.
            responseParts.push({
              functionResponse: {
                name: toolMsg.tool_call_id,
                response: { content: resultText },
              },
            });
            i++;
          }
          contents.push({ role: "user", parts: responseParts });
          break;
        }

        default:
          i++;
          break;
      }
    }

    const fullSystemText = systemText + (extraSystemText ? "\n" + extraSystemText : "");

    const request: GeminiRequest = {
      system_instruction: { parts: [{ text: fullSystemText }] },
      contents,
      tools: toolSchemas?.length
        ? [
            {
              function_declarations: toolSchemas.map(tool => ({
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
              })),
            },
          ]
        : undefined,
      generationConfig: {
        thinkingConfig: {
          "thinkingLevel": think ? "high" : "minimal",
        }
      },
    };

    return request;
  }

  private _formatUserContent(message: UserChatMessage): GeminiContent {
    const parts: GeminiPart[] = [];

    for (const part of message.content) {
      if (part.type === "text" && part.text.trim()) {
        parts.push({ text: part.text });
      } else if (part.type === "context") {
        parts.push({ text: `<${part.name}>\n${JSON.stringify(part.data, null, 2)}\n</${part.name}>` });
      }
    }

    return { role: "user", parts: parts.length > 0 ? parts : [{ text: " " }] };
  }

  private _formatAssistantContent(message: AssistantChatMessage): GeminiContent {
    const parts: GeminiPart[] = [];

    const textContent = message.content.filter(p => p.type === "text").map(p => p.text).join("\n");
    if (textContent.trim()) {
      parts.push({ text: textContent });
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments,
          },
        });
      }
    }

    return { role: "model", parts: parts.length > 0 ? parts : [{ text: " " }] };
  }
}
