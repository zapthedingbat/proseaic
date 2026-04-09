import { App } from "./app.js";

// Bootstrap the application. This isn't covered by tests.
(async function initialize(): Promise<void> {
  await App.create();
})();
