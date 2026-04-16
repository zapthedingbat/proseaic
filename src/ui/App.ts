import { BrowserChatHistory } from "./lib/history/browser-chat-history.js";
import { ChatMessageContext } from "./lib/chat/chat-message-context.js";
import { ChatSession } from "./lib/chat/chat-session.js";
import { ComponentInstanceResolver } from "./lib/ui/component-instance-resolver.js";
import { ConsoleLogger } from "./lib/logging/console-logger.js";
import { DocumentManager, IDocumentService } from "./lib/document/document-manager.js";
import { FileSystemDocumentStore } from "./lib/document/file-system-document-store.js";
import { IChatStream } from "./lib/platform/chat-stream.js";
import { IPlatformService } from "./lib/platform/platform-service.js";
import { IToolService } from "./lib/tools/tool-service.js";
import { LocalStorageDocumentStore } from "./lib/document/local-storage-document-store.js";
import { Logger } from "./lib/logging/logger.js";
import { LoggerFactory } from "./lib/logging/logger-factory.js";
import { PlatformRegistry } from "./lib/platform/platform-registry.js";
import { SubmitPromptEvent } from "./lib/events.js";
import { TaskCompleteTool } from "./tools/task-complete.js";
import { TEMPLATES } from "./templates.js";
import { ToolRegistry } from "./lib/tools/tools-registry.js";

// Platforms
import { AnthropicPlatform } from "./platform/anthropic/anthropic-platform.js";
import { AnthropicStreamReader } from "./platform/anthropic/anthropic-stream-reader.js";
import { GeminiPlatform } from "./platform/gemini/gemini-platform.js";
import { GeminiStreamReader } from "./platform/gemini/gemini-stream-reader.js";
import { MistralPlatform } from "./platform/mistral/mistral-platform.js";
import { MistralStreamReader } from "./platform/mistral/mistral-stream-reader.js";
import { OllamaPlatform } from "./platform/ollama/ollama-platform.js";
import { OllamaStreamReader } from "./platform/ollama/ollama-stream-reader.js";
import { OpenAIPlatform } from "./platform/openai/openai-platform.js";
import { OpenAIStreamReader } from "./platform/openai/openai-stream-reader.js";

// UI Components
import { MarkdownEditor } from "./components/markdown-editor.js";
import { ChatPanel } from "./components/chat-panel.js";
import { DocumentPanel } from "./components/document-panel.js";
import { DocumentOutlinePanel } from "./components/outline-panel.js";
import { SettingsPanel } from "./components/settings-panel.js";

// Tools
import { ReplaceSelectionTool } from "./tools/replace-selection.js";
import { ReadDocumentOutlineTool } from "./tools/read-document-outline.js";
import { ReadDocumentSectionTool } from "./tools/read-document-section.js";
import { RemoveDocumentSectionTool } from "./tools/remove-document-section.js";
import { InsertDocumentSectionTool } from "./tools/insert-document-section.js";
import { ReplaceDocumentSectionTool } from "./tools/replace-document-section.js";
import { MoveDocumentSectionTool } from "./tools/move-document-section.js";

type AppOptions = {
  documentService: IDocumentService;
  chatStream: IChatStream;
  global: typeof globalThis,
  logger: Logger;
  componentInstanceResolver: ComponentInstanceResolver,
  chatSession: ChatSession;
  platformService: IPlatformService;
  toolService: IToolService;
}

export class App {

  private _global: typeof globalThis;
  private _logger: Logger;
  private _chatSession: ChatSession;
  private _platformService: IPlatformService;
  private _componentInstanceResolver: ComponentInstanceResolver;
  private _chatStream: IChatStream;
  private _documentService: IDocumentService;

  // UI Components
  private _chatPanel?: ChatPanel;
  private _documentPanel?: DocumentPanel;
  private _outlinePanel?: DocumentOutlinePanel;
  private _markdownEditor?: MarkdownEditor;
  private _activeDocumentId: string | null = null;

