import { BrowserChatHistory } from "./lib/history/browser-chat-history.js";
import { ChatMessageContext } from "./lib/chat/chat-message-context.js";
import { ChatSession } from "./lib/chat/chat-session.js";
import { ComponentInstanceResolver } from "./lib/ui/component-instance-resolver.js";
import { ConsoleLogger } from "./lib/logging/console-logger.js";
import { DocumentManager, IDocumentService } from "./lib/document/document-manager.js";
import { FileSystemDocumentStore } from "./lib/document/file-system-document-store.js";
import { IChatStream } from "./lib/platform/chat-stream.js";
import { IPlatformService } from "./lib/platform/platform-service.js";
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
import { UiTabBar } from "./components/tab-bar.js";
import { UiPane } from "./components/pane.js";
import { UiPaneView } from "./components/pane-view.js";


// Tools
import { ReplaceSelectionTool } from "./tools/replace-selection.js";
import { ReadDocumentOutlineTool } from "./tools/read-document-outline.js";
import { ReadDocumentSectionTool } from "./tools/read-document-section.js";
import { RemoveDocumentSectionTool } from "./tools/remove-document-section.js";
import { InsertDocumentSectionTool } from "./tools/insert-document-section.js";
import { ReplaceDocumentSectionTool } from "./tools/replace-document-section.js";
import { MoveDocumentSectionTool } from "./tools/move-document-section.js";
import { CreateDocumentTool } from "./tools/create-document.js";
import { RenameDocumentTool } from "./tools/rename-document.js";
import { ListDocumentsTool } from "./tools/list-documents.js";
import { OpenDocumentTool } from "./tools/open-document.js";
import { IDocumentToolContext } from "./tools/document-tool-context.js";

type AppOptions = {
  documentService: IDocumentService;
  chatStream: IChatStream;
  global: typeof globalThis,
  logger: Logger;
  componentInstanceResolver: ComponentInstanceResolver,
  chatSession: ChatSession;
  platformService: IPlatformService;
  toolService: ToolRegistry;
}

export class App {

  private _global: typeof globalThis;
  private _logger: Logger;
  private _chatSession: ChatSession;
  private _platformService: IPlatformService;
  private _componentInstanceResolver: ComponentInstanceResolver;
  private _chatStream: IChatStream;
  private _documentService: IDocumentService;
  private _toolService: ToolRegistry;

  // UI Components
  private _chatPanel?: ChatPanel;
  private _documentPanel?: DocumentPanel;
  private _outlinePanel?: DocumentOutlinePanel;
  private _tabBar?: UiTabBar;
  private _markdownEditor?: MarkdownEditor;
  private _saveButton?: HTMLButtonElement;
  private _saveAsButton?: HTMLButtonElement;
  private _activeDocumentId: string | null = null;
  private _isDocumentDirty = false;
  private _openDocumentIds: string[] = [];

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
    this._toolService = options.toolService;
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

    const toolRegistry = new ToolRegistry();

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
      new FileSystemDocumentStore(() => navigator.storage.getDirectory()),
      //new LocalStorageDocumentStore("localStorage"),
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

    this._componentInstanceResolver.resolve(UiPaneView, "ui-pane-view");
    this._componentInstanceResolver.resolve(UiPane, "ui-pane");
    this._tabBar = this._componentInstanceResolver.resolve(UiTabBar, "ui-tab-bar");
    this._tabBar.addEventListener("select", this._handleTabSelect);
    this._tabBar.addEventListener("close", this._handleTabClose);

    this._wireAppMenu();
    this._global.document.addEventListener("keydown", this._handleKeyDown);

    this._markdownEditor = this._componentInstanceResolver.resolve(MarkdownEditor, "ui-markdown-editor");
    this._markdownEditor.addEventListener("change", this._handleEditorChange);

    this._registerTools();

    this._outlinePanel = this._componentInstanceResolver.resolve(DocumentOutlinePanel, "ui-outline-panel");
    this._outlinePanel.addEventListener("select", this._handleOutlineSelect);
    this._outlinePanel.addEventListener("delete", this._handleOutlineDelete);
    this._outlinePanel.addEventListener("decrease-level", this._handleOutlineDecreaseLevel);
    this._outlinePanel.addEventListener("increase-level", this._handleOutlineIncreaseLevel);

