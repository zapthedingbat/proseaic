# Browser Smoke Tests

These tests verify that the app boots and core UI interactions still work after refactors.

## Run

- `npm run test:smoke`
- `npm run test:smoke:headed`

## Scope

Keep smoke tests small and stable:

- App loads and main layout mounts
- Core controls are present (menus, panes, tab bar)
- One click path per critical feature (settings open/close, create document)

## Extending

When adding new functionality:

1. Add one assertion in `app-smoke.spec.ts` if it fits the existing boot path.
2. Add a new `*.spec.ts` file for distinct flows (e.g. chat submission, rename/delete document).
3. Keep selectors semantic (role/title/text) where possible.
4. Avoid brittle style/layout assertions unless visual regressions are the goal.
