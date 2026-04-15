import { IChatHistory } from "../history/chat-history.js";
import { AssistantChatMessage, ChatMessage, ChatMessageContentPart, ErrorChatMessage, ToolCall, ToolChatMessage, UserChatMessage } from "./chat-message.js";
import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";
import { Model } from "../models/model.js";
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
  private _models: Map<string, Model> | null

  constructor(loggerFactory: LoggerFactory, platformService: IPlatformService, history: IChatHistory, toolsService: IToolService) {
    super();
    this._id = `chat_${Date.now()}`;
    this._logger = loggerFactory(`Chat Session ${this._id}`);
    this._platformService = platformService;
    this._history = history;
    this._toolsService = toolsService;
    this._models = null;
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

  async getModel(modelIdentifier: string): Promise<Model | undefined> {
    // Cache the list of models in memory so we don't have to fetch the list of models from the platform every time the user submits a prompt.
    // If the model isn't found in the cache, we throw an error which will be caught and returned as part of the assistant's response, giving feedback to the user about the invalid model identifier.
    if(!this._models) {
      const models = await this._platformService.getModels();
      this._models = new Map(models.map(model => [model.name, model]));
    }
    return this._models.get(modelIdentifier);
  }

  async submitUserPrompt(modelIdentifier: string, prompt: string, context: ChatMessageContext): Promise<void> {

    // When the user submits a prompt, we create a new user message and add it to the history.
    // This message serves as the input to the assistant's response generation.
    
    // Alloy tools to add information to the prompt context, which can then be used by tools when executing. For example, a tool that fetches real-time data could add that data to the prompt context so it can be included in the assistant's response.
    const toolsContext = this._toolsService.addContext();
    Object.assign(context, toolsContext);
    
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
      
      // Get the model details for the selected model identifier, which includes information about which platform to use for generating the response.
      // If the model identifier is invalid, we throw an error which will be caught and returned as part of the assistant's response, giving feedback to the user about the invalid model identifier.
      const model: Model | undefined = await this.getModel(modelIdentifier);
      if(!model) {
        await this._error(`Model not found: ${modelIdentifier}`, modelIdentifier);
        assistantMessage = null;
        continueAgentLoop = false;
        return;
      }

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
    
      //const queuedToolCalls: ToolCall[] = [];
      const toolResults: ToolChatMessage[] = [];
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
            //queuedToolCalls.push(streamEvent.tool_call);
            
            const toolChatMessage = await this._runToolAndGetResultMessage(modelIdentifier, streamEvent.tool_call);
            toolResults.push(toolChatMessage);

            break;
          case "error":
            // If there's an error event, we can add an error message to the history to give feedback to the user about the issue.
            const errorMessage = await this._error(`Error generating response: ${streamEvent.error instanceof Error ? streamEvent.error.message : String(streamEvent.error)}`, modelIdentifier);
            // TODO: could we just return here?
            this.dispatchEvent(new ChatMessageEvent(errorMessage));
            assistantMessage = null;
            continueAgentLoop = false;
            break;
          case "done":
            this._logger.debug("Assistant finished generating response", assistantMessage);
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

      // Safety net: if the stream ended without a 'done' event (e.g. Ollama sends tool_calls
      // and done:true in the same chunk, and only the tool_call event was emitted), finalize
      // the assistant message here so it is included in contextMessages before tool results.
      if (assistantMessage) {
        this._logger.warn("Stream ended without 'done' event. Finalizing assistant message.");
        await this._history.addMessage(assistantMessage);
        contextMessages.push(assistantMessage);
        assistantMessage = null;
        this._activeChatMessage = null;
      }

      if(toolResults.length == 0) {
        continueAgentLoop = false;
      } else{
        // If there are tool results, we feed them back into the next turn of the assistant's response generation to allow it to react to the tool results in real time and adjust its response accordingly.
        // This allows for more dynamic and interactive conversations where the assistant can use tools, see the results, and then decide what to do next based on those results, rather than having to wait for the next user prompt to react to tool results.
        for(const toolResult of toolResults) {
          this._logger.debug("Tool result", toolResult);
          await this._history.addMessage(toolResult);
          contextMessages.push(toolResult);
        }
      }


      /*
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
      */
    }

    // Prompt complete, we can finalize the conversation turn here if needed, or perform any cleanup or finalization tasks.
  }

  private async _error(messageText: string, modelIdentifier:string): Promise<ErrorChatMessage> {
    const errorMessage: ErrorChatMessage = {
      model: modelIdentifier,
      role: "error",
      content: [{ type: "text", text: messageText }]
    };
    await this._history.addMessage(errorMessage);
    this._activeChatMessage = null;
    return errorMessage;
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
  /*
  private async _runToolsAndGetResultMessages(modelIdentifier: string, queued: ToolCall[]): Promise<ToolChatMessage[]> {
    const toolMessages: ToolChatMessage[] = [];
    for (const toolCall of queued) {
      const message = await this._runToolAndGetResultMessage(modelIdentifier, toolCall);
      toolMessages.push(message);
    }
    return toolMessages;
  }
  */

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
        content: [{ type: "text", text: JSON.stringify({ ok: true, tool: toolName, result }) }],
        tool_call_id: toolCall.id
      };
    } catch (error) {
      this._logger.error(`Error running tool ${toolName}`, error);
      return {
        model: modelIdentifier,
        role: "tool",
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


