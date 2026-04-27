---
title: Configuration
---

# Configuration

Server behaviour is configured via environment variables. All variables are optional — the server runs with sensible defaults if none are set.

---

## Environment Variables

### Document storage

| Variable | Default | Description |
|---|---|---|
| `STORE_DIR` | `./documents` | Directory where documents are stored on disk |

Documents are stored as Markdown files in this directory. You can point `STORE_DIR` at an existing folder to use documents you've already written.

### Ollama proxy

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_HOST` | `https://ollama.com` | Address of the Ollama instance to proxy requests to |
| `OLLAMA_TIMEOUT_MS` | _(none)_ | Request timeout in milliseconds. Increase for slow hardware or large models |

These only apply when the Ollama endpoint in Settings is set to `/ollama`.

### Cloud provider proxies

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_HOST` | `https://api.anthropic.com` | Proxy target for Anthropic requests |
| `OPENAI_HOST` | `https://api.openai.com` | Proxy target for OpenAI requests |
| `GEMINI_HOST` | `https://generativelanguage.googleapis.com` | Proxy target for Gemini requests |
| `MISTRAL_HOST` | `https://api.mistral.ai` | Proxy target for Mistral requests |

These only apply when the corresponding endpoint in Settings is set to the server proxy path (e.g., `/openai`). Useful for routing through a local OpenAI-compatible API or for network environments that require a proxy.

---

## Example

```
OLLAMA_HOST=http://192.168.1.100:11434
OLLAMA_TIMEOUT_MS=60000
STORE_DIR=/home/user/documents
```

---

## API keys

API keys are not set as environment variables. They are entered in the Settings panel inside the app and saved to your browser's local storage. They are never sent to the ProseAiC server.
