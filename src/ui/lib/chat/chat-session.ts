import { IChatHistory } from "../history/chat-history.js";
import { AssistantChatMessage, ChatMessage, ChatMessageContentPart, ToolCall, ToolChatMessage, UserChatMessage } from "./chat-message.js";
import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";
import { Model } from "../models/model.js";
import { IModelService } from "../models/model-service.js";
import { IPlatformService } from "../platform/platform-service.js";
import { IToolService } from "../tools/tool-service.js";
import { ChatMessageEvent } from "../events.js";
import { ChatMessageContext } from "./chat-message-context.js";

export interface IChatSession extends EventTarget {
  submitUserPrompt(modelIdentifier: string, prompt: string, context: ChatMessageContext): Promise<void>;
  getActiveChatMessage(): ChatMessage | null;
  getMessages(maxMessages?: number): Promise<ChatMessage[]>;
  clearHistory(): Promise<void>;
}

export class ChatSession extends EventTarget implements IChatSession {

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
  private _activeChatMessage: ChatMessage | null = null;
  private _modelService: IModelService;

  constructor(loggerFactory: LoggerFactory, platformService: IPlatformService, history: IChatHistory, toolsService: IToolService, modelService: IModelService) {
    super();
    this._id = `chat_${Date.now()}`;
    this._logger = loggerFactory(`Chat Session ${this._id}`);
    this._platformService = platformService;
    this._history = history;
    this._toolsService = toolsService;
    this._modelService = modelService;
  }

  async clearHistory(): Promise<void> {
    await this._history.clearHistory();
  }

  getActiveChatMessage(): ChatMessage | null {
    return this._activeChatMessage;
  }

  async getMessages(maxMessages?: number): Promise<ChatMessage[]> {
    return this._history.getMessages(maxMessages);
  }

  async submitUserPrompt(modelIdentifier: string, prompt: string, context: ChatMessageContext): Promise<void> {

    // When the user submits a prompt, we create a new user message and add it to the history.
    // This message serves as the input to the assistant's response generation.
    const userChatMessage = this._buildUserChatMessage(modelIdentifier, prompt, context);
    await this._history.addMessage(userChatMessage);
    this.dispatchEvent(new ChatMessageEvent(userChatMessage));

    // The agent loop
    // - Start with the historical messages including the user's new message as the input
    // - Stream the assistant's response, collecting any tool calls that are emitted along the way
    // - If there are tool calls, run them and add their results to the history,
    // - then feed the most recent result back into the next assistant turn
    const contextMessages: ChatMessage[] = await this._history.getMessages(10);

    let assistantMessage: AssistantChatMessage | null = null;
    let continueAgentLoop = true;
    while (continueAgentLoop) {
      
      // TODO: Handle missing or invalid model identifier more gracefully.
      const model: Model = this._modelService.getModel(modelIdentifier);

      // Select the relevant platform based on the model details, and use it to convert from our internal message format and user message context into the format expected by the model endpoint.
      // Then send the request to the model endpoint and stream the response, collecting any tool calls that are emitted along the way.
      const streamEvents = this._platformService.generate(model, contextMessages, this._toolsService.listToolSchemas());

      if (assistantMessage) {
        this._logger.warn("Received new assistant response while another response is still active. This likely means that the model emitted a new response before emitting a 'done' event for the previous response. The previous response will be discarded and replaced with the new response, which may lead to loss of content or tool calls from the previous response. To avoid this, ensure that your model emits a 'done' event after finishing its response and before starting to emit a new response.");
        await this._history.addMessage(assistantMessage);
      }

      assistantMessage = {
        model: modelIdentifier,
        role: "assistant",
        content: []
      };
      this._activeChatMessage = assistantMessage;
    
      const queuedToolCalls: ToolCall[] = [];
      let isThinking = false;
      for await (const streamEvent of streamEvents) {
        this._logger.debug("Received stream event", streamEvent);

        if(!assistantMessage) {
          continue;
        }

        switch (streamEvent.type) {
          case "text_delta":
            assistantMessage.content.push({
              type: "text",
              text: streamEvent.text
            });
            this.dispatchEvent(new ChatMessageEvent(assistantMessage));
            break;
          case "reasoning_delta":
            if(!isThinking) {
              isThinking = true;
            }
            assistantMessage.thinking = (assistantMessage.thinking || "") + streamEvent.text;
            this.dispatchEvent(new ChatMessageEvent(assistantMessage));
            break;
          case "tool_call":
            assistantMessage.tool_calls = assistantMessage.tool_calls || [];
            assistantMessage.tool_calls.push(streamEvent.tool_call);
            queuedToolCalls.push(streamEvent.tool_call);
            break;
          case "error":
            // If there's an error event, we can add an error message to the history to give feedback to the user about the issue.
            const errorMessage: ChatMessage = {
              model: modelIdentifier,
              role: "system",
              content: [{ type: "text", text: `Error generating response: ${streamEvent.error instanceof Error ? streamEvent.error.message : String(streamEvent.error)}` }]
            };
            await this._history.addMessage(errorMessage);
            assistantMessage = null;
            this._activeChatMessage = null;
            // We set continueAgentLoop to false here to stop the loop if there's an error,
            // but depending on the desired behavior, we could also choose to continue the loop and allow the assistant to try generating another response,
            // or to skip the rest of this turn and wait for the next user prompt.
            continueAgentLoop = false;
            break;
          case "done":
            await this._history.addMessage(assistantMessage);
            contextMessages.push(assistantMessage);
            assistantMessage = null;
            this._activeChatMessage = null;
            break;
        }
        if(assistantMessage){
          this.dispatchEvent(new ChatMessageEvent(assistantMessage));
        }
      }

      const toolResultMessages = await this._runToolsAndGetResultMessages(modelIdentifier, queuedToolCalls);
      if (toolResultMessages.length === 0) {
        // If there are no tool calls, we're done with this turn of the conversation and can wait for the next user prompt.
        // TODO: Experiment with additional logic to keep the conversation going or hand off to other agents.
        //   in vscode copilot, they check for a specific "complete" tool call, if that hasn't been called, the assistant is prompted to continue and potentially emit more tool calls, until it eventually emits the "complete" tool call to end the conversation.
        //   We could implement something similar if we want more dynamic conversations that can continue until a certain condition is met, rather than always ending after one round of tool calls.
        // Another interesting option is to allow the agent to 'hand off' to another agent specialized in a different area.
        // For example, if the assistant detects that the user's prompt is asking for a code-related task, it could choose to hand off the conversation to a coding assistant agent that has more specialized tools and knowledge for handling code-related queries.
        // This would involve some logic to determine when to hand off and which agent to hand off to, as well as a way to transfer the conversation context between agents.
        //
        // This is very much an open area for experimentation, and there are lots of different ways we could implement it depending on how we want the user experience to work and how much control we want to give the assistant over the conversation flow.
        // Think  about:
        // - When do we want to allow the assistant to keep the conversation going vs. waiting for the next user prompt?
        // - Do we want to implement a specific "complete" tool call that the assistant has to emit to end the conversation, or do we want to allow it to end more organically when it runs out of things to say or tools to call?
        // - Do we want to allow the assistant to hand off to other agents, and if so, how do we want to implement that?
        // - Allowing the assistant to switch between models itself could also be interesting, either by emitting a specific tool call to switch models, or by implementing some logic in the ChatSession to switch models based on the conversation context or the assistant's behavior.
        continueAgentLoop = false;
      }

      for (const toolResultMessage of toolResultMessages) {
        await this._history.addMessage(toolResultMessage);
        contextMessages.push(toolResultMessage);
      }
    }
  }

