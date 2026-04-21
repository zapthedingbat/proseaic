# Copilot Instructions for This Repository

This application is a document editor with integrated AI assistance. The user can talk to the AI assistant through a chat panel. The AI can help with a variety of document editing tasks, such as structuring documents, generating or modifying content, or making editorial or proofing suggestions.

Keep code clean, simple, and highly readable.

## Problem solving guidelines:

When addressing a problem start by debugging and diagnosing the issue. Add tests, logging, or temporary debug code as needed to understand the flow and identify the root cause. Do not make any code changes until you have a clear understanding of the problem, and ideally can reproduce it. Do not rely on 'tracing' code paths in your head or making assumptions about how the code works. Use actual data, tests, and logging to verify your understanding.

Remove unnecessary code, logging, or tests after diagnosing the issue. Do not add extra code or abstractions to 'future proof' against hypothetical issues or edge cases that are not currently relevant.

## Core Preferences

- Prefer straightforward implementations over defensive or speculative abstractions.
- Favor clean, minimal code over preserving backward compatibility unless compatibility is explicitly requested.
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
- Add simple logging/debug code when it helps understand the flow or diagnose issues.
- Add comments when they clarify intent or non-obvious decisions, but do not over-comment obvious code.
- NEVER add 'helpers' or 'utilities' unless they are directly related to the requested change and clearly reduce complexity.
- if a change is purely additive it's likely out of scope. Use your judgement and err on the side of minimalism.

## Communication

- When proposing a solution, choose the simplest valid option first.
- If there is a tradeoff, briefly explain it, but default to the simpler path.
- Highlight any bad practices, anti-patterns, code smells, or potential issues in the existing code when you encounter them, but do not attempt to fix them unless they are directly related to the requested change.
