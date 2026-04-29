import { test as base, expect } from "@playwright/test";

const AI_PROXY_ROUTES = ["/ollama/**", "/anthropic/**", "/openai/**", "/gemini/**", "/mistral/**"];

export const test = base.extend({
  page: async ({ page }, use) => {
    for (const route of AI_PROXY_ROUTES) {
      await page.route(route, (r) => r.fulfill({ status: 503, body: "AI platform unavailable in test environment" }));
    }

    const errors: Error[] = [];
    page.on("pageerror", (err) => errors.push(err));
    await use(page);
    if (errors.length > 0) {
      throw new Error(`Uncaught page errors:\n${errors.map(e => e.message).join("\n")}`);
    }
  },
});

export { expect } from "@playwright/test";
