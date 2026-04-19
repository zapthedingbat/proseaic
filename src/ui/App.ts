import { BrowserChatHistory } from "./lib/history/browser-chat-history.js";
import { ChatMessageContext } from "./lib/chat/chat-message-context.js";
import { ChatSession } from "./lib/chat/chat-session.js";
import { ComponentInstanceResolver } from "./lib/ui/component-instance-resolver.js";
import { ConsoleLogger } from "./lib/logging/console-logger.js";
import { DocumentManager } from "./lib/document/document-manager.js";
import { IDocumentService } from "./lib/document/document-service.js";
import { IChatStream } from "./lib/platform/chat-stream.js";
import { IPlatformService } from "./lib/platform/platform-service.js";
import { Logger } from "./lib/logging/logger.js";
import { LoggerFactory } from "./lib/logging/logger-factory.js";
import { PlatformRegistry } from "./lib/platform/platform-registry.js";
import { SubmitPromptEvent } from "./lib/events.js";
import { TaskCompleteTool } from "./tools/task-complete.js";
import { ToolRegistry } from "./lib/tools/tools-registry.js";
import { DocumentConcurrencyError } from "./lib/document/document-store.js";

// Document persistence layers
import { FileSystemDocumentStore } from "./lib/document/file-system-document-store.js";
import { LocalStorageDocumentStore } from "./lib/document/local-storage-document-store.js";
import { WebDavDocumentStore } from "./lib/document/webdav-document-store.js";

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
      new WebDavDocumentStore(window.location.origin),
      //new FileSystemDocumentStore(() => navigator.storage.getDirectory()),
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
    this._documentPanel?.setDocuments(docs, this._activeDocumentId, this._documentService.getDirtyDocumentIds());
    this._refreshTabBar(docs);
    this._updateSaveButtonState();
  }

  private _isFilenameConflictError(err: unknown): boolean {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    return message.includes("already exists") || message.includes("destination file already exists");
  }

  private async _getUniqueDocumentTitle(baseTitle: string, store: string): Promise<string> {
    const docs = await this._documentService.listDocuments();
    const existingTitles = new Set(
      docs
        .filter(doc => doc.id.startsWith(`${store}/`))
        .map(doc => doc.title)
    );

    let candidate = baseTitle;
    let index = 1;
    while (existingTitles.has(candidate)) {
      candidate = `${baseTitle} (${index})`;
      index += 1;
    }
    return candidate;
  }

  private async _promptForAvailableTitle(initialTitle: string, store: string, promptLabel: string): Promise<string | null> {
    let suggestedTitle = initialTitle;
    while (true) {
      const input = this._global.prompt(promptLabel, suggestedTitle);
      if (input === null) {
        return null;
      }

      const trimmed = input.trim() || "Untitled";
      const unique = await this._getUniqueDocumentTitle(trimmed, store);
      if (unique !== trimmed) {
        this._global.alert(`\"${trimmed}\" already exists. Please choose a different name.`);
        suggestedTitle = unique;
        continue;
      }

      return trimmed;
    }
  }

  private async _createDocumentFromEditorContent(title: string, store: string): Promise<void> {
    if (!this._markdownEditor) {
      return;
    }

    const id = await this._documentService.createDocument(title, store);
    await this._documentService.updateDocument(id, this._markdownEditor.markdown);
    this._activeDocumentId = id;
    this._rememberOpenDocument(id);
    await this._refreshDocumentPanel();
  }

  private async _handleDocumentUpdateConflict(): Promise<void> {
    if (!this._activeDocumentId) {
      return;
    }

    const shouldDiscard = this._global.confirm(
      "This document has changed in the store. Click OK to discard your local changes and reload, or click Cancel to save your changes as a new file."
    );

    if (shouldDiscard) {
      this._documentService.discardUnsavedDocumentChanges(this._activeDocumentId);
      await this._openDocument(this._activeDocumentId);
      return;
    }

    const targetStore = this._activeDocumentId.split("/")[0] || this._documentService.getStoreNamespaces()[0];
    if (!targetStore) {
      this._global.alert("No document store is configured.");
      return;
    }

    const currentTitle = await this._getCurrentDocumentTitle();
    const copyBaseName = `${currentTitle} (copy)`;
    const suggestedTitle = await this._getUniqueDocumentTitle(copyBaseName, targetStore);
    const title = await this._promptForAvailableTitle(
      suggestedTitle,
      targetStore,
      "Choose a file name to save your local changes as a new document"
    );
    if (!title) {
      return;
    }

    await this._createDocumentFromEditorContent(title, targetStore);
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
    await this._refreshDocumentPanel();
    this._refreshOutlinePanel();

    return {
      id,
      title: document?.title || "Untitled",
      content
    };
  }

  private _renameDocument = async (id: string, title: string): Promise<string> => {
    const newId = await this._documentService.renameDocument(id, title);
    
    // If the renamed document is currently active, switch to the new ID
    if (id === this._activeDocumentId) {
      this._activeDocumentId = newId;
      if (this._tabBar) {
        this._tabBar.ActiveTabId = newId;
      }
    }
    
    await this._refreshDocumentPanel();
    return newId;
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
    if (id === this._activeDocumentId) {
      return;
    }
    await this._openDocument(id);
  }

  private _handleDocumentRename = async (event: Event): Promise<void> => {
    const { id, title } = (event as CustomEvent<{ id: string; title: string }>).detail;
    try {
      await this._renameDocument(id, title);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (this._isFilenameConflictError(err)) {
        const store = id.split("/")[0];
        const retryTitle = await this._promptForAvailableTitle(
          title,
          store,
          "A document with that name already exists. Enter a different name"
        );
        if (retryTitle) {
          try {
            await this._renameDocument(id, retryTitle);
            return;
          } catch (retryErr) {
            const retryMessage = retryErr instanceof Error ? retryErr.message : "Unknown error";
            this._global.alert(`Failed to rename document: ${retryMessage}`);
          }
        }
      } else {
        this._global.alert(`Failed to rename document: ${message}`);
      }
      console.error(`Failed to rename document: ${message}`);
      await this._refreshDocumentPanel();
    }
  }

  private _handleDocumentDelete = async (event: Event): Promise<void> => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    if (id === this._activeDocumentId && !this._canDiscardUnsavedChanges()) {
      return;
    }
    try {
      await this._documentService.deleteDocument(id);

      if (this._activeDocumentId === id) {
        this._activeDocumentId = null;
        this._markdownEditor?.setMarkdown("");
        this._refreshOutlinePanel();
      }

      this._openDocumentIds = this._openDocumentIds.filter(openId => openId !== id);

      await this._refreshDocumentPanel();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to delete document: ${message}`);
      this._global.alert(`Failed to delete document: ${message}`);
      // Revert UI by refreshing document panel with actual data
      await this._refreshDocumentPanel();
    }
  }

  private _handleDocumentCreate = async (): Promise<void> => {
    if (!this._canDiscardUnsavedChanges()) {
      return;
    }
    try {
      const targetStore = this._documentService.getStoreNamespaces()[0];
      if (!targetStore) {
        throw new Error("No document store is configured.");
      }

      const uniqueTitle = await this._getUniqueDocumentTitle("Untitled", targetStore);
      const created = await this._createDocument(uniqueTitle, targetStore);
      this._documentPanel?.startRename(created.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to create document: ${message}`);
      this._global.alert(`Failed to create document: ${message}`);
      // Revert UI by refreshing document panel with actual data
      await this._refreshDocumentPanel();
    }
  }

  private _handleTabSelect = async (event: Event): Promise<void> => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    if (!id || id === this._activeDocumentId) {
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
      await this._openDocument(nextId);
      return;
    }

    this._activeDocumentId = null;
    this._markdownEditor?.setMarkdown("");
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
    if (this._activeDocumentId) {
      this._documentService.setDocumentDraft(this._activeDocumentId, this._markdownEditor?.markdown ?? "");
      void this._refreshDocumentPanel();
    }
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
    void this._handleSaveClick();
  }

  private async _refreshModels(): Promise<void> {
    const models = await this._platformService.getModels();
    this._chatPanel?.setModels(models);
  }

  private _wireAppMenu(): void {
    this._saveButton = this._global.document.querySelector("button[data-app-action=\"save\"]") as HTMLButtonElement | null || undefined;
    this._saveAsButton = this._global.document.querySelector("button[data-app-action=\"save-as\"]") as HTMLButtonElement | null || undefined;

    this._saveButton?.addEventListener("click", this._handleSaveClick);
    this._saveAsButton?.addEventListener("click", this._handleSaveAsClick);
    this._updateSaveButtonState();
  }

  private _handleSaveClick = async (): Promise<void> => {
    try {
      await this._saveActiveDocument();
    } catch (err) {
      if (err instanceof DocumentConcurrencyError) {
        await this._handleDocumentUpdateConflict();
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      this._global.alert(`Failed to save document: ${message}`);
    }
  }

  private _handleSaveAsClick = async (): Promise<void> => {
    try {
      await this._saveActiveDocumentAs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this._global.alert(`Failed to save document as: ${message}`);
    }
  }

  private async _saveActiveDocument(): Promise<void> {
    this._markdownEditor?.flushPendingChanges();
    if (!this._activeDocumentId || !this._markdownEditor) {
      return;
    }

    await this._documentService.updateDocument(this._activeDocumentId, this._markdownEditor.markdown);
    await this._refreshDocumentPanel();
  }

  private async _saveActiveDocumentAs(): Promise<void> {
    this._markdownEditor?.flushPendingChanges();
    if (!this._markdownEditor) {
      return;
    }

    const targetStore = this._activeDocumentId?.split("/")[0] || this._documentService.getStoreNamespaces()[0];
    if (!targetStore) {
      throw new Error("No document store is configured.");
    }

    const currentTitle = await this._getCurrentDocumentTitle();
    const title = await this._promptForAvailableTitle(currentTitle, targetStore, "Save as");
    if (title === null) {
      return;
    }

    let resolvedTitle = title;
    let id: string;
    while (true) {
      try {
        id = await this._documentService.createDocument(resolvedTitle, targetStore);
        break;
      } catch (err) {
        if (!this._isFilenameConflictError(err)) {
          throw err;
        }
        const retry = await this._promptForAvailableTitle(
          resolvedTitle,
          targetStore,
          "A document with that name already exists. Enter a different name"
        );
        if (retry === null) {
          return;
        }
        resolvedTitle = retry;
      }
    }

    await this._documentService.updateDocument(id, this._markdownEditor.markdown);
    this._activeDocumentId = id;
    this._rememberOpenDocument(id);
    await this._refreshDocumentPanel();
  }

  private async _getCurrentDocumentTitle(): Promise<string> {
    if (!this._activeDocumentId) {
      return "Untitled";
    }

    const docs = await this._documentService.listDocuments();
    return docs.find(doc => doc.id === this._activeDocumentId)?.title || "Untitled";
  }

  private _isActiveDocumentDirty(): boolean {
    return !!this._activeDocumentId && this._documentService.isDocumentDirty(this._activeDocumentId);
  }

  private _updateSaveButtonState(): void {
    if (this._saveButton) {
      this._saveButton.disabled = !this._activeDocumentId || !this._isActiveDocumentDirty();
    }
    if (this._saveAsButton) {
      this._saveAsButton.disabled = !this._markdownEditor;
    }
  }

  private _canDiscardUnsavedChanges(): boolean {
    if (!this._isActiveDocumentDirty()) {
      return true;
    }
    const shouldDiscard = this._global.confirm("You have unsaved changes. Continue without saving?");
    if (shouldDiscard && this._activeDocumentId) {
      this._documentService.discardUnsavedDocumentChanges(this._activeDocumentId);
      void this._refreshDocumentPanel();
    }
    return shouldDiscard;
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

    this._tabBar.setTabs(tabs, this._activeDocumentId, this._documentService.getDirtyDocumentIds());
  }
}



