import { AssistantChatMessage, ChatMessage, SystemChatMessage, ToolChatMessage, UserChatMessage } from "../../lib/chat/chat-message.js";
import { ToolSchema } from "../../lib/tools/tool-schema.js";
import { IPlatform } from "../../lib/platform/platform.js";
import { StreamEvent } from "../../lib/platform/stream-event.js";
import { Model } from "../../lib/models/model.js";
import { OllamaStreamChunk, IOllamaStreamReader } from "./ollama-stream-reader.js";
import { LoggerFactory } from "../../lib/logging/logger-factory.js";
import { Logger } from "../../lib/logging/logger.js";
import { OllamaAssistantRequestMessage, OllamaRequest, OllamaRequestMessage, OllamaSystemRequestMessage, OllamaToolRequestMessage, OllamaUserRequestMessage } from "./ollama-request.js";

export class OllamaPlatform implements IPlatform {
  private _logger: Logger;
  private _endpoint: string;
  private _streamReaderFactory: () => IOllamaStreamReader;

  constructor(
    loggerFactory: LoggerFactory,
    endpoint: string,
    streamReaderFactory: () => IOllamaStreamReader) {
      this._endpoint = endpoint;
      this._streamReaderFactory = streamReaderFactory;
      this._logger = loggerFactory("Ollama platform");
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
    const response = await fetch(`${this._endpoint}/api/tags`, {
      method: "GET"
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }
    const data: {models: {name:string}[]} = await response.json();
    return data.models.map(model => model.name);
  }

  private async _fetchModelDetails(modelName: string): Promise<Model> {
    const response = await fetch(`${this._endpoint}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    this._logger.info("Sending request to Ollama API", request);

    // Send the request to Ollama's API
    const response = await fetch(`${this._endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      const streamEvent = this.buildStreamEventFromChunk(chunk);
      this._logger.debug("Received chunk from Ollama API", chunk, "Converted to stream event", streamEvent);
      if(streamEvent) {
        yield streamEvent;
      }
    }
  }

  private buildModelInput(model: Model, chatMessages: ChatMessage[], toolSchemas: ToolSchema[]) {

    // TODO: Adapt the output for tool calls depending on if the model supports tool calls in the message stream, or if they need to be emitted as text and parsed out by the client.

    const ASSISTANT_NAME = "Ollama Assistant";
    const modelName = model.name;
    const KNOWLEDGE_AREA = "copy writing and technical writing, proofreading, grammar correction, and general writing assistance";

    /* TODO: add 'memory' section with relevant info from session memory and user memory, and update it as the conversation goes on.
    e.g
    <userMemory>
    ...
    </userMemory>
    <sessionMemory>
    ...
    </sessionMemory>
    */

    const initialMessages: OllamaRequestMessage[] = [
      {
        role: 'system',
        content: `You are an expert writing assistant, working with a user in their text editor.
When asked for your name, you must respond with "${ASSISTANT_NAME}". When asked about the model you are using, you must state that you are using ${modelName}.
<instructions>
You are a highly sophisticated automated writing agent with expert-level knowledge across ${KNOWLEDGE_AREA}.
The user will ask a question, or ask you to perform a task, and it may require lots of research to answer correctly. There is a selection of tools that let you perform actions or retrieve helpful context to answer the user's question.
Think creatively and explore the workspace in order to complete the task.
</instructions>
<toolUseInstructions>
If the user is requesting a text sample, you can answer it directly without using any tools.
When using a tool, follow the JSON schema very carefully and make sure to include ALL required properties.
No need to ask permission before using a tool.
</toolUseInstructions>
<editFileInstructions>
Before you edit an existing file, make sure you either already have it in the provided context, or read it with the provided tools, so that you can make proper changes.
</editFileInstructions>
<outputFormatting>
When you answer a question, or complete a task, format your answer in markdown. If you are including snippets, format them as quotes or, if it is code, use markdown code blocks with the appropriate language tag.
</outputFormatting>
`
      },
    ];

    // TODO: If the model doesn't support tool calls in the message stream, we can emit them as text with a special format that the client can parse out and convert back into tool calls.

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
      // If this is the last message in the conversation, we can include any images as part of the assistant message, which allows us to display them in the UI at the right time during generation. If we included them as separate messages, they would all come through at once at the start of generation, which isn't ideal.
      message.content.forEach(part => {
        if(part.type === "image" && typeof part.data === "string") {
          images.push(part.data);
        }
      });
    }

    return ({
      role: "assistant",
      content: contentString,
      images: images.length > 0 ? images : undefined,
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

  private buildStreamEventFromChunk(chunk: OllamaStreamChunk): StreamEvent | undefined {
    const text = chunk.message?.content;
    if (typeof text === "string" && text.length > 0) {
      return {
        type: "text_delta",
        text,
      };
    }

    const reasoning = chunk.message?.thinking ?? chunk.thinking;
    if (typeof reasoning === "string" && reasoning.length > 0) {
      return {
        type: "reasoning_delta",
        text: reasoning,
      };
    }

    const toolCall = chunk.message?.tool_calls?.[0];
    const toolName = toolCall?.function?.name;
    if (typeof toolName === "string" && toolName.length > 0) {
      return {
        type: "tool_call",
        tool_call: {
          id: toolCall?.id || `call_${Math.random().toString(32).slice(-8)}`,
          name: toolName,
          arguments: toolCall?.function?.arguments ?? {},
        }
      };
    }

    if (chunk.done) {
      return {
        type: "done",
      };
    }

    return undefined;
  }
}
