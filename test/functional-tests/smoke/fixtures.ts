import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: Error[] = [];
    page.on("pageerror", (err) => errors.push(err));
    await use(page);
    if (errors.length > 0) {
      throw new Error(`Uncaught page errors:\n${errors.map(e => e.message).join("\n")}`);
    }
  },
});

export { expect } from "@playwright/test";
