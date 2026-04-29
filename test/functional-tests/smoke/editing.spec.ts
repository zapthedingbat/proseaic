import { expect, test } from "./fixtures.js";
import { AppPage } from "./pages.js";

test.describe("Editing", () => {
  const DOC_NAME = `smoke-edit-${Date.now()}.md`;

  test.beforeAll(async ({ request }) => {
    await request.put(`/documents/${DOC_NAME}`, { data: "", headers: { "Content-Type": "text/markdown" } });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/documents/${DOC_NAME}`).catch(() => undefined);
  });

  test("user can type content into an open document", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await app.documents.openDocument(DOC_NAME);
    await expect(app.tabBar.activeTab()).toContainText(DOC_NAME, { timeout: 5000 });

    await app.editor.type("Hello from smoke test");

    await expect(async () => {
      expect(await app.editor.getContent()).toContain("Hello from smoke test");
    }).toPass({ timeout: 3000 });
  });

  test("saving a document persists content to the server", async ({ page, request }) => {
    const SAVE_DOC = `smoke-save-${Date.now()}.md`;
    await request.put(`/documents/${SAVE_DOC}`, { data: "", headers: { "Content-Type": "text/markdown" } });

    try {
      const app = new AppPage(page);
      await app.goto();

      await app.documents.openDocument(SAVE_DOC);
      await expect(app.tabBar.activeTab()).toContainText(SAVE_DOC, { timeout: 5000 });

      const uniqueContent = `Saved content ${Date.now()}`;
      await app.editor.type(uniqueContent);

      await expect(async () => {
        expect(await app.editor.getContent()).toContain(uniqueContent);
      }).toPass({ timeout: 3000 });

      await app.menuBar.save().click();

      await expect(async () => {
        const response = await request.get(`/documents/${SAVE_DOC}`);
        expect(await response.text()).toContain(uniqueContent);
      }).toPass({ timeout: 5000 });
    } finally {
      await request.delete(`/documents/${SAVE_DOC}`).catch(() => undefined);
    }
  });
});