  // The constructor is private to enforce the use of the async create() method for initialization.
  private constructor(options: AppOptions) {
    // Useful for stubbing out dependencies in tests, but in practice these will typically be created and injected by the static create() method.
    this._global = options.global;
    this._logger = options.logger; 
    this._chatSession = options.chatSession;
    this._componentInstanceResolver = options.componentInstanceResolver;
    this._platformService = options.platformService;
    this._chatStream = options.chatStream;
    this._documentService = options.documentService;
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

    const { document: _document, customElements: _customElementsRegistry } = globalThis;

    const loggerFactory: LoggerFactory = (componentName: string) => new ConsoleLogger(componentName);
    const logger = loggerFactory("App");

    const componentInstanceResolver = new ComponentInstanceResolver(_document, _customElementsRegistry, loggerFactory);

    const markdownEditor = componentInstanceResolver.resolve(MarkdownEditor, "markdown-editor");

    // Use local proxy
    const OLLAMA_ENDPOINT = "/ollama";
    const ANTHROPIC_ENDPOINT = "/anthropic";

    const platformRegistry = new PlatformRegistry(loggerFactory);
    const fetchFunction = globalThis.fetch.bind(globalThis);
    const getApiKey = (keyName: string) => () => localStorage.getItem(keyName) ?? "";
    platformRegistry.registerMany([
      new OllamaPlatform(loggerFactory, fetchFunction, getApiKey("ollama_api_key"), () => new OllamaStreamReader(), OLLAMA_ENDPOINT),
      new AnthropicPlatform(loggerFactory, fetchFunction, getApiKey("anthropic_api_key"), () => new AnthropicStreamReader()),
      new OpenAIPlatform(loggerFactory, fetchFunction, getApiKey("openai_api_key"), () => new OpenAIStreamReader()),
      new GeminiPlatform(loggerFactory, fetchFunction, getApiKey("gemini_api_key"), () => new GeminiStreamReader()),
      new MistralPlatform(loggerFactory, fetchFunction, getApiKey("mistral_api_key"), () => new MistralStreamReader()),
    ]);

    // Register tools in the tool registry so that they can be used by the ChatSession and invoked by the assistant in its responses.
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerMany([
      new TaskCompleteTool(loggerFactory),
      new ReplaceSelectionTool(loggerFactory, markdownEditor),
      new ReadDocumentOutlineTool(loggerFactory, markdownEditor),
      new ReadDocumentSectionTool(loggerFactory, markdownEditor),
      new InsertDocumentSectionTool(loggerFactory, markdownEditor),
      new ReplaceDocumentSectionTool(loggerFactory, markdownEditor),
      new MoveDocumentSectionTool(loggerFactory, markdownEditor),
      new RemoveDocumentSectionTool(loggerFactory, markdownEditor),
    ]);

    // Chat history is saved to local storage under the "chat_history" key.
    const history = new BrowserChatHistory("chat_history");

    // Create the chat session, which is the main interface for the UI to interact with the underlying platform and tools.
    // The chat session is responsible for managing the state of the current chat, submitting user prompts to the platform, and invoking tools as needed.
    // It is injected with the platform registry, tool registry, and model registry so that it can perform these functions.
    const chatSession = new ChatSession(
      loggerFactory,
      platformRegistry,
      history,
      toolRegistry
    );

    const documentManager = new DocumentManager();
    documentManager.registerMany([
      new LocalStorageDocumentStore("localStorage"),
      new FileSystemDocumentStore(() => navigator.storage.getDirectory())
    ]);

    return {
      global: globalThis,
      componentInstanceResolver,
      logger,
      chatSession,
      platformService: platformRegistry,
      chatStream: platformRegistry,
      toolService: toolRegistry,
      documentService: documentManager
    };
  }

