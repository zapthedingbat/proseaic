import { expect, test, type Page } from "./fixtures";

class AppSmokePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  header = {
    save: () => this.page.locator('button[data-app-action="save"]'),
    saveAs: () => this.page.locator('button[data-app-action="save-as"]'),
  };

  panes = {
    documents: () => this.page.locator("ui-pane", { hasText: "Documents" }),
    outline: () => this.page.locator("ui-pane", { hasText: "Outline" }),
    chat: () => this.page.locator("ui-pane", { hasText: "Chat" }),
  };

  async openSettings(): Promise<void> {
    await this.panes.chat().locator('button[title="Settings"]').click();
  }

  async closeSettings(): Promise<void> {
    await this.page.getByRole("button", { name: "✕" }).click();
  }

  async createDocument(): Promise<void> {
    await this.panes.documents().locator('button[title="New document"]').click();
  }

  documentItem(title: string) {
    return this.panes.documents().locator(".list-item-title", { hasText: title });
  }

  tab(title: string) {
    return this.page.locator(`ui-tab-bar [role="tab"]`, { hasText: title });
  }

  activeTab() {
    return this.page.locator(`ui-tab-bar [role="tab"][aria-selected="true"]`);
  }
}

async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = document.querySelector("ui-markdown-editor");
    return (editor as { getContent?(): string } | null)?.getContent?.() ?? "";
  });
}

async function getEditorRenderedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = document.querySelector("ui-markdown-editor");
    if (!editor?.shadowRoot) return "";
    const editorPage = editor.shadowRoot.querySelector("#editor-page") as HTMLElement | null;
    return editorPage?.textContent ?? "";
  });
}

test.describe("Editor smoke", () => {
  test("loads shell and primary interactions", async ({ page }) => {
    const app = new AppSmokePage(page);

    await app.goto();

    await expect(app.header.save()).toBeVisible();
    await expect(app.header.saveAs()).toBeVisible();

    await expect(app.panes.documents()).toBeVisible();
    await expect(app.panes.outline()).toBeVisible();
    await expect(app.panes.chat()).toBeVisible();

    await expect(page.locator("ui-chat-panel #chat-textarea")).toBeVisible();

    await app.openSettings();
    await expect(page.locator("#ui-settings-panel")).toBeVisible();
    await app.closeSettings();

    const tabsBefore = await page.locator('ui-tab-bar [role="tab"]').count();
    await app.createDocument();
    await expect(page.locator('ui-tab-bar [role="tab"]').nth(tabsBefore)).toBeVisible();
  });

  test("creates a new document and updates the documents panel", async ({ page }) => {
    const app = new AppSmokePage(page);
    await app.goto();
    const docPanel = app.panes.documents();
    // Count documents before
    const itemsBefore = await docPanel.locator('.list-item').count();
    const titlesBefore = await docPanel.locator('.list-item .list-item-title').allTextContents();
    console.log('Documents before:', titlesBefore);
    await app.createDocument();
    // Wait for the documents panel to update and assert count increases by 1
    await expect(async () => {
      const itemsAfter = await docPanel.locator('.list-item').count();
      const titlesAfter = await docPanel.locator('.list-item .list-item-title').allTextContents();
      console.log('Documents after:', titlesAfter);
      expect(itemsAfter).toBe(itemsBefore + 1);
    }).toPass({ timeout: 5000 });
  });
});

test.describe("Document navigation", () => {
  const DOC_A = `smoke-nav-a-${Date.now()}.md`;
  const DOC_B = `smoke-nav-b-${Date.now()}.md`;
  const CONTENT_A = "# Smoke Nav Doc A\n\nThis is document A content.";
  const CONTENT_B = "# Smoke Nav Doc B\n\nThis is document B content.";

  test.beforeAll(async ({ request }) => {
    await request.put(`/documents/${DOC_A}`, {
      data: CONTENT_A,
      headers: { "Content-Type": "text/markdown" },
    });
    await request.put(`/documents/${DOC_B}`, {
      data: CONTENT_B,
      headers: { "Content-Type": "text/markdown" },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/documents/${DOC_A}`).catch(() => undefined);
    await request.delete(`/documents/${DOC_B}`).catch(() => undefined);
  });

  test("clicking a file in the documents panel loads its content into the editor", async ({ page }) => {
    const app = new AppSmokePage(page);
    await app.goto();

    await app.documentItem(DOC_A).click();

    await expect(app.activeTab()).toContainText(DOC_A);

    await expect(async () => {
      const rendered = await getEditorRenderedText(page);
      expect(rendered).toContain("Smoke Nav Doc A");
    }).toPass({ timeout: 5000 });
  });

  test("switching between tabs loads the correct document content", async ({ page }) => {
    const app = new AppSmokePage(page);
    await app.goto();

    // Open both documents
    await app.documentItem(DOC_A).click();
    await expect(app.activeTab()).toContainText(DOC_A);

    await app.documentItem(DOC_B).click();
    await expect(app.activeTab()).toContainText(DOC_B);

    // Doc B should be showing
    await expect(async () => {
      expect(await getEditorRenderedText(page)).toContain("Smoke Nav Doc B");
    }).toPass({ timeout: 5000 });

    // Switch back to doc A via the tab
    await app.tab(DOC_A).click();
    await expect(app.activeTab()).toContainText(DOC_A);

    // Doc A content should now be showing
    await expect(async () => {
      expect(await getEditorRenderedText(page)).toContain("Smoke Nav Doc A");
    }).toPass({ timeout: 5000 });

    // Switch to doc B via its tab
    await app.tab(DOC_B).click();
    await expect(app.activeTab()).toContainText(DOC_B);

    await expect(async () => {
      expect(await getEditorRenderedText(page)).toContain("Smoke Nav Doc B");
    }).toPass({ timeout: 5000 });
  });

  test("clicking a document already open in an inactive tab makes it active and shows its content", async ({ page }) => {
    const app = new AppSmokePage(page);
    await app.goto();

    await app.documentItem(DOC_A).click();
    await app.documentItem(DOC_B).click();
    await expect(app.activeTab()).toContainText(DOC_B);

    // Click doc A in the panel while doc B is active
    await app.documentItem(DOC_A).click();
    await expect(app.activeTab()).toContainText(DOC_A);

    await expect(async () => {
      expect(await getEditorRenderedText(page)).toContain("Smoke Nav Doc A");
    }).toPass({ timeout: 5000 });
  });
});
