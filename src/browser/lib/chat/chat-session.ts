import { IChatHistory } from "../history/chat-history.js";
import { AssistantChatMessage, ChatMessage, ChatMessageContentPart, ErrorChatMessage, SystemChatMessage, ToolCall, ToolChatMessage, UserChatMessage } from "./chat-message.js";
import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";
import { Model } from "../models/model.js";
import { IPlatformService } from "../platform/platform-service.js";
import { IToolService } from "../tools/tool-service.js";
import { JSONValue } from "../JSONValue.js";
import { Agent } from "../agent/agent.js";
import { filterToolSchemasByModel } from "../tools/tools-registry.js";
import { BOUNDARY_PROMPT_ADDENDUM, PromptBuilder } from "../platform/system-prompt.js";
import { PromptStream } from "./prompt-stream.js";

export interface IChatSession {
  submitUserPrompt(modelIdentifier: string, prompt: string, options?: Record<string, unknown>): PromptStream;
  getActiveAssistantChatMessage(): ChatMessage | null;
  getMessages(maxMessages?: number): Promise<ChatMessage[]>;
  clearHistory(): Promise<void>;
}

export class ChatSession implements IChatSession {

  // The platform that this chat session is using to generate responses. The platform is responsible for converting from our internal message
  // format and user message context into the format expected by the model endpoint, sending the request to the model endpoint, and
  // streaming the response back as a series of events (text deltas, tool calls, etc).
  private _platformService: IPlatformService;

  // The chat history, which is responsible for storing and managing the messages in the conversation. LLMs are stateless, so we need to keep track of the conversation history ourselves and feed it into the model with each turn of the conversation to provide context.
  // Chat history only responsible for storage, essentially a ring buffer that keeps the most recent N messages. Its used by the ChatSession to store messages, and the UI to display the conversation to the user.
  private _history: IChatHistory;

  // The tools available to the assistant. Tools are external functions or APIs that the model can call to perform specific tasks or retrieve information.
  // By providing tools, we can enable the assistant to do things beyond just generating text, such as fetching real-time data, performing calculations, or interacting with other services.
  private _toolsService: IToolService;

  private _logger: Logger;

  // A unique identifier for this chat session, which can be useful for logging and debugging to differentiate between multiple concurrent chat sessions.
  private _id: string;

  // The message that the assistant is currently generating. As the assistant generates a response, we can update this message with the partial content and any tool calls that are emitted along the way, allowing us to show a live-updating response in the UI.
  private _activeAssistantChatMessage: AssistantChatMessage | null = null;
  private _models: Map<string, Model> | null;
  private _agent: Agent;

  constructor(loggerFactory: LoggerFactory, platformService: IPlatformService, history: IChatHistory, toolsService: IToolService, agent: Agent) {
    this._id = `chat_${Date.now()}`;
    this._logger = loggerFactory(`Chat Session ${this._id}`);
    this._platformService = platformService;
    this._history = history;
    this._toolsService = toolsService;
    this._models = null;
    this._agent = agent;
  }

  async clearHistory(): Promise<void> {
    await this._history.clearHistory();
  }

  getActiveAssistantChatMessage(): AssistantChatMessage | null {
    return this._activeAssistantChatMessage;
  }

  async getMessages(maxMessages?: number): Promise<ChatMessage[]> {
    return this._history.getMessages(maxMessages);
  }

  async getModel(modelIdentifier: string): Promise<Model | undefined> {
    // Cache the list of models in memory so we don't have to fetch the list of models from the platform every time the user submits a prompt.
    // If the model isn't found in the cache, we throw an error which will be caught and returned as part of the assistant's response, giving feedback to the user about the invalid model identifier.
    if(!this._models) {
      const models = await this._platformService.getModels();
      this._models = new Map(models.map(model => [model.name, model]));
    }
    return this._models.get(modelIdentifier);
  }

  submitUserPrompt(modelIdentifier: string, prompt: string, _options?: Record<string, unknown>): PromptStream {
    const stream = new PromptStream();
    void this._runAgentLoop(modelIdentifier, prompt, stream);
    return stream;
  }