  private _buildUserChatMessage(modelIdentifier: string, prompt: string, context: ChatMessageContext): UserChatMessage {

    const content: ChatMessageContentPart[] = [
      {
        type: "text",
        text: prompt
      }
    ];

    for (const [key, value] of Object.entries(context)) {
      content.push({
        type: "context",
        name: key,
        data: value
      });
    }

    return {
      model: modelIdentifier,
      role: "user",
      content: content
    };
  }

  // Runs the provided tool calls sequentially, returning their results as chat messages.
  // If any tool call fails, the error is caught and returned as the tool call result,
  // allowing the assistant to receive feedback about tool failures and adjust its behavior accordingly.
  private async _runToolsAndGetResultMessages(modelIdentifier: string, queued: ToolCall[]): Promise<ChatMessage[]> {
    const toolMessages: ChatMessage[] = [];
    for (const toolCall of queued) {
      const toolName = toolCall.name
      if (!toolName) {
        continue;
      }
      const args = this._parseToolArguments(toolCall.arguments);

      try {
        const result = await this._runTool(toolName, args);
        const toolMessage: ToolChatMessage = {
          model: modelIdentifier,
          role: "tool",
          content: [{ type: "text", text: JSON.stringify({ ok: true, tool: toolName, result }) }],
          tool_call_id: toolCall.id
        };
        toolMessages.push(toolMessage);
      } catch (error) {
        this._logger.error(`Error running tool ${toolName}`, error);
        toolMessages.push({
          model: modelIdentifier,
          role: "tool",
          content: [{ type: "text", text: JSON.stringify({
            ok: false,
            tool: toolName,
            error: (error as Error | null)?.message || `Tool failed: ${toolName}`
          }) }],
          tool_call_id: toolCall.id
        });
      }
    }

    return toolMessages;
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

  private async _runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this._toolsService.findTool(name);
    if (!tool) {
      // If the tool isn't found, we throw an error which will be caught and returned as the tool call result.
      // This way the assistant can get feedback about missing tools and adjust its behavior accordingly, rather than silently failing.
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.execute(args);
  }
}


