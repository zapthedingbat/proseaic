# ProseAiC

A self-hosted document editor with integrated AI assistance — built for people who work with documents, not code.

ProseAiC is model-agnostic and BYOK (bring your own key). It works with all major cloud AI providers, and is especially designed for homelab use with open-weight models running on your own hardware via [Ollama](https://ollama.com).

Your documents and API keys never leave your own machine.

---

## Features

- **Document editor** — create, organise, and edit documents in a clean writing environment
- **AI chat panel** — talk to the AI assistant to get help with your writing
- **Tool-using AI** — the assistant can directly create, edit, move, and restructure document content through tool calls, not just make suggestions
- **Model-agnostic** — supports Ollama, Anthropic, OpenAI, Gemini, and Mistral
- **Self-hosted** — runs entirely on your own machine; no accounts, no cloud sync
- **BYOK** — API keys are entered in the app and stored in your browser's local storage; they are never sent to the ProseAiC server

---

## Supported AI platforms

| Platform | Type | Notes |
|---|---|---|
| [Ollama](https://ollama.com) | Local | Default. Recommended for homelab and offline use |
| [Anthropic](https://anthropic.com) | Cloud | Requires API key |
| [OpenAI](https://openai.com) | Cloud | Requires API key |
| [Gemini](https://ai.google.dev) | Cloud | Requires API key |
| [Mistral](https://mistral.ai) | Cloud | Requires API key |

Ollama is the active default. To enable a cloud provider, uncomment the relevant platform registration in `src/browser/script.ts` and rebuild.

---

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later
- One or more of:
  - A running [Ollama](https://ollama.com) instance (local or on your network)
  - An API key from a supported cloud provider

---

## Getting started

```bash
git clone https://github.com/zapthedingbat/editor.git proseaic
cd proseaic
npm install
cp .env.example .env
```

Edit `.env` to point at your Ollama instance (or leave the default if Ollama is running locally on port 11434).

```bash
npm start
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

To enter an API key for a cloud provider, open the **Settings** panel inside the app. Keys are saved to your browser's local storage only.

---

## Configuration

Configuration is via environment variables in `.env`. See [.env.example](.env.example) for all options.

By default all AI platforms are called directly from the browser (CORS). The server-side proxy is an opt-in fallback — useful when the browser cannot reach the platform directly (e.g. Ollama on a homelab server, or to centralise request logging).

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | URL of your Ollama instance (used for direct access and as the proxy target) |
| `OLLAMA_TIMEOUT_MS` | — | Request timeout for Ollama (ms). Increase for slow hardware or large models |
| `OLLAMA_PROXY` | — | Set to `true` to route Ollama requests through the server proxy |
| `ANTHROPIC_PROXY` | — | Set to `true` to route Anthropic requests through the server proxy |
| `OPENAI_PROXY` | — | Set to `true` to route OpenAI requests through the server proxy |
| `GEMINI_PROXY` | — | Set to `true` to route Gemini requests through the server proxy |
| `MISTRAL_PROXY` | — | Set to `true` to route Mistral requests through the server proxy |
| `STORE_DIR` | `./store` | Directory where documents are stored on disk |

---

## Development

```bash
npm run watch        # build, watch for changes, and start the server
npm test             # unit tests
npm run test:smoke   # end-to-end smoke tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full contribution guidelines.

---

## License

[MIT](LICENSE)
