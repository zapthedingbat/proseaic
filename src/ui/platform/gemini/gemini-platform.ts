
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
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return models;
  }

  async *generate(model: Model, chatMessages: ChatMessage[], tools: ToolSchema[]): AsyncIterable<StreamEvent> {
    const request = this._buildModelInput(chatMessages, tools);

    this._logger.debug("Sending request to Gemini API", request);

    const url = this._urlResolver.resolve(`/v1beta/models/${model.name}:streamGenerateContent`);
    url.searchParams.set("key", this._getApiKey());
    url.searchParams.set("alt", "sse");

    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

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

  private _buildModelInput(chatMessages: ChatMessage[], toolSchemas: ToolSchema[]): GeminiRequest {
    const KNOWLEDGE_AREA = "copy writing and technical writing, proofreading, grammar correction, and general writing assistance";
    const systemText = `You are an expert writing assistant, working with a user in their text editor.
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
</outputFormatting>`;

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
