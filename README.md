This application is a document editor with integrated AI assistance. The user can talk to the AI assistant through a chat panel. The AI can help with a variety of document editing tasks, such as structuring documents, generating or modifying content, or making editorial or proofing suggestions.

## Architecture

This project is structured around a modular design, separating concerns into distinct layers:

**Layers:**

- `src/browser/components/` — Custom web components (chat panel, markdown editor, outline panel, etc.). All extend `BaseHtmlElement`.
- `src/browser/lib/` — Core services: `ChatSession` (agent loop), `DocumentManager` (storage abstraction), `ToolRegistry`, `PlatformRegistry`, `Workbench` (editor tabs/state), `ComponentFactory` (dependency injection).
- `src/browser/platform/` — Pluggable LLM providers: Ollama, Anthropic, OpenAI, Gemini, Mistral. Each implements `IPlatform`. Switching providers is done in `src/browser/script.ts`.
- `src/browser/tools/` — AI-accessible document editing tools (insert/remove/move/replace sections, read outline, list/open/create documents, etc.). Each tool defines a JSON schema plus an `execute` method.
- `src/server/routes/store.js` — WebDAV-like REST endpoints for document persistence, backed by `./store/` on disk.

**Initialization flow** (`src/browser/script.ts`):
Bootstrap wires up a `ComponentFactory` (DI container), creates platform/chat/document/workbench services, instantiates `App`, mounts to DOM, and registers tools.

**Agent loop** (`src/browser/lib/chat/`):
`ChatSession` submits history to the LLM, streams the response, collects tool calls, executes each tool with the current document context, appends results to history, and loops until no more tool calls are returned.

**Document storage:**
`DocumentManager` abstracts over multiple backends. The active backend is `WebDAVDocumentStore`, which proxies to `/store` on the Express server. ETags provide optimistic concurrency control.