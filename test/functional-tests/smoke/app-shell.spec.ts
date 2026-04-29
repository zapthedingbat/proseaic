import { expect, test } from "./fixtures.js";
import { AppPage } from "./pages.js";

test.describe("App shell", () => {
  test("loads layout and primary controls", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await expect(app.menuBar.save()).toBeVisible();
    await expect(app.menuBar.saveAs()).toBeVisible();

    await expect(app.documents.pane()).toBeVisible();
    await expect(app.outline.pane()).toBeVisible();
    await expect(app.chat.pane()).toBeVisible();

    await expect(app.chat.textarea()).toBeVisible();
  });

  test("settings panel opens and closes", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await app.chat.openSettings();
    await expect(app.settings()).toBeVisible();

    await app.closeSettings();
    await expect(app.settings()).not.toBeVisible();
  });
});
