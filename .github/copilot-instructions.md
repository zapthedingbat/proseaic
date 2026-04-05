# Copilot Instructions for This Repository

Keep code clean, simple, and highly readable.

## Core Preferences

- Prefer straightforward implementations over defensive or speculative abstractions.
- Minimize cyclomatic complexity.
- Use the fewest branches and moving parts needed to satisfy the requirement.
- Favor direct API usage over compatibility fallbacks unless compatibility is explicitly requested.
- Do not add extra guards for old browsers, legacy runtimes, or edge cases unless requested.
- Do not introduce optional layers, wrappers, or helper functions unless they clearly reduce complexity.
- Keep functions short and focused.
- Keep naming clear and literal.
- Avoid clever patterns when a simple explicit approach works.

## Change Scope

- Make the smallest change that solves the asked problem.
- Avoid unrelated refactors.
- Do not "harden" code beyond the requested behavior.
- Do not add extra telemetry/logging/debug code unless requested.

## Communication

- When proposing a solution, choose the simplest valid option first.
- If there is a tradeoff, briefly explain it, but default to the simpler path.