    this._documentPanel = this._componentInstanceResolver.resolve(DocumentPanel, "ui-document-panel");
    this._documentPanel.addEventListener("select", this._handleDocumentSelect);
    this._documentPanel.addEventListener("create", this._handleDocumentCreate);
    this._documentPanel.addEventListener("rename", this._handleDocumentRename);
    this._documentPanel.addEventListener("delete", this._handleDocumentDelete);
    await this._refreshDocumentPanel();

    this._chatPanel = this._componentInstanceResolver.resolve(ChatPanel, "ui-chat-panel");
    this._chatPanel.addEventListener("submit-prompt", this._handleChatPanelSubmitPrompt);
    this._chatPanel.addEventListener("clear-history", this._handleChatPanelClearHistory);
    
    // Stream content into the chat panel as it is received from the platform.
    // TODO: Work out how we handle multiple simultaneous streams for different chat messages.
    //   We likely need to include some identifier in the stream events so we know which 
    //   message/panel to stream the content into.
    this._chatStream.on("streamEvent", event => {
      const chatPanel = this._chatPanel;
      switch(event.type){
        case "text_delta":
          chatPanel?.appendResponseToActiveMessage(event.text);
          break;
        case "reasoning_delta":
          chatPanel?.appendThinkingToActiveMessage(event.text);
          break;
        case "image":
          chatPanel?.appendImageToActiveMessage(event.data);
          break;
      }

    });

    // Register the settings panel component and listen for settings changes so we can refresh the model list when API keys are updated.
    this._componentInstanceResolver.resolve(SettingsPanel, "ui-settings-panel");
    this._global.document.addEventListener("settings-changed", this._handleSettingsChanged);

    // Load the list of available models from the platform and set them in the chat panel so that the user can select which model to use for their prompts.
    await this._refreshModels();

    this._chatSession.addEventListener("message", this._updateChatPanel);

    this._wireTemplateButtons();

