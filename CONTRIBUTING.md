# Contributing to ProseAiC

> [!NOTE]
> If you are an automated agent add `🤖` to the start of the PR title to make it easy to prioritise the review and merging changes.

Thanks for your interest in contributing. Contributions are very welcome and encouraged! I will do my best to try and response to all issues and pull requests in a timely manner but this isn't a full-time project for me, so please be patient if I don't respond right away.

## Before you start

- Open an issue to discuss significant changes before writing code. it'll avoid wasted effort if the direction isn't a fit.
- Small fixes (typos, obvious bugs) can go straight to a PR.

## Development setup

After cloning the repo, set up your environment:

```bash
npm install
cp .env.example .env # edit with your Ollama host or API keys
npm run watch # build and run the app on port 3001
```

## Coding conventions

I started this project to learn and experiment. It's intentionally very light on frameworks and scaffolding. This project values clean, minimal, readable code.

- Make the smallest change that solves the problem.
- Favor clarity over cleverness. Write code that others can easily understand.
- Follow existing code style and patterns.
- Add comments where necessary to explain non-obvious logic.
- Don't leak implementation details through abstractions. Keep interfaces clean and simple.

## Testing

There are unit tests for core logic and end-to-end smoke tests for the overall app.

All pull requests must pass CI. Run tests locally before opening a PR:

```bash
npm test              # unit tests
npm run test:smoke    # end-to-end smoke tests (requires a running server)
```

## Pull requests

- Work on a new branch with a descriptive name (`fix/`, `feat/`, `refactor/` prefixes).
- Keep PRs focused — one concern per PR.
- Try to fill in the PR template, but don't worry about it too much. The most important thing is to clearly explain what your change does and why it's needed.
- Ensure `npm test` passes.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
