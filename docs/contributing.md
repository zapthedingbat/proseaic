---
title: Contributing
---

# Contributing

Contributions are welcome. This page covers everything you need to get started.

---

## Before You Start

- **Significant changes** — open an issue to discuss the direction before writing code. It'll avoid wasted effort if it's not a fit.
- **Small fixes** (typos, obvious bugs) — can go straight to a PR.

---

## Development Setup

```bash
git clone https://github.com/yourusername/proseaic.git
cd proseaic
npm install
# set environment variables as needed (see docs/configuration)
npm run watch         # build and run on port 3001
```

Open [http://localhost:3001](http://localhost:3001). Changes to source files trigger an automatic rebuild — reload the page to see them.

---

## Project Structure

```
src/
  browser/        # TypeScript frontend (nearly all logic lives here)
    agents/       # AI agent system prompts and configurations
    components/   # Web Components (UI)
    lib/          # Core services (chat, documents, configuration, platforms)
    platform/     # Per-platform AI API implementations
    tools/        # AI tool definitions
  server/         # Thin Express server
    routes/       # Static assets, document storage, proxy routes
scripts/          # Build script (esbuild)
test/             # Unit and E2E tests
docs/             # This documentation (GitHub Pages)
```

See [How It Works](./how-it-works) for a deeper architecture walkthrough.

---

## Coding Conventions

This project values clean, minimal, readable code.

- Make the smallest change that solves the problem.
- Favour clarity over cleverness.
- Follow the existing code style and patterns.
- Keep functions short and focused.
- Add comments where they clarify non-obvious intent — not to explain obvious code.
- Avoid speculative abstractions or helpers that aren't immediately needed.
- Don't add guards for edge cases that can't happen.

---

## Testing

```bash
npm test                   # unit tests (vitest + jsdom)
npm run test:smoke         # Playwright end-to-end tests (headless)
npm run test:smoke:headed  # Playwright end-to-end tests (with browser UI)
```

The smoke tests require the server to be running. Start it with `npm run watch` or `npm start` first.

All pull requests must pass CI. Run both test suites locally before opening a PR.

---

## Workflow

1. **Create a branch** from `main` with a descriptive name:
   - `fix/spelling-in-chat-panel`
   - `feat/add-export-function`
   - `refactor/simplify-document-manager`

2. **Make your changes** on the branch.

3. **Run the tests**:
   ```bash
   npm test
   npm run test:smoke
   ```

4. **Open a pull request** with a clear description of:
   - What problem this solves
   - How you approached it
   - Any relevant context (screenshots, test results, related issues)

> If you are an automated agent, add `🤖` to the start of the PR title.

---

## Adding an AI Platform

1. Create a folder at `src/browser/platform/<name>/`
2. Implement the three required files:
   - `<name>-platform.ts` — platform registration and model listing
   - `<name>-request.ts` — build the API request payload
   - `<name>-stream-reader.ts` — parse the streaming response
3. Register the platform with the platform service
4. Add the proxy route to `src/server/routes/proxy.js` and a corresponding env var

Look at an existing platform (e.g., `src/browser/platform/mistral/`) for the pattern to follow.

---

## Adding an AI Tool

1. Create a file at `src/browser/tools/<tool-name>.ts`
2. Implement and export the tool definition (name, description, parameters, handler)
3. Register it with the writing assistant in `src/browser/agents/writing-assistant.ts`

Look at existing tools in `src/browser/tools/` for the pattern.

---

## License

By contributing you agree that your changes will be licensed under the [MIT License](../LICENSE).
