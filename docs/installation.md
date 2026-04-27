---
title: Installation
---

# Installation

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later
- One or more AI providers:
  - A running [Ollama](https://ollama.com) instance (local or on your network) — recommended for homelab use
  - OR an API key from a supported cloud provider (Anthropic, OpenAI, Gemini, or Mistral)

---

## Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/proseaic.git
cd proseaic
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` if needed — for most setups, the defaults work fine. See [Configuration](./configuration) for all options.

---

## Running

```bash
npm start
```

This builds the app once and starts the server. Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## Development Mode

For active development, use watch mode instead. It rebuilds automatically on file changes and keeps the server running:

```bash
npm run watch
```

---

## First-Time Setup

1. Open [http://localhost:3001](http://localhost:3001)
2. Open the **Settings** panel (gear icon in the menu bar)
3. Configure at least one AI platform — see [AI Platforms](./ai-platforms) for details
4. Start writing

---

## Docker (coming soon)

A Docker image is planned. For now, the Node.js setup above is the supported installation method.

---

## Ollama on a homelab

If you're running Ollama on a separate machine on your network, set the `OLLAMA_HOST` environment variable to point to it:

```
OLLAMA_HOST=http://192.168.1.100:11434
```

Then in ProseAiC Settings, set the Ollama endpoint to `/ollama` to route requests through the server proxy.

Alternatively, enter the Ollama host address directly in Settings if your browser can reach it (i.e., CORS is not a problem).
