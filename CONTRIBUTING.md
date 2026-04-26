# Contributing to ProseAiC

Thanks for your interest in contributing.

## Before you start

- Open an issue to discuss significant changes before writing code — it avoids wasted effort if the direction isn't a fit.
- Small fixes (typos, obvious bugs) can go straight to a PR.

## Development setup

```bash
git clone https://github.com/zapthedingbat/editor.git proseaic
cd proseaic
npm install
cp .env.example .env   # edit with your Ollama host or API keys
npm run watch          # build + hot reload + server on port 3001
```

## Coding conventions

This project values clean, minimal, readable code. The full guidelines are in [AGENTS.md](AGENTS.md) — please read it before contributing. Key points:

- Make the smallest change that solves the problem.
- Prefer explicit, simple code over clever abstractions.
- No speculative features, guards, or future-proofing.
- Default to writing no comments; add one only when the *why* is non-obvious.

## Testing

All pull requests must pass CI. Run tests locally before opening a PR:

```bash
npm test              # unit tests
npm run test:smoke    # end-to-end smoke tests (requires a running server)
```

## Pull requests

- Work on a new branch with a descriptive name (`fix/`, `feat/`, `refactor/` prefixes).
- Keep PRs focused — one concern per PR.
- Fill in the PR template.
- Ensure `npm test` passes.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
