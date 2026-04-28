import { AssistantChatMessage, ChatMessage, SystemChatMessage, ToolChatMessage, UserChatMessage } from "../../lib/chat/chat-message.js";
import { ToolSchema } from "../../lib/tools/tool-schema.js";
import { IPlatform } from "../../lib/platform/platform.js";
import { StreamEvent } from "../../lib/platform/stream-event.js";
import { Model } from "../../lib/models/model.js";
import { OllamaStreamChunk, IOllamaStreamReader } from "./ollama-stream-reader.js";
import { LoggerFactory } from "../../lib/logging/logger-factory.js";
import { Logger } from "../../lib/logging/logger.js";
import { OllamaAssistantRequestMessage, OllamaRequest, OllamaRequestMessage, OllamaSystemRequestMessage, OllamaToolRequestMessage, OllamaUserRequestMessage } from "./ollama-request.js";
import { JSONValue } from "../../lib/JSONValue.js";
import { UrlResolver } from "../../lib/url-resolver.js";
import { PlatformGenerateOptions } from "../../lib/platform/platform-registry.js";

export class OllamaPlatform implements IPlatform {
  private _logger: Logger;
  private _getApiKey: () => string;
  private _streamReaderFactory: () => IOllamaStreamReader;
  private _fetch: typeof globalThis.fetch;
  private _urlResolver: UrlResolver;

  constructor(
    loggerFactory: LoggerFactory,
    fetch: typeof globalThis.fetch,
    getApiKey: () => string,
    streamReaderFactory: () => IOllamaStreamReader,
    endpoint: string = "https://api.ollama.com"
  ) {
    this._urlResolver = new UrlResolver(endpoint, document.head);
    this._getApiKey = getApiKey;
    this._streamReaderFactory = streamReaderFactory;
    this._logger = loggerFactory("Ollama platform");
    this._fetch = fetch;
  }

  get name(): string {
    return "Ollama";
  }

  isAvailable(): boolean {
    return true;
  }

  async getModels(): Promise<Model[]> {
    const modelList = await this._fetchModelList();
    // Fetch the details for each model in parallel, but limit concurrency to avoid overwhelming the API if there are lots of models
    const concurrencyLimit = 5;
    const modelDetailsList: Model[] = [];
    for (let i = 0; i < modelList.length; i += concurrencyLimit) {
      const batch = modelList.slice(i, i + concurrencyLimit);
      const batchDetails = await Promise.all(batch.map(modelName => this._fetchModelDetails(modelName)));
      modelDetailsList.push(...batchDetails);
    }
    return modelDetailsList;
  }

