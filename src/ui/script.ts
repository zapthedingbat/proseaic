import { App, AppOptions, WorkbenchFactory } from "./app.js";
import { MarkdownEditor } from "./components/markdown-editor.js";
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

// Bootstrap the application. This isn't covered by tests.
(async function initialize(): Promise<void> {

  const { document: _document, customElements: _customElementsRegistry } = globalThis;

  // The logger factory is responsible for creating loggers for different components of the app. In this case, it creates ConsoleLoggers that log to the browser console, but in a more complex app it could create loggers that send logs to a server or integrate with a logging framework.
  const loggerFactory: LoggerFactory = (componentName: string) => new ConsoleLogger(componentName);
  const logger = loggerFactory("App");

  // The component factory is responsible for creating instances of UI components and injecting dependencies into them.
  // It also handles defining custom elements in the DOM as needed.
  const componentFactory = new ComponentFactory(loggerFactory, _document, _customElementsRegistry, "ui");

  // Use local proxy
  const OLLAMA_ENDPOINT = "/ollama";
  const ANTHROPIC_ENDPOINT = "/anthropic";

  const platformRegistry = new PlatformRegistry(loggerFactory);
  const fetchFunction = globalThis.fetch.bind(globalThis);
  const getApiKey = (keyName: string) => () => localStorage.getItem(keyName) ?? "";
  platformRegistry.registerMany([
    new OllamaPlatform(loggerFactory, fetchFunction, getApiKey("ollama_api_key"), () => new OllamaStreamReader(), OLLAMA_ENDPOINT),
    // new AnthropicPlatform(loggerFactory, fetchFunction, getApiKey("anthropic_api_key"), () => new AnthropicStreamReader()),
    // new OpenAIPlatform(loggerFactory, fetchFunction, getApiKey("openai_api_key"), () => new OpenAIStreamReader()),
    // new GeminiPlatform(loggerFactory, fetchFunction, getApiKey("gemini_api_key"), () => new GeminiStreamReader()),
    // new MistralPlatform(loggerFactory, fetchFunction, getApiKey("mistral_api_key"), () => new MistralStreamReader()),
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

  const workbenchFactory: WorkbenchFactory = (ui: IUserInteraction) => {
    return new Workbench(
      ui,
      componentFactory,
      documentManager,
      documentManager,
      async (format: string) => await componentFactory.create(MarkdownEditor)
    )
  }

  const options: AppOptions = {
    global: globalThis,
    componentFactory,
    logger,
    chatSession,
    platformService: platformRegistry,
    chatStream: platformRegistry,
    toolService: toolRegistry,
    documentService: documentManager,
    workbenchFactory,
  };
  
  await App.create(options);
})();
