---
name: update-docs
description: "Update project documentation in the docs/ directory to reflect code changes. Use when: docs are out of date, adding a new feature, changing a command, updating an API, modifying configuration, adding an AI platform, or after any change that affects how the app is used, installed, or developed. Keeps the GitHub Pages documentation accurate and consistent with the codebase."
argument-hint: "What changed? (e.g. 'added new build command', 'new AI platform', 'changed port', 'new tool')"
---

# Update Docs

Keep the `docs/` directory accurate and consistent with the codebase. These files are published as the project's GitHub Pages site.

## Documentation Files

| File | Covers |
|------|--------|
| [docs/index.md](../../../docs/index.md) | Overview, features, supported platforms, quick start |
| [docs/installation.md](../../../docs/installation.md) | Prerequisites, setup steps, running the app, homelab setup |
| [docs/usage.md](../../../docs/usage.md) | The UI, document editing, AI chat, what the AI can do |
| [docs/ai-platforms.md](../../../docs/ai-platforms.md) | Configuring Ollama, Anthropic, OpenAI, Gemini, Mistral |
| [docs/configuration.md](../../../docs/configuration.md) | Server environment variables, .env reference |
| [docs/how-it-works.md](../../../docs/how-it-works.md) | Architecture, server, frontend services, tools, data flow |
| [docs/contributing.md](../../../docs/contributing.md) | Dev setup, coding conventions, tests, PR workflow, extending the app |

## Procedure

### 1. Identify What Changed

If an argument was provided, use that as the starting point. Otherwise, check recent changes:
- Run `git diff HEAD~1 --name-only` to see recently modified files
- Or ask the user what they changed

### 2. Determine Which Docs Are Affected

Map the change to documentation:

| Change type | Likely affected docs |
|------------|----------------------|
| New npm script / changed command | `installation.md`, `contributing.md`, `index.md` |
| New AI platform / provider | `index.md` (platforms table), `ai-platforms.md` |
| New feature | `index.md` (features list), `usage.md` |
| New AI tool | `usage.md` (tools table), `how-it-works.md` (tools table) |
| Changed port or server behaviour | `installation.md`, `configuration.md` |
| New or changed env var | `configuration.md` |
| Changed architecture or services | `how-it-works.md` |
| Changed contribution process or conventions | `contributing.md` |
| Changed test commands | `contributing.md` |

### 3. Read the Affected Docs

Read each affected file fully before editing. Understand the current state and what is now inaccurate.

### 4. Verify Against Code

Before writing, verify the correct values from the source:
- Check `package.json` `scripts` for correct command names
- Check `.env.example` for all env vars and their defaults
- Check `src/browser/platform/` for the complete list of supported AI platforms
- Check `src/browser/tools/` for the complete list of AI tools
- Check `src/server/routes/proxy.js` for proxy routes

### 5. Update the Docs

Make the minimum change needed:
- Correct factual errors (wrong command names, outdated steps, missing platforms or tools)
- Update tables and lists to match the current state of the code
- Keep the existing tone and structure — do not rewrite or restructure sections
- Do not add new sections unless the content genuinely requires it

### 6. Check Consistency

After editing, confirm the same fact is consistent across all docs. Common consistency points:
- Port number (currently 3001)
- npm command names (`npm run watch`, `npm run test:smoke`, etc.)
- Supported platforms list (Ollama, Anthropic, OpenAI, Gemini, Mistral)
- Proxy route paths (`/ollama`, `/anthropic`, `/openai`, `/gemini`, `/mistral`)
- Branch naming conventions (`fix/`, `feat/`, `refactor/`)

### 7. Verify

Re-read each edited file and confirm:
- All changed facts are now accurate
- No unrelated edits were made
- Formatting matches the rest of the file (headings, code blocks, tables)
