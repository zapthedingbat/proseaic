# ProseAiC

A self-hosted document editor with integrated AI assistance. Built for people who work with documents not just code.

ProseAiC is model-agnostic and BYOK (bring your own key). It works with all major cloud AI providers, and is especially designed for homelab use with open-weight models running on your own hardware via [Ollama](https://ollama.com) so your documents and API keys don't have to leave your network.

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
| [Ollama](https://ollama.com) | Local / Cloud | Recommended for homelab and offline use |
| [Anthropic](https://anthropic.com) | Cloud | Requires API key |
| [OpenAI](https://openai.com) | Cloud | Requires API key |
| [Gemini](https://ai.google.dev) | Cloud | Requires API key |
| [Mistral](https://mistral.ai) | Cloud | Requires API key |

To enable cloud providers, enter your API key and endpoint URL in the chat settings. For self-hosted environments proxy endpoints can be configured in the server's `.env` file so that requests are forwarded to the correct destination through the server.

---

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later
- One or more of:
  - A running [Ollama](https://ollama.com) instance (local or on your network)
  - An API key from a supported cloud provider

---

## Getting started

After cloning the repo, set up your environment:

```bash
npm install
cp .env.example .env
```

Edit `.env` to point at your Ollama instance (or leave the default if Ollama is running locally on port 11434).

```bash
npm start
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

Open the **Settings** panel to configure your AI platforms

Enter the endpoint URL and API key for each provider you want to use.

Settings are saved to your browser's local storage and never sent to the server.

For **Ollama**, the default endpoint is `https://ollama.com` (their hosted platform). To use a local or homelab instance, enter its address directly in Settings (e.g. `http://localhost:11434`) — or set the endpoint to `/ollama` to route requests through the server proxy.

---

## Server configuration

Server behaviour is configured via environment variables in `.env`. See [.env.example](.env.example) for all options.

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_HOST` | `https://ollama.com` | Where the server proxy forwards Ollama requests (used when endpoint is set to `/ollama` in Settings) |
| `OLLAMA_TIMEOUT_MS` | — | Request timeout for Ollama (ms). Useful for slow hardware or large models |
| `STORE_DIR` | `./documents` | Directory where documents are stored on disk |

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
