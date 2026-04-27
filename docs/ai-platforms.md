---
title: AI Platforms
---

# AI Platforms

ProseAiC is model-agnostic. You can use any combination of the supported platforms — switch between them at any time from the model dropdown in the chat panel.

Configure platforms in **Settings** (gear icon in the menu bar). Settings are saved to your browser's local storage and never sent to the server.

---

## Ollama

**Recommended for homelab and offline use.**

Ollama lets you run open-weight models (such as Llama, Mistral, Gemma, Qwen, etc.) locally on your own hardware. Your documents and API keys never leave your machine.

### Local Ollama (same machine)

If Ollama is running on the same machine as your browser:

1. Set the endpoint to `http://localhost:11434`
2. Leave the API key blank

### Local Ollama (via server proxy)

If Ollama is on the same machine as the ProseAiC **server** but not reachable from your browser directly:

1. Set the endpoint to `/ollama`
2. Set the `OLLAMA_HOST` environment variable to the address of your Ollama instance
3. Leave the API key blank

The server will proxy requests to Ollama on your behalf.

### Remote Ollama (homelab)

If Ollama is on a separate machine on your network and reachable from your browser:

1. Set the endpoint to the machine's address, e.g. `http://192.168.1.100:11434`
2. Leave the API key blank

If your browser can't reach it directly (e.g., CORS issues), use the `/ollama` proxy approach instead and set the `OLLAMA_HOST` environment variable to the machine's address.

### Ollama.com (hosted)

Ollama also offers a hosted cloud service. To use it:

1. Set the endpoint to `https://ollama.com`
2. Enter your Ollama API key

---

## Anthropic

1. Obtain an API key from [console.anthropic.com](https://console.anthropic.com)
2. In Settings, set the endpoint to `https://api.anthropic.com`
3. Enter your API key
4. Choose a Claude model from the dropdown

---

## OpenAI

1. Obtain an API key from [platform.openai.com](https://platform.openai.com)
2. In Settings, set the endpoint to `https://api.openai.com`
3. Enter your API key
4. Choose a GPT model from the dropdown

### OpenAI-compatible APIs

The OpenAI endpoint can be pointed at any OpenAI-compatible API (e.g., a local LLM server). Set the endpoint to the base URL of your API instead.

---

## Gemini

1. Obtain an API key from [aistudio.google.com](https://aistudio.google.com)
2. In Settings, set the endpoint to `https://generativelanguage.googleapis.com`
3. Enter your API key
4. Choose a Gemini model from the dropdown

---

## Mistral

1. Obtain an API key from [console.mistral.ai](https://console.mistral.ai)
2. In Settings, set the endpoint to `https://api.mistral.ai`
3. Enter your API key
4. Choose a Mistral model from the dropdown

---

## Proxy endpoints for cloud providers

For advanced setups (e.g., routing cloud API requests through the server), you can override the default endpoint for each cloud provider using environment variables:

```
ANTHROPIC_HOST=https://api.anthropic.com
OPENAI_HOST=https://api.openai.com
GEMINI_HOST=https://generativelanguage.googleapis.com
MISTRAL_HOST=https://api.mistral.ai
```

Then set the endpoint in Settings to `/anthropic`, `/openai`, `/gemini`, or `/mistral` to route requests through the server proxy.
