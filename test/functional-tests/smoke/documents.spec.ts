import { expect, test } from "./fixtures.js";
import { AppPage } from "./pages.js";

test.describe("Document creation", () => {
  test("creating a new document adds it to the documents panel and opens a tab", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    const countBefore = await app.documents.items().count();
    const tabsBefore = await app.tabBar.allTabs().count();

    await app.documents.createDocument();

    await expect(async () => {
      expect(await app.documents.items().count()).toBe(countBefore + 1);
    }).toPass({ timeout: 5000 });

    await expect(app.tabBar.allTabs().nth(tabsBefore)).toBeVisible();
  });
});

test.describe("Document navigation", () => {
  const DOC_A = `smoke-nav-a-${Date.now()}.md`;
  const DOC_B = `smoke-nav-b-${Date.now()}.md`;
  const CONTENT_A = "# Smoke Nav Doc A\n\nThis is document A content.";
  const CONTENT_B = "# Smoke Nav Doc B\n\nThis is document B content.";

  test.beforeAll(async ({ request }) => {
    await request.put(`/documents/${DOC_A}`, { data: CONTENT_A, headers: { "Content-Type": "text/markdown" } });
    await request.put(`/documents/${DOC_B}`, { data: CONTENT_B, headers: { "Content-Type": "text/markdown" } });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/documents/${DOC_A}`).catch(() => undefined);
    await request.delete(`/documents/${DOC_B}`).catch(() => undefined);
  });

  test("clicking a document in the panel opens it in the editor", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await app.documents.openDocument(DOC_A);

    await expect(app.tabBar.activeTab()).toContainText(DOC_A);
    await expect(async () => {
      expect(await app.editor.getRenderedText()).toContain("Smoke Nav Doc A");
    }).toPass({ timeout: 5000 });
  });

  test("switching tabs loads the correct document content", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await app.documents.openDocument(DOC_A);
    await app.documents.openDocument(DOC_B);
    await expect(app.tabBar.activeTab()).toContainText(DOC_B);

    await expect(async () => {
      expect(await app.editor.getRenderedText()).toContain("Smoke Nav Doc B");
    }).toPass({ timeout: 5000 });

    await app.tabBar.tab(DOC_A).click();
    await expect(app.tabBar.activeTab()).toContainText(DOC_A);
    await expect(async () => {
      expect(await app.editor.getRenderedText()).toContain("Smoke Nav Doc A");
    }).toPass({ timeout: 5000 });

    await app.tabBar.tab(DOC_B).click();
    await expect(app.tabBar.activeTab()).toContainText(DOC_B);
    await expect(async () => {
      expect(await app.editor.getRenderedText()).toContain("Smoke Nav Doc B");
    }).toPass({ timeout: 5000 });
  });

  test("clicking a document already open in a background tab makes it active", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await app.documents.openDocument(DOC_A);
    await app.documents.openDocument(DOC_B);
    await expect(app.tabBar.activeTab()).toContainText(DOC_B);

    await app.documents.openDocument(DOC_A);
    await expect(app.tabBar.activeTab()).toContainText(DOC_A);
    await expect(async () => {
      expect(await app.editor.getRenderedText()).toContain("Smoke Nav Doc A");
    }).toPass({ timeout: 5000 });
  });
});

test.describe("Document name conflict", () => {
  const BASE_NAME = `smoke-conflict-${Date.now()}`;
  const FIRST_DOC = `${BASE_NAME}.md`;
  const RESOLVED_DOC = `${BASE_NAME}-resolved.md`;

  test.beforeEach(async ({ request }) => {
    await request.put(`/documents/${FIRST_DOC}`, { data: "", headers: { "Content-Type": "text/markdown" } });
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/documents/${FIRST_DOC}`).catch(() => undefined);
    await request.delete(`/documents/${RESOLVED_DOC}`).catch(() => undefined);
  });

  test("renaming a new document to a taken name shows an error and allows retry", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await expect(async () => {
      const titles = await app.documents.pane().locator(".list-item-title").allTextContents();
      expect(titles).toContain(FIRST_DOC);
    }).toPass({ timeout: 5000 });

    await app.documents.createDocument();
    await expect(app.documents.renameInput()).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Control+a");
    await page.keyboard.type(FIRST_DOC);
    await page.keyboard.press("Enter");

    await expect(app.documents.renameInput()).toBeVisible({ timeout: 5000 });
    await expect(app.documents.renameError()).toBeVisible({ timeout: 5000 });
    await expect(app.documents.renameError()).toContainText("already exists");

    await page.keyboard.press("Control+a");
    await page.keyboard.type(RESOLVED_DOC);
    await page.keyboard.press("Enter");

    await expect(async () => {
      const titles = await app.documents.pane().locator(".list-item-title").allTextContents();
      expect(titles).toContain(RESOLVED_DOC);
    }).toPass({ timeout: 5000 });
  });
});