    this._updateChatPanel();
  }

  private _updateChatPanel = async () => {
    if(!this._chatPanel){
      this._logger.error("Chat panel not initialized");
      return;
    }
    const messages = await this._chatSession.getMessages();
    this._chatPanel.setHistory(messages);
    this._chatPanel.setAssistantMessage(this._chatSession.getActiveAssistantChatMessage());
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
    const context: ChatMessageContext = {}

    this._chatSession.submitUserPrompt(modelIdentifier, promptText, context);
  }

  private _refreshDocumentPanel = async (): Promise<void> => {
    const docs = await this._documentService.listDocuments();
    const dirtyId = this._isDocumentDirty ? this._activeDocumentId : null;
    this._documentPanel?.setDocuments(docs, this._activeDocumentId, dirtyId);
    this._refreshTabBar(docs);
    this._updateSaveButtonState();
  }

  private _createDocument = async (title: string, store?: string): Promise<{ id: string; title: string }> => {
    this._markdownEditor?.flushPendingChanges();

    const targetStore = store ?? this._documentService.getStoreNamespaces()[0];
    if (!targetStore) {
      throw new Error("No document store is configured.");
    }

    const id = await this._documentService.createDocument(title, targetStore);
    this._activeDocumentId = id;
    this._rememberOpenDocument(id);
    this._markdownEditor?.setMarkdown("");
    this._setDirty(false);
    await this._refreshDocumentPanel();
    this._refreshOutlinePanel();

    return { id, title };
  }

  private _openDocument = async (id: string): Promise<{ id: string; title: string; content: string }> => {
    this._markdownEditor?.flushPendingChanges();

    const documents = await this._documentService.listDocuments();
    const document = documents.find(doc => doc.id === id);
    const content = await this._documentService.readDocument(id);

    this._activeDocumentId = id;
    this._rememberOpenDocument(id);
    this._markdownEditor?.setMarkdown(content);
    this._setDirty(false);
    await this._refreshDocumentPanel();
    this._refreshOutlinePanel();

    return {
      id,
      title: document?.title || "Untitled",
      content
    };
  }

  private _renameDocument = async (id: string, title: string): Promise<void> => {
    await this._documentService.renameDocument(id, title);
    await this._refreshDocumentPanel();
  }

  private _buildDocumentToolContext(): IDocumentToolContext {
    return {
      getActiveDocumentId: () => this._activeDocumentId,
      getStoreNamespaces: () => this._documentService.getStoreNamespaces(),
      listDocuments: () => this._documentService.listDocuments(),
      createDocument: (title: string, store?: string) => this._createDocument(title, store),
      renameDocument: (id: string, title: string) => this._renameDocument(id, title),
      openDocument: (id: string) => this._openDocument(id)
    };
  }

  private _registerTools(): void {
    if (!this._markdownEditor) {
      return;
    }

    const loggerFactory: LoggerFactory = (componentName: string) => new ConsoleLogger(componentName);
    const documentToolContext = this._buildDocumentToolContext();

    this._toolService.registerMany([
      new TaskCompleteTool(loggerFactory),
      new ListDocumentsTool(loggerFactory, documentToolContext),
      new OpenDocumentTool(loggerFactory, documentToolContext),
      new CreateDocumentTool(loggerFactory, documentToolContext),
      new RenameDocumentTool(loggerFactory, documentToolContext),
      new ReplaceSelectionTool(loggerFactory, this._markdownEditor),
      new ReadDocumentOutlineTool(loggerFactory, this._markdownEditor),
      new ReadDocumentSectionTool(loggerFactory, this._markdownEditor),
      new InsertDocumentSectionTool(loggerFactory, this._markdownEditor),
      new ReplaceDocumentSectionTool(loggerFactory, this._markdownEditor),
      new MoveDocumentSectionTool(loggerFactory, this._markdownEditor),
      new RemoveDocumentSectionTool(loggerFactory, this._markdownEditor),
    ]);
  }

  private _handleDocumentSelect = async (event: Event): Promise<void> => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    if (id !== this._activeDocumentId && !this._canDiscardUnsavedChanges()) {
      return;
    }
    await this._openDocument(id);
  }

  private _handleDocumentRename = async (event: Event): Promise<void> => {
    const { id, title } = (event as CustomEvent<{ id: string; title: string }>).detail;
    await this._renameDocument(id, title);
  }

  private _handleDocumentDelete = async (event: Event): Promise<void> => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    if (id === this._activeDocumentId && !this._canDiscardUnsavedChanges()) {
      return;
    }
    await this._documentService.deleteDocument(id);

    if (this._activeDocumentId === id) {
      this._activeDocumentId = null;
      this._markdownEditor?.setMarkdown("");
      this._setDirty(false);
      this._refreshOutlinePanel();
    }

    this._openDocumentIds = this._openDocumentIds.filter(openId => openId !== id);

    await this._refreshDocumentPanel();
  }

  private _handleDocumentCreate = async (): Promise<void> => {
    if (!this._canDiscardUnsavedChanges()) {
      return;
    }
    await this._createDocument("Untitled");
  }

  private _handleTabSelect = async (event: Event): Promise<void> => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    if (!id || id === this._activeDocumentId) {
      return;
    }
    if (!this._canDiscardUnsavedChanges()) {
      return;
    }
    await this._openDocument(id);
  }

  private _handleTabClose = async (event: Event): Promise<void> => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    if (!id) {
      return;
    }

    const closingActive = id === this._activeDocumentId;
    if (closingActive && !this._canDiscardUnsavedChanges()) {
      return;
    }

    const closingIndex = this._openDocumentIds.indexOf(id);
    this._openDocumentIds = this._openDocumentIds.filter(openId => openId !== id);

    if (!closingActive) {
      await this._refreshDocumentPanel();
      return;
    }

    const nextId = this._openDocumentIds[Math.min(closingIndex, this._openDocumentIds.length - 1)] ?? null;
    if (nextId) {
      this._setDirty(false);
      await this._openDocument(nextId);
      return;
    }

    this._activeDocumentId = null;
    this._markdownEditor?.setMarkdown("");
    this._setDirty(false);
    this._refreshOutlinePanel();
    await this._refreshDocumentPanel();
  }

  private _handleOutlineSelect = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    this._markdownEditor?.focusSection(sectionId);
  }

  private _handleOutlineDelete = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    this._markdownEditor?.removeSection(sectionId);
  }

  private _handleOutlineDecreaseLevel = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    this._markdownEditor?.decreaseSectionLevel(sectionId);
  }

  private _handleOutlineIncreaseLevel = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    this._markdownEditor?.increaseSectionLevel(sectionId);
  }

  private _handleEditorChange = (event: Event): void => {
    this._refreshOutlinePanel();
    void event;
    this._setDirty(true);
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

  private _handleKeyDown = (event: KeyboardEvent): void => {
    const isSaveShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "s";
    if (!isSaveShortcut) {
      return;
    }

    event.preventDefault();
    void this._saveActiveDocument();
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

  private _wireAppMenu(): void {
    this._saveButton = this._global.document.querySelector("button[data-app-action=\"save\"]") as HTMLButtonElement | null || undefined;
    this._saveAsButton = this._global.document.querySelector("button[data-app-action=\"save-as\"]") as HTMLButtonElement | null || undefined;

    this._saveButton?.addEventListener("click", this._handleSaveClick);
    this._saveAsButton?.addEventListener("click", this._handleSaveAsClick);
    this._updateSaveButtonState();
  }

  private _handleSaveClick = async (): Promise<void> => {
    await this._saveActiveDocument();
  }

  private _handleSaveAsClick = async (): Promise<void> => {
    await this._saveActiveDocumentAs();
  }

  private async _saveActiveDocument(): Promise<void> {
    this._markdownEditor?.flushPendingChanges();
    if (!this._activeDocumentId || !this._markdownEditor) {
      return;
    }

    await this._documentService.updateDocument(this._activeDocumentId, this._markdownEditor.markdown);
    this._setDirty(false);
  }

  private async _saveActiveDocumentAs(): Promise<void> {
    this._markdownEditor?.flushPendingChanges();
    if (!this._markdownEditor) {
      return;
    }

    const currentTitle = await this._getCurrentDocumentTitle();
    const input = this._global.prompt("Save as", currentTitle);
    if (input === null) {
      return;
    }

    const title = input.trim() || "Untitled";
    const targetStore = this._activeDocumentId?.split("/")[0] || this._documentService.getStoreNamespaces()[0];
    if (!targetStore) {
      throw new Error("No document store is configured.");
    }

    const id = await this._documentService.createDocument(title, targetStore);
    await this._documentService.updateDocument(id, this._markdownEditor.markdown);
    this._activeDocumentId = id;
    this._rememberOpenDocument(id);
    this._setDirty(false);
    await this._refreshDocumentPanel();
  }

  private async _getCurrentDocumentTitle(): Promise<string> {
    if (!this._activeDocumentId) {
      return "Untitled";
    }

    const docs = await this._documentService.listDocuments();
    return docs.find(doc => doc.id === this._activeDocumentId)?.title || "Untitled";
  }

  private _setDirty(value: boolean): void {
    if (this._isDocumentDirty === value) {
      return;
    }
    this._isDocumentDirty = value;
    void this._refreshDocumentPanel();
  }

  private _updateSaveButtonState(): void {
    if (this._saveButton) {
      this._saveButton.disabled = !this._activeDocumentId || !this._isDocumentDirty;
    }
    if (this._saveAsButton) {
      this._saveAsButton.disabled = !this._markdownEditor;
    }
  }

  private _canDiscardUnsavedChanges(): boolean {
    if (!this._isDocumentDirty) {
      return true;
    }
    return this._global.confirm("You have unsaved changes. Continue without saving?");
  }

  private _rememberOpenDocument(id: string): void {
    if (!this._openDocumentIds.includes(id)) {
      this._openDocumentIds.push(id);
    }
  }

  private _refreshTabBar(docs: { id: string; title: string }[]): void {
    if (!this._tabBar) {
      return;
    }

    const documentById = new Map(docs.map(doc => [doc.id, doc]));
    this._openDocumentIds = this._openDocumentIds.filter(id => documentById.has(id));

    const tabs = this._openDocumentIds.map(id => {
      const doc = documentById.get(id);
      return {
        id,
        title: doc?.title || "Untitled"
      };
    });

    const dirtyId = this._isDocumentDirty ? this._activeDocumentId : null;
    this._tabBar.setTabs(tabs, this._activeDocumentId, dirtyId);
  }
}