  // The initialize method performs the actual setup of the app, including loading data and wiring up components. It is called from the static create() method after the App instance is created.
  private async initialize(): Promise<void> {

    // this._textEditor = this._componentInstanceResolver.resolve(TextEditor, "text-editor");
    this._markdownEditor = this._componentInstanceResolver.resolve(MarkdownEditor, "markdown-editor");
    this._markdownEditor.addEventListener("change", this._handleEditorChange);

    this._outlinePanel = this._componentInstanceResolver.resolve(DocumentOutlinePanel, "outline-panel");

    this._documentPanel = this._componentInstanceResolver.resolve(DocumentPanel, "document-panel");
    this._documentPanel.addEventListener("select", this._handleDocumentSelect);
    this._documentPanel.addEventListener("create", this._handleDocumentCreate);
    this._documentPanel.addEventListener("rename", this._handleDocumentRename);
    await this._refreshDocumentPanel();

    this._chatPanel = this._componentInstanceResolver.resolve(ChatPanel, "chat-panel");
    this._chatPanel.addEventListener("submit-prompt", this._handleChatPanelSubmitPrompt);
    this._chatPanel.addEventListener("clear-history", this._handleChatPanelClearHistory);
    
    this._chatStream.on("streamEvent", event => {
      this._logger.debug("Received stream event in App:", event);
      switch(event.type){
        case "text_delta":
        case "reasoning_delta":
          this._chatPanel?.appendActiveChatMessageContent(event.type, event.text);
          break;
      }

    });

    // Register the settings panel component and listen for settings changes so we can refresh the model list when API keys are updated.
    this._componentInstanceResolver.resolve(SettingsPanel, "settings-panel");
    this._global.document.addEventListener("settings-changed", this._handleSettingsChanged);

    // Load the list of available models from the platform and set them in the chat panel so that the user can select which model to use for their prompts.
    await this._refreshModels();

    // TODO: make this handle more granular stream events so that we can update the UI more responsively as the assistant generates its response,
    // rather than waiting for the entire response to be generated before updating the UI.
    this._chatSession.addEventListener("message", this._updateChatPanel);

    this._wireTemplateButtons();

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
    this._logger.debug("submit-prompt event", submitPromptEvent);


    const modelIdentifier = this._chatPanel?.model;
    const promptText = submitPromptEvent.detail.promptText;
    if (!modelIdentifier) {
      this._logger.error("No model selected");
      return;
    }

    // Build up the context object to pass to the ChatSession when submitting the prompt.
    // This will include any relevant information from the TextEditor, such as the selected text and document outline, which can then be used by tools when executing.
    const context: ChatMessageContext = {}

    
    this._chatSession.submitUserPrompt(modelIdentifier, promptText, context);
  }

  private _refreshDocumentPanel = async (): Promise<void> => {
    const docs = await this._documentService.listDocuments();
    this._documentPanel?.setDocuments(docs, this._activeDocumentId);
  }

  private _handleDocumentSelect = async (event: Event): Promise<void> => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    this._activeDocumentId = id;
    const content = await this._documentService.readDocument(id);
    this._markdownEditor?.setMarkdown(content);
    this._refreshDocumentPanel();
    this._refreshOutlinePanel();
  }

  private _handleDocumentRename = async (event: Event): Promise<void> => {
    const { id, title } = (event as CustomEvent<{ id: string; title: string }>).detail;
    await this._documentService.renameDocument(id, title);
  }

  private _handleDocumentCreate = async (): Promise<void> => {
    const defaultStore = this._documentService.getStoreNamespaces()[0];
    if (!defaultStore) return;
    const id = await this._documentService.createDocument("Untitled", defaultStore);
    this._activeDocumentId = id;
    this._markdownEditor?.setMarkdown("");
    await this._refreshDocumentPanel();
  }

  private _handleEditorChange = (event: Event): void => {
    this._refreshOutlinePanel();
    if (!this._activeDocumentId) return;
    const { markdown } = (event as CustomEvent<{ markdown: string }>).detail;
    this._documentService.updateDocument(this._activeDocumentId, markdown);
  }

  private _refreshOutlinePanel(): void {
    const outline = this._markdownEditor?.getOutline();
    if(outline){
      this._outlinePanel?.setDocument(outline);
    }
  }

  private _handleChatPanelClearHistory = (): void => {
    this._chatSession.clearHistory();
    this._updateChatPanel();
  }

  private _handleSettingsChanged = (): void => {
    this._refreshModels();
  }

  private async _refreshModels(): Promise<void> {
    const models = await this._platformService.getModels();
    this._chatPanel?.setModels(models);
  }

  private _wireTemplateButtons(): void {
    const buttons = this._global.document.querySelectorAll<HTMLButtonElement>("button[data-template-id]");
    buttons.forEach(btn => {
      // Prevent mousedown from stealing focus so the editor selection is preserved
      btn.addEventListener("mousedown", e => e.preventDefault());
      btn.addEventListener("click", () => {
        const id = btn.dataset.templateId ?? "";
        const template = TEMPLATES[id];
        if (template !== undefined) {
          this._markdownEditor?.replaceSelection(template);
        }
      });
    });
  }
}
