import { expect, test } from "@playwright/test";

class AppSmokePage {
  constructor(private readonly page: import("@playwright/test").Page) {}

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

    await expect(page.locator("ui-tab-bar")).toBeVisible();
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
