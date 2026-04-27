---
title: How It Works
---

# How It Works

This page describes ProseAiC's architecture at a high level — useful if you want to understand or contribute to the codebase.

---

## Overview

ProseAiC is split into two layers:

- **Server** (`src/server/`) — a thin Express.js application. Its only jobs are to serve the frontend, store documents on disk, and optionally proxy AI platform requests.
- **Browser** (`src/browser/`) — TypeScript frontend where nearly all application logic lives. Bundled with esbuild into `dist/browser/script.js`.

---

## Server

The server runs on port 3001 and has three routes:

| Route | Purpose |
|---|---|
| `/` | Serves the static frontend assets |
| `/documents` | WebDAV-like API for reading and writing document files |
| `/ollama`, `/anthropic`, `/openai`, `/gemini`, `/mistral` | Proxy endpoints for AI platforms |

The proxy endpoints exist to work around CORS restrictions and to allow routing through a private network. They are optional — the browser can also call AI platform APIs directly.

---

## Frontend Architecture

### Entry point

`src/browser/app.ts` is the main application class. It creates the UI components, wires them together, and initialises the core services.

### Core services

| Service | File | Responsibility |
|---|---|---|
| Workbench | `lib/workbench.ts` | Coordinates open tabs, editor instances, document state, and persistence |
| Document Manager | `lib/document/document-manager.ts` | Document lifecycle: open, save, rename, close; dirty state tracking |
| Chat Manager | `lib/chat/chat-service.ts` | Manages chat sessions |
| Platform Service | `lib/platform/` | Manages the available AI platform implementations |
| Configuration Service | `lib/configuration/configuration-service.ts` | Reads and writes settings from browser local storage |

### UI Components

UI is built with Web Components (extending a `BaseHtmlElement` base class):

| Component | File | Role |
|---|---|---|
| Chat Panel | `components/chat-panel.ts` | Chat interface, model selector, message history |
| Document Panel | `components/document-panel.ts` | Document editing area |
| Markdown Editor | `components/markdown-editor.ts` | Primary editor |
| Outline Panel | `components/outline-panel.ts` | Document structure navigation |
| Tab Bar | `components/tab-bar.ts` | Open document tabs |
| Menu Bar | `components/menu-bar.ts` | Top-level actions |
| Settings Panel | `components/settings-panel.ts` | Platform configuration |
| Pane / Pane View | `components/pane.ts`, `pane-view.ts` | Layout containers |

### AI Platforms

Each supported AI platform has its own implementation in `src/browser/platform/<name>/`:

- `<name>-platform.ts` — platform registration and model listing
- `<name>-request.ts` — builds the API request
- `<name>-stream-reader.ts` — parses the streaming response

Adding a new platform means adding a folder here and registering it with the platform service.

### AI Tools

The AI assistant can call tools to read and write documents. Tools are defined in `src/browser/tools/`:

| Tool | File | What it does |
|---|---|---|
| `create_document` | `create-document.ts` | Create a new document |
| `list_documents` | `list-documents.ts` | List all documents |
| `open_document` | `open-document.ts` | Open a document in the editor |
| `rename_document` | `rename-document.ts` | Rename or move a document |
| `read_document_outline` | `read-document-outline.ts` | Read the heading structure |
| `read_document_section` | `read-document-section.ts` | Read a section's content |
| `insert_document_section` | `insert-document-section.ts` | Insert a new section |
| `replace_document_section` | `replace-document-section.ts` | Replace a section's content |
| `remove_document_section` | `remove-document-section.ts` | Delete a section |
| `move_document_section` | `move-document-section.ts` | Move a section to another position |
| `replace_selection` | `replace-selection.ts` | Replace the current editor selection |
| `task_complete` | `task-complete.ts` | Signal that tool work is done |

### Writing Assistant Agent

`src/browser/agents/writing-assistant.ts` defines the system prompt and tool configuration for the AI. It enforces a read-before-write workflow:

1. Call `read_document_outline` to understand the document structure
2. Call `read_document_section` to read specific content before editing it
3. Call edit tools to make changes
4. Call `task_complete` when done

The system prompt instructs the assistant to always write content into documents using tools — never as plain text in its response.

---

## Build System

The build script (`scripts/script.mjs`) uses esbuild to:

1. Bundle `src/browser/script.ts` and its dependencies into `dist/browser/script.js`
2. Copy static assets (HTML, CSS, icons) to `dist/browser/`

Watch mode rebuilds on any source file change. The server picks up the new bundle on the next page load.

---

## Data Flow: AI Edit Request

A typical AI document edit follows this path:

```
User types in chat
  → ChatPanel sends message to ChatManager
    → ChatManager sends request to AI platform (streaming)
      → AI calls read_document_outline tool
        → DocumentManager reads current document structure
      → AI calls read_document_section tool (if needed)
        → DocumentManager reads section content
      → AI calls replace_document_section tool
        → DocumentManager applies the edit to the in-memory document
        → Editor re-renders
      → AI calls task_complete
    → ChatManager streams final response back to ChatPanel
  → User sees result in chat + updated document
```
