import { expect, test } from "./fixtures.js";
import { AppPage } from "./pages.js";

test.describe("Outline panel", () => {
  const HEADINGS_DOC = `smoke-outline-${Date.now()}.md`;
  const HEADINGS_CONTENT = [
    "# Top Level Heading",
    "",
    "Some body text.",
    "",
    "## Second Level Heading",
    "",
    "More content.",
    "",
    "### Third Level Heading",
    "",
    "Even more content.",
  ].join("\n");

  test.beforeAll(async ({ request }) => {
    await request.put(`/documents/${HEADINGS_DOC}`, { data: HEADINGS_CONTENT, headers: { "Content-Type": "text/markdown" } });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/documents/${HEADINGS_DOC}`).catch(() => undefined);
  });

  test("headings in a document appear in the outline panel", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await app.documents.openDocument(HEADINGS_DOC);
    await expect(app.tabBar.activeTab()).toContainText(HEADINGS_DOC, { timeout: 5000 });

    await expect(async () => {
      expect(await app.editor.getRenderedText()).toContain("Top Level Heading");
    }).toPass({ timeout: 5000 });

    await expect(async () => {
      const titles = await app.outline.itemTitles().allTextContents();
      expect(titles).toContain("Top Level Heading");
      expect(titles).toContain("Second Level Heading");
      expect(titles).toContain("Third Level Heading");
    }).toPass({ timeout: 5000 });
  });

  test("outline panel shows empty state for a document with no headings", async ({ page, request }) => {
    const PLAIN_DOC = `smoke-outline-plain-${Date.now()}.md`;
    await request.put(`/documents/${PLAIN_DOC}`, {
      data: "This document has no headings, just body text.",
      headers: { "Content-Type": "text/markdown" },
    });

    try {
      const app = new AppPage(page);
      await app.goto();

      await app.documents.openDocument(PLAIN_DOC);
      await expect(app.tabBar.activeTab()).toContainText(PLAIN_DOC, { timeout: 5000 });

      await expect(async () => {
        expect(await app.editor.getRenderedText()).toContain("no headings");
      }).toPass({ timeout: 5000 });

      await expect(app.outline.emptyState()).toBeVisible({ timeout: 5000 });
    } finally {
      await request.delete(`/documents/${PLAIN_DOC}`).catch(() => undefined);
    }
  });

  test("outline panel updates when content changes", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await app.documents.openDocument(HEADINGS_DOC);
    await expect(app.tabBar.activeTab()).toContainText(HEADINGS_DOC, { timeout: 5000 });

    await expect(async () => {
      const titles = await app.outline.itemTitles().allTextContents();
      expect(titles).toContain("Top Level Heading");
    }).toPass({ timeout: 5000 });

    await app.editor.focusEnd();
    const newHeading = `New Heading ${Date.now()}`;
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`## ${newHeading}`);

    await expect(async () => {
      const titles = await app.outline.itemTitles().allTextContents();
      expect(titles).toContain(newHeading);
    }).toPass({ timeout: 5000 });
  });
});