  private async _fetchModelList(): Promise<Array<string>> {
    const url = this._urlResolver.resolve("/api/tags");
    const response = await this._fetch(url, {
      method: "GET",
      headers: this._buildHeaders(false),
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    const data: {models: {name:string}[]} = await response.json();
    return data.models.map(model => model.name);
  }

  private async _fetchModelDetails(modelName: string): Promise<Model> {
    const url = this._urlResolver.resolve("/api/show");
    const response = await this._fetch(url, {
      method: "POST",
      headers: this._buildHeaders(true),
      body: JSON.stringify({ model: modelName }),
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    const data: {capabilities: Array<string>} = await response.json();

    const modelDetails: Model = {
      name: modelName,
      platform: this.name,
      capabilities: data.capabilities,
      supportsStreamingToolCalls: false,
    };

    return modelDetails;
  }

  async *generate(model: Model, chatMessages: ChatMessage[], tools: ToolSchema[], options?: PlatformGenerateOptions): AsyncIterable<StreamEvent> {

    // Default to thinking unless the caller explicitly sets think to false, or the model declares capabilities that exclude "thinking".
    const think = options?.think !== false && (model.capabilities == null || model.capabilities.includes("thinking"));

    // Format the messages for Ollama's API
    const request = this.buildModelInput(model, chatMessages, tools, think);

    this._logger.debug("Sending request to Ollama API", request);

    // Send the request to Ollama's API
    const url = this._urlResolver.resolve("/api/chat");
    let response: Response;
    try {
      response = await this._fetch(url, {
        method: "POST",
        headers: this._buildHeaders(true),
        body: JSON.stringify(request),
        signal: options?.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    if(!response.body) {
      throw new Error("Ollama API error: No response body");
    }

    // Read the streaming response using NdJson format chunks and convert them into StreamEvents that we can yield back to the caller.
    const reader = this._streamReaderFactory();
    for await (const chunk of reader.read(response.body!)) {
      const streamEvents = this.buildStreamEventFromChunk(chunk);
      for (const streamEvent of streamEvents) {
        yield streamEvent;
      }
    }
  }

  private buildModelInput(model: Model, chatMessages: ChatMessage[], toolSchemas: ToolSchema[], think: boolean): OllamaRequest {

    const modelName = model.name;

    this._logger.debug(`Building Ollama request for model: ${modelName}`);
   
    const messages = chatMessages.map((message, index, array) => this._formatMessage(message, index, array)).filter(Boolean) as OllamaRequestMessage[];

    const modelInput: OllamaRequest = {
      model: modelName,
      messages: messages,
      stream: true,
      think: think,
      tools: toolSchemas?.map(tool => ({
        type: "function",
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }
      })),
    }

    return modelInput
  };

  private _buildHeaders(includeJsonContentType: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeJsonContentType) {
      headers["Content-Type"] = "application/json";
    }

    const apiKey = this._getApiKey?.() ?? "";
    if (apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    return headers;
  }

  private _formatToolMessage(message: ToolChatMessage, index: number, array: ChatMessage[]): OllamaToolRequestMessage {
    const contentString = message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
    if(!contentString) {
      this._logger.warn(`Tool message at index ${index} in conversation with ${array.length} messages has no text content.`);
    }
    return ({
      role: "tool",
      tool_call_id: message.tool_call_id,
      content: contentString,
    });
  }

  private _formatSystemMessage(message: SystemChatMessage, _index: number, _array: ChatMessage[]): OllamaSystemRequestMessage {
    const contentString = message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
    return ({
      role: "system",
      content: contentString,
    });
  }

  private _formatUserMessage(message: UserChatMessage, _index: number, _array: ChatMessage[]): OllamaUserRequestMessage {
    const contentString = message.content.reduce((acc, part) => {
      if(part.type === "text") {
        return `${acc}\n${part.text}\n`;
      }
      if(part.type === "context") {
        return acc + `\n<${part.name}>\n${JSON.stringify(part.data, null, 2)}\n</${part.name}>`;
      }
      return acc;
    }, "");

    const images: string[] = [];
    message.content.forEach(part => {
      if(part.type === "image" && typeof part.data === "string") {
        images.push(part.data);
      }
    });

    return ({
      role: "user",
      content: contentString,
      images: images.length > 0 ? images : undefined,
    });
  }

  private _formatAssistantMessage(message: AssistantChatMessage, _index: number, _array: ChatMessage[]): OllamaAssistantRequestMessage {
    /* 
    In Ollama’s chat API an assistant message is expected to be either:
    - a tool call message (tool_calls), where content is typically empty or null
    - a normal message with content, *or*
    */

    // Tool calls
    const tool_calls = message.tool_calls?.map(tc => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: tc.arguments as JSONValue,
      }
    }));

    if(tool_calls && tool_calls.length > 0) {
      return ({
        role: "assistant",
        tool_calls: tool_calls,
      });
    }

    // Normal message with content (and optional images)
    const contentString = message.content.reduce((acc, part) => {
      if(part.type === "text") {
        return `${acc}\n${part.text}\n`;
      }
      return acc;
    }, "");

    const images: string[] = [];
    message.content.forEach(part => {
      if(part.type === "image" && typeof part.data === "string") {
        images.push(part.data);
      }
    });
   
    return ({
      role: "assistant",
      images: images.length > 0 ? images : undefined,
      content: contentString || " ",
    });
  }

  // Formats a ChatMessage into the structure expected by Ollama's API, including handling different message roles and content formatting.
  private _formatMessage(message: ChatMessage, index: number, array: ChatMessage[]): OllamaRequestMessage | null {
    switch (message.role) {
      case "tool":
        return this._formatToolMessage(message, index, array);
      case "system":
        return this._formatSystemMessage(message, index, array);
      case "user":
        return this._formatUserMessage(message, index, array);
      case "assistant":
        return this._formatAssistantMessage(message, index, array);
      default: {
        const unknownMessage = message as ChatMessage;
        this._logger.error(`Unknown message role: ${unknownMessage.role} in message at index ${index} in conversation with ${array.length} messages.`);
        return null;
      }
    }
  }

  private buildStreamEventFromChunk(chunk: OllamaStreamChunk): StreamEvent[] {
    const events: StreamEvent[] = [];

    const text = chunk.message?.content;
    if (typeof text === "string" && text.length > 0) {
      events.push({ type: "text_delta", text });
    }

    const thinking = chunk.message?.thinking ?? chunk.thinking;
    if (typeof thinking === "string" && thinking.length > 0) {
      events.push({ type: "reasoning_delta", text: thinking });
    }

    const images = chunk.message?.images ?? [];
    for(const image of images) {
      events.push({ type: "image", data: image });
    }

    for (const toolCall of chunk.message?.tool_calls ?? []) {
      const toolName = toolCall?.function?.name;
      if (typeof toolName === "string" && toolName.length > 0) {
        events.push({
          type: "tool_call",
          tool_call: {
            id: toolCall?.id || `call_${Math.random().toString(32).slice(-8)}`,
            name: toolName,
            arguments: toolCall?.function?.arguments ?? {},
          }
        });
      }
    }

    if (chunk.done) {
      events.push({ type: "done" });
    }

    return events;
  }
}