  private async _runAgentLoop(modelIdentifier: string, prompt: string, stream: PromptStream): Promise<void> {
    try {
      // When the user submits a prompt, we create a new user message and add it to the history.
      // This message serves as the input to the assistant's response generation.

      const userChatMessage = this._buildUserChatMessage(modelIdentifier, prompt);

      await this._history.addMessage(userChatMessage);
      stream._notify(userChatMessage);

      // The agent loop
      // - Start with the historical messages including the user's new message as the input
      // - Stream the assistant's response, collecting any tool calls that are emitted along the way
      // - If there are tool calls, run them and add their results to the history,
      // - then feed the most recent result back into the next assistant turn
      const contextMessages: ChatMessage[] = await this._history.getMessages(10);

      let assistantMessage: AssistantChatMessage | null = null;
      let continueAgentLoop = true;
      let iterationCount = 0;
      const MAX_ITERATIONS = 10;
      while (continueAgentLoop) {
        if (iterationCount++ >= MAX_ITERATIONS) {
          this._logger.warn("Agent loop hit iteration limit, stopping.");
          break;
        }

        // Get the model details for the selected model identifier, which includes information about which platform to use for generating the response.
        // If the model identifier is invalid, we throw an error which will be caught and returned as part of the assistant's response, giving feedback to the user about the invalid model identifier.
        const model: Model | undefined = await this.getModel(modelIdentifier);
        if(!model) {
          await this._error(`Model not found: ${modelIdentifier}`, modelIdentifier);
          assistantMessage = null;
          break;
        }

        // Build the filtered tool list: first scope to the agent's allow-list, then strip any tools the model doesn't support.
        const allSchemas = this._toolsService.listToolSchemas();
        const agentSchemas = this._agent.filterTools(allSchemas);
        const modelSchemas = filterToolSchemasByModel(agentSchemas, model);

        // Build the system prompt from the agent definition and prepend it as the first message in the context.
        // The agent receives the final filtered tool list so it can tailor its instructions to only reference
        // tools that are actually available to the model.
        const promptBuilder = new PromptBuilder(this._agent.buildSystemPrompt(modelSchemas));
        for (const schema of modelSchemas) {
          if (schema.instructions) {
            promptBuilder.withInstruction(schema.function.name, schema.instructions);
          }
        }
        // Only use content boundary markers when no tools are available — with tools the model
        // should edit documents directly via tool calls, not by producing text for the user to paste.
        if (modelSchemas.length === 0) {
          promptBuilder.withInstruction("contentBoundary", BOUNDARY_PROMPT_ADDENDUM);
        }
        const systemPrompt = promptBuilder.build();
        const systemMessage: SystemChatMessage = { role: "system", model: modelIdentifier, content: [{ type: "text", text: systemPrompt }] };

        // Inject a fresh context snapshot as the first user message every iteration so the model
        // always sees current state (e.g. which document is focused) regardless of what was true
        // when the original user message was written.
        const contextContent: ChatMessageContentPart[] = [];
        const toolsContext = this._toolsService.addContext();

        for (const [key, value] of Object.entries(toolsContext)) {
          contextContent.push({
            type: "context",
            name: key,
            data: value
          });
        }

        const freshContextMessage: UserChatMessage = {
          role: "user",
          model: modelIdentifier,
          content: contextContent
        };

        // The final message list we feed into the model includes the system prompt with instructions, followed by a fresh context snapshot,
        // followed by the recent conversation history (including the user's new message).
        const messagesWithSystem: ChatMessage[] = [systemMessage, freshContextMessage, ...contextMessages];

        // Select the relevant platform based on the model details, and use it to convert from our internal message format and user message context into the format expected by the model endpoint.
        // Then send the request to the model endpoint and stream the response, collecting any tool calls that are emitted along the way.
        const streamEvents = this._platformService.generate(model, messagesWithSystem, modelSchemas, this._agent.getGenerateOptions?.());

        // Normally this should always be null at this point since the assistant should emit a 'done' event when it finishes its response, setting the active message to null.
        // This likely means that the model emitted a new response before emitting a 'done'event for the previous response.
        // The previous response will be discarded and replaced with the new response, which may lead to loss of content or tool calls from the previous response.
        // To avoid this, ensure that your platform/model emits a 'done' event after finishing its response and before starting to emit a new response.
        if (assistantMessage) {
          this._logger.warn("Received new assistant response while another response is still active. This previous response will be discarded", assistantMessage);
        }

        assistantMessage = {
          model: modelIdentifier,
          role: "assistant",
          content: []
        };
        this._activeAssistantChatMessage = assistantMessage;
        stream._notify(assistantMessage);

        const toolResultsMessages: ToolChatMessage[] = [];
        let taskCompleted = false;
        let isThinking = false;
        let assistantMessageTextContent = "";
        for await (const streamEvent of streamEvents) {

          this._logger.debug("Received stream event", streamEvent);

          if(!assistantMessage) {
            continue;
          }

          switch (streamEvent.type) {
            case "text_delta":
              assistantMessageTextContent += streamEvent.text;
              assistantMessage.content = [{ type: "text", text: assistantMessageTextContent }];
              stream._forwardStreamEvent(streamEvent);
              break;
            case "reasoning_delta":
              if(!isThinking) {
                isThinking = true;
              }
              assistantMessage.thinking = (assistantMessage.thinking || "") + streamEvent.text;
              stream._forwardStreamEvent(streamEvent);
              break;
            case "tool_call": {
              assistantMessage.tool_calls = assistantMessage.tool_calls || [];
              assistantMessage.tool_calls.push(streamEvent.tool_call);
              if (streamEvent.tool_call.name === "task_complete") {
                taskCompleted = true;
              }
              const toolChatMessage = await this._runToolAndGetResultMessage(modelIdentifier, streamEvent.tool_call);
              toolResultsMessages.push(toolChatMessage);
              break;
            }
            case "error": {
              // If there's an error event, we can add an error message to the history to give feedback to the user about the issue.
              const errorMessage = await this._error(`Error generating response: ${streamEvent.error instanceof Error ? streamEvent.error.message : String(streamEvent.error)}`, modelIdentifier);
              // TODO: could we just return here?
              stream._notify(errorMessage);
              assistantMessage = null;
              continueAgentLoop = false;
              break;
            }
            case "done":
              this._logger.debug("Assistant finished generating response", assistantMessage);
              await this._history.addMessage(assistantMessage);
              contextMessages.push(assistantMessage);
              stream._notify(assistantMessage);
              assistantMessage = null;
              this._activeAssistantChatMessage = null;
              break;
          }
        }

        if (assistantMessage) {
          this._logger.warn("Stream ended without 'done' event. Finalizing assistant message.");
          await this._history.addMessage(assistantMessage);
          contextMessages.push(assistantMessage);
          stream._notify(assistantMessage);
          assistantMessage = null;
          this._activeAssistantChatMessage = null;
        }

        if (taskCompleted) {
          for (const toolResult of toolResultsMessages) {
            await this._history.addMessage(toolResult);
          }
          continueAgentLoop = false;
        } else if (toolResultsMessages.length === 0) {
          // Model produced no tool calls. Inject a continuation prompt so it knows to call
          // task_complete if it has finished, or continue with the next tool if not.
          const continuation = this._agent.buildContinuationPrompt?.();
          if (continuation) {
            const continuationMsg: UserChatMessage = {
              role: "user",
              model: modelIdentifier,
              content: [{ type: "text", text: continuation }]
            };
            await this._history.addMessage(continuationMsg);
            contextMessages.push(continuationMsg);
          } else {
            continueAgentLoop = false;
          }
        } else {
          // Feed tool results back for the next turn. If task_complete was not called, the model
          // will continue making tool calls in the next iteration.
          for (const toolResult of toolResultsMessages) {
            this._logger.debug("Tool result", toolResult);
            await this._history.addMessage(toolResult);
            contextMessages.push(toolResult);
          }
        }
      }

      stream._complete();
    } catch (error) {
      stream._fail(error);
    }
  }

