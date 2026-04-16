
import { AssistantChatMessage, ChatMessage, ErrorChatMessage, ToolChatMessage, UserChatMessage } from "../../lib/chat/chat-message.js";
import { ToolSchema } from "../../lib/tools/tool-schema.js";
import { IPlatform } from "../../lib/platform/platform.js";
import { StreamEvent } from "../../lib/platform/stream-event.js";
import { Model } from "../../lib/models/model.js";
import { LoggerFactory } from "../../lib/logging/logger-factory.js";
import { Logger } from "../../lib/logging/logger.js";
import {
  AnthropicContentPart,
  AnthropicModelsResponse,
  AnthropicRequest,
  AnthropicRequestMessage,
  AnthropicStreamChunk,
  AnthropicToolResultPart,
} from "./anthropic-request.js";
import { IAnthropicStreamReader } from "./anthropic-stream-reader.js";
import { UrlResolver } from "../../lib/url-resolver.js";
import { buildWritingAssistantSystemPrompt } from "../../lib/platform/system-prompt.js";

export class AnthropicPlatform implements IPlatform {
  private _logger: Logger;
  private _getApiKey: () => string;
  private _streamReaderFactory: () => IAnthropicStreamReader;
  private _fetch: typeof globalThis.fetch;
  private _urlResolver: UrlResolver;

  constructor(
    loggerFactory: LoggerFactory,
    fetch: typeof globalThis.fetch,
    getApiKey: () => string,
    streamReaderFactory: () => IAnthropicStreamReader,
    endpoint = "https://api.anthropic.com"
  ) {
    this._urlResolver = new UrlResolver(endpoint, document.head);
    this._getApiKey = getApiKey;
    this._streamReaderFactory = streamReaderFactory;
    this._logger = loggerFactory("Anthropic platform");
    this._fetch = fetch;
  }

  get name(): string {
    return "Anthropic";
  }

  async getModels(): Promise<Model[]> {
    const models: Model[] = [];
    let afterId: string | undefined;

    this._logger.debug("Fetching model list from Anthropic API");

    // Page through the full model list
    do {
      const url = this._urlResolver.resolve("/v1/models");
      if (afterId) url.searchParams.set("after_id", afterId);

      const response = await this._fetch(url, {
        method: "GET",
        headers: {
          "anthropic-dangerous-direct-browser-access": "true",
          "anthropic-version": "2023-06-01",
          "x-api-key": this._getApiKey(),
        },
      });

      if (response.status >= 500) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const data: AnthropicModelsResponse = await response.json();

      for (const item of data.data) {
        const capabilities = this._extractCapabilities(item.capabilities);
        models.push({
          name: item.id,
          platform: this.name,
          capabilities,
        });
      }

      afterId = data.has_more && data.last_id ? data.last_id : undefined;
    } while (afterId);

    return models;
  }

  private _extractCapabilities(capabilities: Record<string, unknown> | undefined): string[] {
    if (!capabilities) return [];
    return Object.entries(capabilities)
      .filter(([, cap]) => typeof cap === "object" && cap !== null && (cap as Record<string, unknown>).supported === true)
      .map(([name]) => name);
  }

  async *generate(model: Model, chatMessages: ChatMessage[], tools: ToolSchema[]): AsyncIterable<StreamEvent> {
    const request = this._buildModelInput(model, chatMessages, tools);
    this._logger.debug("Sending request to Anthropic API", request);
    const url = this._urlResolver.resolve("/v1/messages");
    const response = await this._fetch(url.toString(), {
      method: "POST",
      headers: {
        "anthropic-dangerous-direct-browser-access": "true",
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": this._getApiKey(),
      },
      body: JSON.stringify(request),
    });

    if (response.status >= 500) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Anthropic API error: No response body");
    }

    // Track in-flight tool call blocks, keyed by content block index
    const toolBlocks = new Map<number, { id: string; name: string; partialJson: string }>();

