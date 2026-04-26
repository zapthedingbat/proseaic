import { App, AppOptions, WorkbenchFactory } from "./app.js";
import { AiInlineCompletionService } from "./lib/completion/inline-completion-service.js";
import { MarkdownEditor } from "./components/markdown-editor.js";
import { WritingAssistant } from "./agents/writing-assistant.js";
import { ChatSession } from "./lib/chat/chat-session.js";
import { DocumentManager } from "./lib/document/document-manager.js";
import { WebDavDocumentStore } from "./lib/document/stores/webdav-document-store.js";
import { BrowserChatHistory } from "./lib/history/browser-chat-history.js";
import { ConsoleLogger } from "./lib/logging/console-logger.js";
import { LoggerFactory } from "./lib/logging/logger-factory.js";
import { PlatformRegistry } from "./lib/platform/platform-registry.js";
import { ToolRegistry } from "./lib/tools/tools-registry.js";
import { ComponentFactory } from "./lib/ui/component-factory.js";
import { IUserInteraction } from "./lib/ui/user-interaction.js";
import { Workbench } from "./lib/workbench.js";
import { OllamaPlatform } from "./platform/ollama/ollama-platform.js";
import { OllamaStreamReader } from "./platform/ollama/ollama-stream-reader.js";
import { AnthropicPlatform } from "./platform/anthropic/anthropic-platform.js";
import { AnthropicStreamReader } from "./platform/anthropic/anthropic-stream-reader.js";
import { OpenAIPlatform } from "./platform/openai/openai-platform.js";
import { OpenAIStreamReader } from "./platform/openai/openai-stream-reader.js";
import { GeminiPlatform } from "./platform/gemini/gemini-platform.js";
import { GeminiStreamReader } from "./platform/gemini/gemini-stream-reader.js";
import { MistralPlatform } from "./platform/mistral/mistral-platform.js";
import { MistralStreamReader } from "./platform/mistral/mistral-stream-reader.js";
import { Configuration, ConfigurationManager } from "./lib/configuration/configuration-service.js";

// This is the composition root of the application, where the dependencies are configured.
(async function initialize(): Promise<void> {

  // Injecting document and customElementsRegistry from globalThis allows us to mock them in tests and also makes it explicit that our component factory depends on these browser APIs for managing UI components.
  const { document: _document, customElements: _customElementsRegistry } = globalThis;

  // The logger factory is responsible for creating loggers for different components of the app. In this case, it creates ConsoleLoggers that log to the browser console, but in a more complex app it could create loggers that send logs to a server or integrate with a logging framework.
  const loggerFactory: LoggerFactory = (componentName: string) => new ConsoleLogger(componentName);
  const logger = loggerFactory("App");

  // The component factory is responsible for creating instances of UI components and injecting dependencies into them.
  // It also handles defining custom elements in the DOM as needed.
  const componentFactory = new ComponentFactory(loggerFactory, _document, _customElementsRegistry, "ui");

  // The configuration manager is responsible for managing user-configurable settings in the app.
  // It persists settings to local storage and provides an interface for getting and setting configuration values, as well as listening for changes to configuration.
  const configuration = new ConfigurationManager(localStorage);

  // Injecting fetch from globalThis allows us to easily mock it in tests, and also makes it explicit that our platform implementations depend on fetch for making API calls.
  const fetchFunction = globalThis.fetch.bind(globalThis);

  const platformRegistry = new PlatformRegistry(loggerFactory);
  
  // API keys are read lazily so changes in Settings take effect immediately without a page reload.
  // Endpoints are read once at startup; changing an endpoint requires a page reload.
  const getApiKey = (key: keyof Configuration) => () => configuration.get(key) ?? "";
  const getEndpoint = (key: keyof Configuration, defaultUrl: string) => configuration.get(key) || defaultUrl;
  platformRegistry.registerMany([
    new OllamaPlatform(loggerFactory, fetchFunction, getApiKey("ai.platform.ollama.api_key"),    () => new OllamaStreamReader(),    getEndpoint("ai.platform.ollama.endpoint", "/ollama")),
    new AnthropicPlatform(loggerFactory, fetchFunction, getApiKey("ai.platform.anthropic.api_key"), () => new AnthropicStreamReader(), getEndpoint("ai.platform.anthropic.endpoint", "https://api.anthropic.com")),
    new OpenAIPlatform(loggerFactory, fetchFunction, getApiKey("ai.platform.openai.api_key"),    () => new OpenAIStreamReader(),    getEndpoint("ai.platform.openai.endpoint",    "https://api.openai.com")),
    new GeminiPlatform(loggerFactory, fetchFunction, getApiKey("ai.platform.gemini.api_key"),    () => new GeminiStreamReader(),    getEndpoint("ai.platform.gemini.endpoint",    "https://generativelanguage.googleapis.com")),
    new MistralPlatform(loggerFactory, fetchFunction, getApiKey("ai.platform.mistral.api_key"),  () => new MistralStreamReader(),   getEndpoint("ai.platform.mistral.endpoint",   "https://api.mistral.ai")),
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
    toolRegistry,
    new WritingAssistant()
  );

  // The document manager is responsible for managing documents in the app.
  // It provides an interface for creating, reading, updating, renaming, and deleting documents, as well as tracking which documents are dirty (i.e. have unsaved changes).
  const documentManager = new DocumentManager();
  documentManager.registerMany([
    new WebDavDocumentStore(window.location.origin),
    //new FileSystemDocumentStore(() => navigator.storage.getDirectory()),
    //new LocalStorageDocumentStore("localStorage"),
  ]);

  // The inline completion service provides AI-powered completions for the editor.
  // It is injected with the configuration and platform registry so that it can determine which model to use and how to call the platform's API to get completions.
  const completionService = new AiInlineCompletionService(
    configuration,
    platformRegistry
  );

  // The workbench factory is responsible for creating the main workbench component of the app, which manages open documents and editors.
  const workbenchFactory: WorkbenchFactory = (ui: IUserInteraction) => {
    return new Workbench(
      ui,
      componentFactory,
      documentManager,
      documentManager,
      completionService,
      async (format: string) => await componentFactory.create(MarkdownEditor)
    )
  }


  const options: AppOptions = {
    global: globalThis,
    componentFactory,
    completionService,
    configurationService: configuration,
    logger,
    chatSession,
    platformService: platformRegistry,
    toolService: toolRegistry,
    documentService: documentManager,
    workbenchFactory,
  };

  await App.create(options);
})();