  private async _error(messageText: string, modelIdentifier:string): Promise<ErrorChatMessage> {
    const errorMessage: ErrorChatMessage = {
      model: modelIdentifier,
      role: "error",
      content: [{ type: "text", text: messageText }]
    };
    await this._history.addMessage(errorMessage);
    this._activeAssistantChatMessage = null;
    return errorMessage;
  }

  private _buildUserChatMessage(modelIdentifier: string, prompt: string): UserChatMessage {

    const content: ChatMessageContentPart[] = [
      {
        type: "text",
        text: prompt
      }
    ];

    return {
      model: modelIdentifier,
      role: "user",
      content: content
    };
  }

  // Runs the provided tool calls sequentially, returning their results as chat messages.
  // If any tool call fails, the error is caught and returned as the tool call result,
  // allowing the assistant to receive feedback about tool failures and adjust its behavior accordingly.
  private async _runToolAndGetResultMessage(modelIdentifier: string, toolCall: ToolCall): Promise<ToolChatMessage> {
    const toolName = toolCall.name
    const args = this._parseToolArguments(toolCall.arguments);
    try {
      const result = await this._runTool(toolName, args);
      return {
        model: modelIdentifier,
        role: "tool",
        success: true,
        content: [{ type: "text", text: JSON.stringify({
          ok: true,
          tool: toolName,
          result
        }) }],
        tool_call_id: toolCall.id
      };
    } catch (error) {
      this._logger.error(`Error running tool ${toolName}`, error);
      return {
        model: modelIdentifier,
        role: "tool",
        success: false,
        content: [{ type: "text", text: JSON.stringify({
          ok: false,
          tool: toolName,
          error: (error as Error | null)?.message || `Tool failed: ${toolName}`
        }) }],
        tool_call_id: toolCall.id
      };
    }
  }

  private _parseToolArguments(raw: unknown): Record<string, unknown> {
    if (!raw) {
      return {};
    }

    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      } catch {
        return { text: raw };
      }
    }

    return typeof raw === "object" ? raw as Record<string, unknown> : {};
  }

  private async _runTool(name: string, args: Record<string, unknown>): Promise<JSONValue> {
    const tool = this._toolsService.findTool(name);
    if (!tool) {
      // If the tool isn't found, we throw an error which will be caught and returned as the tool call result.
      // This way the assistant can get feedback about missing tools and adjust its behavior accordingly, rather than silently failing.
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.execute(args);
  }
}
