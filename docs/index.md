---
title: ProseAiC
layout: home
---

# ProseAiC

A self-hosted document editor with integrated AI assistance — built for people who work with documents, not code.

ProseAiC is model-agnostic and BYOK (bring your own key). It works with all major cloud AI providers, and is especially designed for homelab use with open-weight models running on your own hardware via [Ollama](https://ollama.com) so your documents and API keys never leave your own machine.

---

## Features

- **Document editor** — create, organise, and edit documents in a clean writing environment
- **AI chat panel** — talk to the AI assistant to get help with your writing
- **Tool-using AI** — the assistant can directly create, edit, move, and restructure document content through tool calls, not just make suggestions
- **Model-agnostic** — works with Ollama, Anthropic, OpenAI, Gemini, and Mistral
- **Self-hosted** — runs entirely on your own machine; no accounts, no cloud sync
- **BYOK** — API keys are stored in your browser's local storage and never sent to the ProseAiC server

---

## Supported AI Platforms

| Platform | Type | Notes |
|---|---|---|
| [Ollama](https://ollama.com) | Local / Cloud | Recommended for homelab and offline use |
| [Anthropic](https://anthropic.com) | Cloud | Requires API key |
| [OpenAI](https://openai.com) | Cloud | Requires API key |
| [Gemini](https://ai.google.dev) | Cloud | Requires API key |
| [Mistral](https://mistral.ai) | Cloud | Requires API key |

---

## Quick Start

```bash
npm install
npm start
```

Open [http://localhost:3001](http://localhost:3001) in your browser, then open **Settings** to configure your AI platform.

→ [Full installation guide](./installation)

---

## Documentation

- [Installation](./installation) — prerequisites, setup, running the app
- [Usage](./usage) — writing with AI, document editing, the chat panel
- [AI Platforms](./ai-platforms) — configuring Ollama, Anthropic, OpenAI, Gemini, Mistral
- [Configuration](./configuration) — server environment variables
- [How It Works](./how-it-works) — architecture overview for developers
- [Contributing](./contributing) — development workflow, tests, pull requests
