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
    };

    return modelDetails;
  }

  async *generate(model: Model, chatMessages: ChatMessage[], tools: ToolSchema[]): AsyncIterable<StreamEvent> {

    // Format the messages for Ollama's API
    const request = this.buildModelInput(model, chatMessages, tools);

    this._logger.debug("Sending request to Ollama API", request);

    // Send the request to Ollama's API
    const url = this._urlResolver.resolve("/api/chat");
    const response = await this._fetch(url, {
      method: "POST",
      headers: this._buildHeaders(true),
      body: JSON.stringify(request),
    });

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

  private buildModelInput(model: Model, chatMessages: ChatMessage[], toolSchemas: ToolSchema[]) {

    const modelName = model.name;
    
    /* TODO: add 'memory' section with relevant info from session memory and user memory, and update it as the conversation goes on.
    e.g
    <userMemory>
    ...
    </userMemory>
    <sessionMemory>
    ...
    </sessionMemory>
    */
   
    const KNOWLEDGE_AREA = "copy writing and technical writing, proofreading, grammar correction, and general writing assistance";
    const initialMessages: OllamaRequestMessage[] = [
      {
        role: 'system',
        content: `You are an expert writing assistant, working with a user in their text editor.
<instructions>
You are a highly sophisticated automated writing agent with expert-level knowledge across ${KNOWLEDGE_AREA}.
The user will ask a question, or ask you to perform a task, and it may require research to answer correctly. There is a selection of tools that let you perform actions or retrieve helpful context to answer the user's question.
Think creatively and explore the workspace in order to complete the task.
If the user asks you to analyze, review, summarize, rewrite, or edit existing content, use the document tools to read from the editor and act on that content instead of asking for pasted text.
</instructions>
<toolUseInstructions>
If the user explicitly asks for a standalone text sample or template (and not about their current document), you can answer directly without tools.
For requests about "the document", "this file", "current draft", "selection", or editor content, do not ask the user to paste content. Use tools to read it.
For document review/analysis tasks, call read_document_outline first, then call read_document_section for the relevant sections before giving conclusions.
For any section-targeted read or edit operation, use section_id values returned by read_document_outline instead of heading text.
For document update tasks, read relevant sections first, then perform changes with edit tools, and finally summarize what changed.
No need to ask permission before using tools.
When using a tool, follow the JSON schema very carefully and include ALL required properties.
</toolUseInstructions>
<editDocumentInstructions>
Treat editor content as the source of truth. Never ask for document text that can be accessed with tools.
Only ask a follow-up question when user intent is ambiguous, not when content can be read via tools.
Before you edit an existing document or selection, make sure you already have the relevant content in context or read it with tools.
</editDocumentInstructions>
<outputFormatting>
When you answer a question, or complete a task, format your answer in markdown. Don't use HTML encoding like &lt; or &gt;. If you are including snippets, format them as quotes or, if it is code use markdown code blocks with the appropriate language tag.
</outputFormatting>
`
      },
    ];

    const formattedMessages = chatMessages.map((message, index, array) => this._formatMessage(message, index, array)).filter(Boolean) as OllamaRequestMessage[];
    const messages = initialMessages.concat(formattedMessages);

    const modelInput: OllamaRequest = {
      model: modelName,
      messages: messages,
      stream: true,
      think: true,
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

  private _formatSystemMessage(message: SystemChatMessage, index: number, array: ChatMessage[]): OllamaSystemRequestMessage {
    const contentString = message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
    return ({
      role: "system",
      content: contentString,
    });
  }

  private _formatUserMessage(message: UserChatMessage, index: number, array: ChatMessage[]): OllamaUserRequestMessage {
    const contentString = message.content.reduce((acc, part) => {
      if(part.type === "text") {
        return `${acc}\n${part.text}\n`;
      } else if (part.type === "context") {
        return acc + `<${part.name}>\n${JSON.stringify(part.data, null, 2)}\n</${part.name}>\n`;
      }
      return acc;
    }, "");

    const images: string[] = [];
    if(index === array.length - 1) {
      // If this is the last message in the conversation, we can include any images as part of the user message, which allows us to display them in the UI at the right time during generation. If we included them as separate messages, they would all come through at once at the start of generation, which isn't ideal.
      message.content.forEach(part => {
        if(part.type === "image" && typeof part.data === "string") {
          images.push(part.data);
        }
      });
    }

    return ({
      role: "user",
      content: contentString,
      images: images.length > 0 ? images : undefined,
    });
  }

  private _formatAssistantMessage(message: AssistantChatMessage, index: number, array: ChatMessage[]): OllamaAssistantRequestMessage {
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

    const contentString = message.content.reduce((acc, part) => {
      if(part.type === "text") {
        return `${acc}\n${part.text}\n`;
      } else if (part.type === "context") {
        if(typeof part.data === "string") {
          return acc + part.data;
        } else if ( typeof part.data === "object" && part.data !== null) {
          return acc + JSON.stringify(part.data, null, 2);
        }
        return acc;
      }
      return acc;
    }, "");

    const images: string[] = [];
    if(index === array.length - 1) {
      // If this is the last message in the conversation, we can include any images as part of the assistant message, which allows us to display them in the UI at the right time during generation. If we included them as separate messages, they would all come through at once at the start of generation, which isn't ideal.
      message.content.forEach(part => {
        if(part.type === "image" && typeof part.data === "string") {
          images.push(part.data);
        }
      });
    }

    return ({
      role: "assistant",// Ollama's API requires either content or tool_calls to be present, so if there's no text content we need to include an empty string to satisfy the schema.
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
      default:
        const unknownMessage = message as ChatMessage;
        this._logger.error(`Unknown message role: ${unknownMessage.role} in message at index ${index} in conversation with ${array.length} messages.`);
        return null;
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
