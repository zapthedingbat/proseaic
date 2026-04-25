import { Model } from "./lib/models/model.js"
import { ChatSession } from "./lib/chat/chat-session.js";
import { ComponentFactory } from "./lib/ui/component-factory.js";
import { ConsoleLogger } from "./lib/logging/console-logger.js";
import { IDocumentService } from "./lib/document/document-service.js";
import { IPlatformService } from "./lib/platform/platform-service.js";
import { Logger } from "./lib/logging/logger.js";
import { LoggerFactory } from "./lib/logging/logger-factory.js";

import { StreamTokenEvent, SubmitPromptEvent } from "./lib/events.js";
import { TaskCompleteTool } from "./tools/task-complete.js";
import { ToolRegistry } from "./lib/tools/tools-registry.js";
import { IWorkbench } from "./lib/workbench.js";
import { IInlineCompletionService } from "./lib/completion/inline-completion-service.js";
import { IUserInteraction,  } from "./lib/ui/user-interaction.js";
import { IConfigurationService, Configuration } from "./lib/configuration/configuration-service.js";

// UI Components
import { ChatPanel } from "./components/chat-panel.js";
import { MenuBar } from "./components/menu-bar.js";
import { UiPane } from "./components/pane.js";
import { UiPaneView } from "./components/pane-view.js";
import { SettingsPanel } from "./components/settings-panel.js";

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

export type WorkbenchFactory = (ui: IUserInteraction) => IWorkbench;

export type AppOptions = {
  chatSession: ChatSession;
  completionService: IInlineCompletionService;
  componentFactory: ComponentFactory,
  configurationService: IConfigurationService;
  documentService: IDocumentService;
  global: typeof globalThis,
  logger: Logger;
  platformService: IPlatformService;
  toolService: ToolRegistry;
  workbenchFactory: WorkbenchFactory;
}

export class App implements IUserInteraction {
  private _componentFactory: ComponentFactory;
  private _global: typeof globalThis;
  private _logger: Logger;
  private _workbench: IWorkbench;
  private _chatSession: ChatSession;
  private _platformService: IPlatformService;
  private _documentService: IDocumentService;
  private _toolService: ToolRegistry;

  // UI Components
  private _configurationService: IConfigurationService;
  private _chatPanel?: ChatPanel;
  private _settingsPanel?: SettingsPanel;
  private _saveButton?: HTMLButtonElement;
  private _saveAsButton?: HTMLButtonElement;
  private _availableModels: Model[] = [];

  // The constructor is private to enforce the use of the async create() method for initialization.
  private constructor(options: AppOptions) {
    // Useful for stubbing out dependencies in tests, but in practice these will typically be created and injected by the static create() method.
    this._chatSession = options.chatSession;
    this._componentFactory = options.componentFactory;
    this._configurationService = options.configurationService;
    this._documentService = options.documentService;
    this._global = options.global;
    this._logger = options.logger; 
    this._platformService = options.platformService;
    this._toolService = options.toolService;
    this._workbench = options.workbenchFactory(this);
  }

  // TODO: Update these to use HTML elements instead of global alert/confirm/prompt so that they are non-blocking
  // and can be styled consistently with the rest of the app.
  async alert(message: string): Promise<void> {
    try {
      return this._global.alert(message);
    } catch {
      this._logger.warn(`Alert fallback: ${message}`);
    }
  }

  async confirm(message: string): Promise<boolean> {
    try {
      return this._global.confirm(message);
    } catch {
      this._logger.warn(`Confirm fallback accepted: ${message}`);
      return true;
    }
  }

  async prompt(message: string, defaultValue?: string): Promise<string | null> {
    try {
      return this._global.prompt(message, defaultValue);
    } catch {
      this._logger.warn(`Prompt fallback used default value for: ${message}`);
      return defaultValue ?? null;
    }
  }

  // The create method initializes the App instance and performs asynchronous setup.
  static async create(options: AppOptions): Promise<App> {

    // Create the app instance. The constructor is private, so this is the only way to create an App, because we want to ensure that the async initialization logic in initialize() is always run.
    const app = new App(options);

    // Call the async initialize method to set up the app. This allows us to perform any necessary asynchronous operations during initialization, such as loading data or setting up connections.
    await app.initialize();

    // Return the fully initialized app instance.
    return app;
  }