    if(response.headers.get("Content-Type") === "application/json") {
      const errorText = await response.text();
      const json = JSON.parse(errorText);

      const streamChunkJson: AnthropicStreamChunk = {
        type: "error",
        error: {
          type: json.error?.type || "unknown_error",
          message: json.error?.message || "An unknown error occurred",
        },
      };

      yield* this._buildStreamEventsFromChunk(streamChunkJson, toolBlocks);
    } else {
      const reader = this._streamReaderFactory();
      for await (const chunk of reader.read(response.body)) {
        for (const event of this._buildStreamEventsFromChunk(chunk, toolBlocks)) {
          yield event;
        }
      }
    }
  }

  private _buildStreamEventsFromChunk(
    chunk: AnthropicStreamChunk,
    toolBlocks: Map<number, { id: string; name: string; partialJson: string }>
  ): StreamEvent[] {
    const events: StreamEvent[] = [];

    switch (chunk.type) {
      case "content_block_start":
        if (chunk.content_block.type === "tool_use") {
          toolBlocks.set(chunk.index, {
            id: chunk.content_block.id,
            name: chunk.content_block.name,
            partialJson: "",
          });
        }
        break;

      case "content_block_delta":
        if (chunk.delta.type === "text_delta" && chunk.delta.text.length > 0) {
          events.push({ type: "text_delta", text: chunk.delta.text });
        } else if (chunk.delta.type === "thinking_delta" && chunk.delta.thinking.length > 0) {
          events.push({ type: "reasoning_delta", text: chunk.delta.thinking });
        } else if (chunk.delta.type === "input_json_delta") {
          const block = toolBlocks.get(chunk.index);
          if (block) {
            block.partialJson += chunk.delta.partial_json;
          }
        }
        break;

      case "content_block_stop": {
        const block = toolBlocks.get(chunk.index);
        if (block) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(block.partialJson);
          } catch {
            this._logger.warn(`Failed to parse tool call arguments for ${block.name}: ${block.partialJson}`);
          }
          events.push({
            type: "tool_call",
            tool_call: {
              id: block.id,
              name: block.name,
              arguments: args,
            },
          });
          toolBlocks.delete(chunk.index);
        }
        break;
      }

      case "message_stop":
        events.push({ type: "done" });
        break;

      case "error":
        const errorStreamEvent: StreamEvent = {
          type: "error",
          error: chunk.error.message,
        };
        events.push(errorStreamEvent);
        break;
      default:
        this._logger.warn(`Unknown chunk type: ${(chunk as any).type}`);
        break;
    }

    return events;
  }

  private _buildModelInput(model: Model, chatMessages: ChatMessage[], toolSchemas: ToolSchema[]): AnthropicRequest {
    let systemContent = buildWritingAssistantSystemPrompt();

    const messages: AnthropicRequestMessage[] = [];
    let i = 0;

    while (i < chatMessages.length) {
      const message = chatMessages[i];

      switch (message.role) {
        case "system":
          systemContent += "\n" + this._extractText(message);
          i++;
          break;

        case "user":
          messages.push(this._formatUserMessage(message));
          i++;
          break;

        case "assistant":
          messages.push(this._formatAssistantMessage(message));
          i++;
          break;

        case "tool":
          // Collect all consecutive tool result messages into a single user message
          const toolResults: AnthropicToolResultPart[] = [];
          while (i < chatMessages.length && chatMessages[i].role === "tool") {
            const toolMsg = chatMessages[i] as ToolChatMessage;
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolMsg.tool_call_id,
              content: this._extractText(toolMsg),
            });
            i++;
          }
          messages.push({ role: "user", content: toolResults });
          break;
        default:
          i++;
          break;
      }
    }

    const supportsThinking = model.capabilities?.includes("thinking");

    const request: AnthropicRequest = {
      model: model.name,
      messages,
      system: systemContent,
      max_tokens: 16000,
      stream: true,
      tools: toolSchemas?.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: {
          type: "object",
          ...(tool.function.parameters as object),
        },
      })),
      thinking: supportsThinking ? { type: "enabled", budget_tokens: 8000 } : undefined,
    };

    return request;
  }

  private _extractText(message: ChatMessage): string {
    return message.content
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("\n");
  }

  private _formatUserMessage(message: UserChatMessage): AnthropicRequestMessage {
    const parts: AnthropicContentPart[] = [];

    for (const part of message.content) {
      if (part.type === "text" && part.text.trim()) {
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "context") {
        parts.push({
          type: "text",
          text: `<${part.name}>\n${JSON.stringify(part.data, null, 2)}\n</${part.name}>`,
        });
      }
    }

    return { role: "user", content: parts.length > 0 ? parts : [{ type: "text", text: " " }] };
  }

  private _formatAssistantMessage(message: AssistantChatMessage): AnthropicRequestMessage {
    const parts: AnthropicContentPart[] = [];

    const textContent = message.content
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("\n");

    if (textContent.trim()) {
      parts.push({ type: "text", text: textContent });
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        parts.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
    }

    return {
      role: "assistant",
      content: parts.length > 0 ? parts : [{ type: "text", text: " " }],
    };
  }
}
