import { TextEditor } from "./components/text-editor.js";
import { ChatPanel } from "./components/chat-panel.js";
import { DocumentPanel } from "./components/document-panel.js";
import { App } from "./App.js";

function registerCustomElements(registry: CustomElementRegistry): void {
  if (!registry.get("text-editor")) {
    registry.define("text-editor", TextEditor);
  }
  if (!registry.get("chat-panel")) {
    registry.define("chat-panel", ChatPanel);
  }
  if (!registry.get("document-panel")) {
    registry.define("document-panel", DocumentPanel);
  }
}

async function initialize(): Promise<void> {
  registerCustomElements(customElements);

  const app = await App.create({
    documentRef: window.document,
    storage: window.localStorage,
    fetchFn: window.fetch?.bind(window),
    promptFn: window.prompt?.bind(window),
    alertFn: window.alert?.bind(window),
    logger: window.console
  });

  await app.initialize();
}

window.addEventListener("DOMContentLoaded", initialize);