  // The initialize method performs the actual setup of the app, including loading data and wiring up components. It is called from the static create() method after the App instance is created.
  private async initialize(): Promise<void> {

    const appEl = this._global.document.querySelector(".app") as HTMLElement;
    const headerEl = this._global.document.querySelector("header.app-header") as HTMLElement;
    const mainEl = this._global.document.getElementById("app-main") as HTMLElement;
    const footerEl = this._global.document.querySelector("footer.app-footer") as HTMLElement;

    this._mountAppOwnedUi(appEl, headerEl, mainEl, footerEl);
    this._workbench.mount(mainEl);
    this._wireAppMenu();

    this._global.document.addEventListener("keydown", this._handleKeyDown);

    this._registerTools();

    this._global.document.addEventListener("settings-changed", this._handleSettingsChanged);

    // Load the list of available models from the platform and set them in the chat panel so that the user can select which model to use for their prompts.
    await this._refreshModels();

    await this._updateChatPanel();

  }

  private _mountAppOwnedUi(appEl: HTMLElement, headerEl: HTMLElement, mainEl: HTMLElement, footerEl: HTMLElement): void {
    this._mountSettingsPanel(appEl, mainEl);
    this._mountChatPane(mainEl);
    this._mountMenus(headerEl, footerEl);
  }

  private _mountSettingsPanel(appEl: HTMLElement, mainEl: HTMLElement): void {
    this._settingsPanel = this._componentFactory.create(SettingsPanel);
    this._settingsPanel.id = "ui-settings-panel";
    this._settingsPanel.setAttribute("popover", "");
    this._settingsPanel.addEventListener("toggle", (e: Event) => {
      if ((e as ToggleEvent).newState === "open") {
        void this._refreshModels();
        this._loadSettingsPanel();
      }
    });
    appEl.insertBefore(this._settingsPanel, mainEl);
  }

  private _loadSettingsPanel(): void {
    if (!this._settingsPanel) return;
    const snapshot: Partial<Configuration> = {};
    for (const key of this._configurationService.keys()) {
      snapshot[key] = this._configurationService.get(key);
    }
    this._settingsPanel.load(snapshot);
  }

  private _mountChatPane(mainEl: HTMLElement): void {
    const rightPaneView = this._componentFactory.create(UiPaneView);
    rightPaneView.classList.add("pane-view", "right");

    const chatPane = this._componentFactory.create(UiPane);
    chatPane.setAttribute("title", "Chat");

    this._chatPanel = this._componentFactory.create(ChatPanel);
    this._chatPanel.addEventListener("submit-prompt", this._handleChatPanelSubmitPrompt);
    this._chatPanel.addEventListener("clear-history", this._handleChatPanelClearHistory);

    chatPane.appendChild(this._chatPanel);
    rightPaneView.appendChild(chatPane);
    mainEl.appendChild(rightPaneView);
  }

  private _mountMenus(headerEl: HTMLElement, footerEl: HTMLElement): void {
    const headerMenu = this._componentFactory.create(MenuBar);
    headerMenu.classList.add("app-header-menu");
    headerEl.appendChild(headerMenu);
    this._appendHeaderMenuButtons(headerMenu);

    const footerMenu = this._componentFactory.create(MenuBar);
    footerEl.appendChild(footerMenu);
    const footerActions = footerMenu.querySelector(".action-items") as HTMLDivElement;
    const footerLabel = this._global.document.createElement("span");
    footerLabel.textContent = "Markdown AI Editor";
    footerActions.appendChild(footerLabel);
  }

  private _appendHeaderMenuButtons(menuBar: MenuBar): void {
    const actionItems = menuBar.querySelector(".action-items") as HTMLDivElement;
    actionItems.appendChild(this._createMenuButton("Save", "save"));
    actionItems.appendChild(this._createMenuButton("Save As", "save-as"));
  }

