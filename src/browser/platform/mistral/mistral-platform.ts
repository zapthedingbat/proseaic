
import { AssistantChatMessage, ChatMessage, ToolChatMessage, UserChatMessage } from "../../lib/chat/chat-message.js";
import { ToolSchema } from "../../lib/tools/tool-schema.js";
import { IPlatform } from "../../lib/platform/platform.js";
import { StreamEvent } from "../../lib/platform/stream-event.js";
import { Model } from "../../lib/models/model.js";
import { LoggerFactory } from "../../lib/logging/logger-factory.js";
import { Logger } from "../../lib/logging/logger.js";
import {
  MistralAssistantMessage,
  MistralModelListItem,
  MistralRequest,
  MistralRequestMessage,
} from "./mistral-request.js";
import { IMistralStreamReader } from "./mistral-stream-reader.js";
import { UrlResolver } from "../../lib/url-resolver.js";
import { PlatformGenerateOptions } from "../../lib/platform/platform-registry.js";

export class MistralPlatform implements IPlatform {
  private _logger: Logger;
  private _getApiKey: () => string;
  private _streamReaderFactory: () => IMistralStreamReader;
  private _fetch: typeof globalThis.fetch;
  private _urlResolver: UrlResolver;

  constructor(
    loggerFactory: LoggerFactory,
    fetch: typeof globalThis.fetch,
    getApiKey: () => string,
    streamReaderFactory: () => IMistralStreamReader,
    endpoint = "https://api.mistral.ai"
  ) {
    this._getApiKey = getApiKey;
    this._streamReaderFactory = streamReaderFactory;
    this._logger = loggerFactory("Mistral platform");
    this._fetch = fetch;
    this._urlResolver = new UrlResolver(endpoint, document.head);
  }

  get name(): string {
    return "Mistral";
  }

  isAvailable(): boolean {
    return this._getApiKey().trim().length > 0;
  }

  async getModels(): Promise<Model[]> {
    const url = this._urlResolver.resolve("/v1/models");
    const response = await this._fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this._getApiKey()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.statusText}`);
    }

    const result: { object: string; data: MistralModelListItem[] } = await response.json();
    return result.data
      .filter(item => item.capabilities?.completion_chat === true && !item.archived)
      .map(item => {
        const capabilities = Object.entries(item.capabilities ?? {})
          .filter(([, supported]) => supported === true)
          .map(([name]) => name);
        return {
          name: item.id,
          platform: this.name,
          capabilities,
          supportsStreamingToolCalls: true,
        };
      });
  }

  async *generate(model: Model, chatMessages: ChatMessage[], tools: ToolSchema[], options?: PlatformGenerateOptions): AsyncIterable<StreamEvent> {
    
    // Default to thinking unless the caller explicitly sets thinkOption to false, or its not supported by the model.
    const think = ((options?.think !== false) && model.capabilities?.includes("thinking")) ?? false;

    // Format the messages for the Mistral API.
    const request = this._buildModelInput(model, chatMessages, tools, think);

    this._logger.debug("Sending request to Mistral API", request);

    const url = this._urlResolver.resolve("/v1/chat/completions");
    let response: Response;
    try {
      response = await this._fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this._getApiKey()}`,
        },
        body: JSON.stringify(request),
        signal: options?.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Mistral API error: No response body");
    }

    const reader = this._streamReaderFactory();

    // Accumulate tool call arguments by index within a single response
    const toolCallAccum = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of reader.read(response.body)) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        yield { type: "text_delta", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallAccum.has(tc.index)) {
            toolCallAccum.set(tc.index, { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" });
          }
          const accum = toolCallAccum.get(tc.index)!;
          if (tc.id) accum.id = tc.id;
          if (tc.function?.name) accum.name = tc.function.name;
          if (tc.function?.arguments) accum.arguments += tc.function.arguments;
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === "tool_calls" || finishReason === "stop") {
        for (const [, accum] of toolCallAccum) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(accum.arguments);
          } catch {
            this._logger.warn(`Failed to parse tool call arguments for ${accum.name}: ${accum.arguments}`);
          }
          yield {
            type: "tool_call",
            tool_call: {
              id: this._buildSafeToolCallId(accum.id || ""),
              name: accum.name,
              arguments: args,
            },
          };
        }
        toolCallAccum.clear();
        yield { type: "done" };
      }
    }
  }

  private _buildSafeToolCallId(name: string): string {
    // Ensure the final ID is 9 characters long and random enough to avoid collisions
    return (`${name}${Math.random().toString(32)}`).replace(/[^a-zA-Z0-9]+/g, "").slice(0, 9);
  }

  private _buildModelInput(model: Model, chatMessages: ChatMessage[], toolSchemas: ToolSchema[], think: boolean): MistralRequest {

    const messages = chatMessages
      .map(message => this._formatMessage(message))
      .filter(Boolean) as MistralRequestMessage[];

    this._logger.debug(`Building Mistral request for model: ${model.name}`);

    return {
      model: model.name,
      messages: messages,
      stream: true,
      reasoning_effort: think ? "high" : "none",
      tools: toolSchemas?.map(tool => ({
        type: "function",
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      })),
    };
  }

  private _formatMessage(message: ChatMessage): MistralRequestMessage | null {
    switch (message.role) {
      case "system": {
        const text = message.content.filter(p => p.type === "text").map(p => p.text).join("\n");
        return { role: "system", content: text };
      }
      case "user":
        return this._formatUserMessage(message);
      case "assistant":
        return this._formatAssistantMessage(message);
      case "tool":
        return this._formatToolMessage(message);
      default:
        this._logger.error(`Unknown message role: ${(message as ChatMessage).role}`);
        return null;
    }
  }

  private _formatUserMessage(message: UserChatMessage): MistralRequestMessage {
    const content = message.content.reduce((acc, part) => {
      if (part.type === "text") {
        return acc + "\n" + part.text;
      } else if (part.type === "context") {
        return acc + `\n<${part.name}>\n${JSON.stringify(part.data, null, 2)}\n</${part.name}>`;
      }
      return acc;
    }, "").trim();

    return { role: "user", content: content || " " };
  }

  private _formatAssistantMessage(message: AssistantChatMessage): MistralAssistantMessage {
    const textContent = message.content
      .filter(p => p.type === "text")
      .map(p => p.text)
      .join("\n");

    if (message.tool_calls && message.tool_calls.length > 0) {
      return {
        role: "assistant",
        content: textContent || null,
        tool_calls: message.tool_calls.map(tc => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    return { role: "assistant", content: textContent || " " };
  }

  private _formatToolMessage(message: ToolChatMessage): MistralRequestMessage {
    const content = message.content.filter(p => p.type === "text").map(p => p.text).join("\n");
    return {
      role: "tool",
      tool_call_id: this._buildSafeToolCallId(message.tool_call_id),
      content: content || " ",
    };
  }
}
