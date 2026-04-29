# Browser Smoke Tests

These tests verify that the app boots and core UI interactions still work after refactors.

## Run

- `npm run test:smoke`
- `npm run test:smoke:headed`

## Structure

Tests are split by feature area. Each spec imports `AppPage` and its sub-page-objects from `pages.ts` rather than using raw locators directly.

| File | Covers |
|------|--------|
| `app-shell.spec.ts` | App loads, layout visible, settings panel |
| `documents.spec.ts` | Create, open, navigate, name conflict |
| `editing.spec.ts` | Type content, save to server |
| `outline.spec.ts` | Outline panel: headings, empty state, live update |
| `tools.spec.ts` | AI tool-call regression (requires Ollama) |

## Page objects

`pages.ts` exports one class per major UI area (`DocumentsPanelPage`, `OutlinePanelPage`, `ChatPanelPage`, `TabBarPage`, `EditorPage`, `MenuBarPage`) and a top-level `AppPage` that composes them. Add new selectors here so that changing a selector only requires one edit.

## Scope

Keep smoke tests small and stable:

- App loads and main layout mounts
- Core controls are present (menus, panes, tab bar)
- One click path per critical feature

## Guidelines

1. Add new tests to the matching feature spec, or create a new `*.spec.ts` for a distinct area.
2. Update `pages.ts` when selectors or element structure changes — not the spec files.
3. Keep selectors semantic (role/title/text/data-attribute) where possible.
4. Avoid brittle style/layout assertions unless visual regressions are the goal.