  private _createMenuButton(label: string, actionId: string): HTMLButtonElement {
    const button = this._global.document.createElement("button");
    button.type = "button";
    button.dataset.appAction = actionId;
    button.textContent = label;
    return button;
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

  private _handleChatPanelSubmitPrompt = async (event: Event): Promise<void> => {
    const submitPromptEvent = event as SubmitPromptEvent;
    this._logger.debug("submit-prompt event", submitPromptEvent);

    const modelIdentifier = this._chatPanel?.model;
    const promptText = submitPromptEvent.detail.promptText;
    if (!modelIdentifier) {
      this._logger.error("No model selected");
      return;
    }

    try {
      const stream = this._chatSession.submitUserPrompt(modelIdentifier, promptText);
      stream.addEventListener("message", this._updateChatPanel);
      stream.addEventListener("token", (e: Event) => {
        const event = (e as StreamTokenEvent).detail;
        if (event.type === "text_delta") {
          this._chatPanel?.appendResponseToActiveMessage(event.text);
        } else if (event.type === "reasoning_delta") {
          this._chatPanel?.appendThinkingToActiveMessage(event.text);
        }
      });
      await stream.completed;
    } finally {
      this._chatPanel?.setSendEnabled(true);
    }
  }

  private _registerTools(): void {
    const loggerFactory: LoggerFactory = (componentName: string) => new ConsoleLogger(componentName);
    const getFocusedEditor = () => this._workbench.getFocusedEditor();

    // TODO: Allow tools to be injected so the app doesn't need to have direct imports of all tools.
    // This will make it easier to add/remove tools without needing to change the app code, and also
    // allows for tools to be provided by third parties without needing to modify the app code.
    this._toolService.registerMany([
      // Workflow tools
      new TaskCompleteTool(loggerFactory),

      // Workspace tools
      new ListDocumentsTool(loggerFactory, this._documentService, this._workbench),
      new OpenDocumentTool(loggerFactory, this._workbench),
      new CreateDocumentTool(loggerFactory, this._workbench),
      new RenameDocumentTool(loggerFactory, this._workbench),

      // Active selection editing tools
      new ReplaceSelectionTool(loggerFactory, getFocusedEditor),

      // Active document editing tools.
      // These tools work on open/active documents so changes will mean
      // opening the document and leaving the change unsaved.
      new ReadDocumentOutlineTool(loggerFactory, getFocusedEditor),
      new ReadDocumentSectionTool(loggerFactory, getFocusedEditor),
      new InsertDocumentSectionTool(loggerFactory, getFocusedEditor),
      new ReplaceDocumentSectionTool(loggerFactory, getFocusedEditor),
      new MoveDocumentSectionTool(loggerFactory, getFocusedEditor),
      new RemoveDocumentSectionTool(loggerFactory, getFocusedEditor),

      // Dangerous stuff, allow the model to commit changes to persistance.
      // new SaveDocumentTool(loggerFactory),
    ]);
  }

  private _handleChatPanelClearHistory = (): void => {
    this._chatSession.clearHistory();
    this._updateChatPanel();
  }

  private _handleSettingsChanged = (event: Event): void => {
    const { key, value } = (event as CustomEvent<{ key: keyof Configuration; value: string }>).detail;
    this._configurationService.set(key, value);
    void this._refreshModels();
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
    this._availableModels = models;
    this._chatPanel?.setModels(models);
    this._settingsPanel?.setModels(models);
  }

  private _wireAppMenu(): void {
    this._saveButton = this._global.document.querySelector("button[data-app-action=\"save\"]") as HTMLButtonElement | null || undefined;
    this._saveAsButton = this._global.document.querySelector("button[data-app-action=\"save-as\"]") as HTMLButtonElement | null || undefined;
    this._saveButton?.addEventListener("click", this._handleSaveClick);
    this._saveAsButton?.addEventListener("click", this._handleSaveAsClick);
  }

  private _handleSaveClick = async (): Promise<void> => {
    await this._workbench.saveFocusedDocument();
  }

  private _handleSaveAsClick = async (): Promise<void> => {
    await this._workbench.saveFocusedDocumentAs();
  }
}



