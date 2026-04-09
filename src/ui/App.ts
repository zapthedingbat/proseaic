import { BrowserChatHistory } from "./lib/history/browser-chat-history.js";
import { ChatMessageContext } from "./lib/chat/chat-message-context.js";
import { ChatSession } from "./lib/chat/chat-session.js";
import { ComponentInstanceResolver } from "./lib/component-instance-resolver.js";
import { ConsoleLogger } from "./lib/logging/console-logger.js";
import { CountLettersTool } from "./tools/count-letters.js";
import { Logger } from "./lib/logging/logger.js";
import { LoggerFactory } from "./lib/logging/logger-factory.js";
import { ModelRegistry } from "./lib/models/model-registry.js";
import { OllamaPlatform } from "./platform/ollama/ollama-platform.js";
import { OllamaStreamReader } from "./platform/ollama/ollama-stream-reader.js";
import { PlatformRegistry } from "./lib/platform/platform-registry.js";
import { SubmitPromptEvent } from "./lib/events.js";
import { ToolRegistry } from "./lib/tools/tools-registry.js";

// UI Components
import { TextEditor } from "./components/text-editor.js";
import { ChatPanel } from "./components/chat-panel.js";

// Tools
import { ReplaceSelectionTool } from "./tools/replace-selection.js";
import { TaskCompleteTool } from "./tools/complete.js";
import { IPlatform } from "./lib/platform/platform.js";

type AppOptions = {
  global: typeof globalThis, 
  logger: Logger;
  componentInstanceResolver: ComponentInstanceResolver,
  chatSession: ChatSession;
}

export class App {

  private _global: typeof globalThis;
  private _logger: Logger;
  private _chatSession: ChatSession;
  private _componentInstanceResolver: ComponentInstanceResolver;

  // UI Components
  private _chatPanel?: ChatPanel;
  private _textEditor?: TextEditor;

  // The constructor is private to enforce the use of the async create() method for initialization.
  private constructor(options: AppOptions) {
    // Useful for stubbing out dependencies in tests, but in practice these will typically be created and injected by the static create() method.
    this._global = options.global;
    this._logger = options.logger; 
    this._logger.info("Created", options);
    this._chatSession = options.chatSession;
    this._componentInstanceResolver = options.componentInstanceResolver;
  }

  // The create method initializes the App instance and performs asynchronous setup.
  static async create(options?: AppOptions): Promise<App> {

    // Create the app instance. The constructor is private, so this is the only way to create an App, because we want to ensure that the async initialization logic in initialize() is always run.
    const app = new App(options || await this.createDefaultAppOptions());

    // Call the async initialize method to set up the app. This allows us to perform any necessary asynchronous operations during initialization, such as loading data or setting up connections.
    await app.initialize();

    // Return the fully initialized app instance.
    return app;
  }

  private static async createDefaultAppOptions(): Promise<AppOptions> {

    const { document, customElements: customElementsRegistry, fetch } = globalThis;
    const loggerFactory: LoggerFactory = (componentName: string) => new ConsoleLogger(componentName);
    const logger = loggerFactory("App");

    const componentInstanceResolver = new ComponentInstanceResolver(document, customElementsRegistry, loggerFactory);

    logger.info("registering platforms");
    const platformRegistry = new PlatformRegistry(loggerFactory);
    const platforms: IPlatform[] = [
      new OllamaPlatform(loggerFactory, "", () => new OllamaStreamReader())
    ];
    platformRegistry.registerMany(platforms);

    const history = new BrowserChatHistory("chat_history");
    const modelRegistry = new ModelRegistry();
    
    // TODO: Defer this until after the app is initialized, and show some kind of loading state in the UI until the models are loaded.
    logger.info("registering models");
    const models = await platformRegistry.getModels();
    modelRegistry.registerMany(models);
    
    logger.info("registering tools");
    const toolRegistry = new ToolRegistry();
    
    logger.info("setting models on chat panel", models);
    const chatPanel = componentInstanceResolver.resolve(ChatPanel, "chat-panel");
    chatPanel.setModels(models.map(model => ({ name: model.name })));

    const textEditor = componentInstanceResolver.resolve(TextEditor, "text-editor");

    toolRegistry.registerMany([
      new CountLettersTool(),
      new TaskCompleteTool(loggerFactory),
      new ReplaceSelectionTool(textEditor)
    ]);

    // Create the chat session, which is the main interface for the UI to interact with the underlying platform and tools.
    // The chat session is responsible for managing the state of the current chat, submitting user prompts to the platform, and invoking tools as needed.
    // It is injected with the platform registry, tool registry, and model registry so that it can perform these functions.
    logger.info("creating chat session");
    const chatSession = new ChatSession(
      loggerFactory,
      platformRegistry,
      history,
      toolRegistry,
      modelRegistry
    );

    return {
      global: globalThis,
      componentInstanceResolver,
      logger,
      chatSession,
    };
  }

  // The initialize method performs the actual setup of the app, including loading data and wiring up components. It is called from the static create() method after the App instance is created.
  private async initialize(): Promise<void> {

    this._logger.info("Initializing");

    this._chatPanel = this._componentInstanceResolver.resolve(ChatPanel, "chat-panel");
    this._chatPanel.addEventListener("submit-prompt", this._handleChatPanelSubmitPrompt);
    this._chatPanel.addEventListener("clear-history", this._handleChatPanelClearHistory);

    this._textEditor = this._componentInstanceResolver.resolve(TextEditor, "text-editor");

    this._chatSession.addEventListener("message", this._updateChatPanel);

    // Load any required state and update the UI to reflect that state.
    // For example, we might want to load the chat history and display it in the chat panel.
    this._updateChatPanel();
  }

  private _updateChatPanel = async () => {
    if(!this._chatPanel){
      this._logger.error("Chat panel not initialized");
      return;
    }
    const messages = await this._chatSession.getMessages();
    this._chatPanel.setHistory(messages);
    this._chatPanel.setActive(this._chatSession.getActiveChatMessage());
  }

  private _handleChatPanelSubmitPrompt = (event: Event): void => {
    const submitPromptEvent = event as SubmitPromptEvent;
    this._logger.info("Received prompt", submitPromptEvent.detail.promptText);

    // Maybe we do this here, or maybe in the ChatSession, but either way we need to get that info from the TextEditor component and include it in the context that we pass to the ChatSession when submitting the prompt.
    const selectedText = this._textEditor?.getSelection().text || null;
    const documentOutline = this._textEditor?.getDocumentOutline() || [];
    //const documentMarkdown = this._textEditor?.getDocumentMarkdown() || "";

    const modelIdentifier = this._chatPanel?.model;
    const promptText = submitPromptEvent.detail.promptText;
    if (!modelIdentifier) {
      this._logger.error("No model selected");
      return;
    }

    // Build up the context object to pass to the ChatSession when submitting the prompt.
    // This will include any relevant information from the TextEditor, such as the selected text and document outline, which can then be used by tools when executing.
    const context: ChatMessageContext = {}

    if(selectedText){
      context.selectedText = selectedText;
    }

    if(documentOutline.length > 0){
      context.documentOutline = documentOutline;
    }

    this._chatSession.submitUserPrompt(modelIdentifier, promptText, context);
  }

  private _handleChatPanelClearHistory = (event: Event): void => {
    this._logger.info("Clearing chat history");
    this._chatSession.clearHistory();
  }
}
