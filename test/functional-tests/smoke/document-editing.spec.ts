import { expect, test, type Page } from "./fixtures";

// Helper: read the rendered text from the markdown editor's shadow root
async function getEditorRenderedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = document.querySelector("ui-markdown-editor");
    if (!editor?.shadowRoot) return "";
    const editorPage = editor.shadowRoot.querySelector("#editor-page") as HTMLElement | null;
    return editorPage?.textContent ?? "";
  });
}

// Helper: click into the editor and type text
async function typeIntoEditor(page: Page, text: string): Promise<void> {
  await page.evaluate(() => {
    const editor = document.querySelector("ui-markdown-editor");
    const editorPage = editor?.shadowRoot?.querySelector("#editor-page") as HTMLElement | null;
    editorPage?.focus();
  });
  await page.keyboard.type(text);
}

// Helper: read the raw markdown content from the editor component
async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = document.querySelector("ui-markdown-editor");
    return (editor as { getContent?(): string } | null)?.getContent?.() ?? "";
  });
}

test.describe("Document editing", () => {
  const DOC_NAME = `smoke-edit-${Date.now()}.md`;

  test.beforeAll(async ({ request }) => {
    await request.put(`/store/${DOC_NAME}`, {
      data: "",
      headers: { "Content-Type": "text/markdown" },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/store/${DOC_NAME}`).catch(() => undefined);
  });

  test("user can type content into an open document", async ({ page }) => {
    await page.goto("/");

    // Open the document via the sidebar
    const docPanel = page.locator("ui-pane", { hasText: "Documents" });
    await docPanel.locator(".list-item-title", { hasText: DOC_NAME }).click();

    // Confirm the tab became active
    await expect(
      page.locator(`ui-tab-bar [role="tab"][aria-selected="true"]`)
    ).toContainText(DOC_NAME, { timeout: 5000 });

    // Type some content
    await typeIntoEditor(page, "Hello from smoke test");

    // Wait for the debounce (250 ms) and then check editor content
    await expect(async () => {
      const content = await getEditorContent(page);
      expect(content).toContain("Hello from smoke test");
    }).toPass({ timeout: 3000 });
  });

  test("saving a document persists content to the server", async ({ page, request }) => {
    const SAVE_DOC = `smoke-save-${Date.now()}.md`;

    // Create the doc via API so we have a clean slate
    await request.put(`/store/${SAVE_DOC}`, {
      data: "",
      headers: { "Content-Type": "text/markdown" },
    });

    try {
      await page.goto("/");

      // Open the document
      const docPanel = page.locator("ui-pane", { hasText: "Documents" });
      await docPanel.locator(".list-item-title", { hasText: SAVE_DOC }).click();
      await expect(
        page.locator(`ui-tab-bar [role="tab"][aria-selected="true"]`)
      ).toContainText(SAVE_DOC, { timeout: 5000 });

      // Type some content
      const uniqueContent = `Saved content ${Date.now()}`;
      await typeIntoEditor(page, uniqueContent);

      // Wait for the editor's debounce to process the change
      await expect(async () => {
        const content = await getEditorContent(page);
        expect(content).toContain(uniqueContent);
      }).toPass({ timeout: 3000 });

      // Click the Save button in the menu bar
      await page.locator('button[data-app-action="save"]').click();

      // Verify the content was persisted on the server
      await expect(async () => {
        const response = await request.get(`/store/${SAVE_DOC}`);
        const body = await response.text();
        expect(body).toContain(uniqueContent);
      }).toPass({ timeout: 5000 });
    } finally {
      await request.delete(`/store/${SAVE_DOC}`).catch(() => undefined);
    }
  });
});

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
    await request.put(`/store/${HEADINGS_DOC}`, {
      data: HEADINGS_CONTENT,
      headers: { "Content-Type": "text/markdown" },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/store/${HEADINGS_DOC}`).catch(() => undefined);
  });

  test("headings in a document appear in the outline panel", async ({ page }) => {
    await page.goto("/");

    // Open the document with headings
    const docPanel = page.locator("ui-pane", { hasText: "Documents" });
    await docPanel.locator(".list-item-title", { hasText: HEADINGS_DOC }).click();

    await expect(
      page.locator(`ui-tab-bar [role="tab"][aria-selected="true"]`)
    ).toContainText(HEADINGS_DOC, { timeout: 5000 });

    // Wait for the editor to render the document
    await expect(async () => {
      const rendered = await getEditorRenderedText(page);
      expect(rendered).toContain("Top Level Heading");
    }).toPass({ timeout: 5000 });

    // Now check the outline panel shows all three headings
    const outlinePane = page.locator("ui-pane", { hasText: "Outline" });

    await expect(async () => {
      const titles = await outlinePane.locator(".list-item-title").allTextContents();
      expect(titles).toContain("Top Level Heading");
      expect(titles).toContain("Second Level Heading");
      expect(titles).toContain("Third Level Heading");
    }).toPass({ timeout: 5000 });
  });

  test("outline panel shows 'No headings' for a document with no headings", async ({ page, request }) => {
    const PLAIN_DOC = `smoke-outline-plain-${Date.now()}.md`;
    await request.put(`/store/${PLAIN_DOC}`, {
      data: "This document has no headings, just body text.",
      headers: { "Content-Type": "text/markdown" },
    });

    try {
      await page.goto("/");

      const docPanel = page.locator("ui-pane", { hasText: "Documents" });
      await docPanel.locator(".list-item-title", { hasText: PLAIN_DOC }).click();

      await expect(
        page.locator(`ui-tab-bar [role="tab"][aria-selected="true"]`)
      ).toContainText(PLAIN_DOC, { timeout: 5000 });

      // Wait for the document to load
      await expect(async () => {
        const rendered = await getEditorRenderedText(page);
        expect(rendered).toContain("no headings");
      }).toPass({ timeout: 5000 });

      // The outline panel should show the empty state — target the outline component directly
      await expect(
        page.locator("ui-document-outline-panel .cover.empty")
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await request.delete(`/store/${PLAIN_DOC}`).catch(() => undefined);
    }
  });

  test("outline panel updates when the document content changes", async ({ page }) => {
    await page.goto("/");

    const docPanel = page.locator("ui-pane", { hasText: "Documents" });
    await docPanel.locator(".list-item-title", { hasText: HEADINGS_DOC }).click();

    await expect(
      page.locator(`ui-tab-bar [role="tab"][aria-selected="true"]`)
    ).toContainText(HEADINGS_DOC, { timeout: 5000 });

    // Confirm initial headings appear
    const outlinePane = page.locator("ui-pane", { hasText: "Outline" });
    await expect(async () => {
      const titles = await outlinePane.locator(".list-item-title").allTextContents();
      expect(titles).toContain("Top Level Heading");
    }).toPass({ timeout: 5000 });

    // Move the caret to the end of the document and type a new heading
    await page.evaluate(() => {
      const editor = document.querySelector("ui-markdown-editor");
      const editorPage = editor?.shadowRoot?.querySelector("#editor-page") as HTMLElement | null;
      if (editorPage) {
        editorPage.focus();
        // Place the caret at the end of the content
        const range = document.createRange();
        range.selectNodeContents(editorPage);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
    const newHeadingText = `New Heading ${Date.now()}`;
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`## ${newHeadingText}`);

    // Outline panel should now include the new heading
    const headingTitle = newHeadingText;
    await expect(async () => {
      const titles = await outlinePane.locator(".list-item-title").allTextContents();
      expect(titles).toContain(headingTitle);
    }).toPass({ timeout: 5000 });
  });
});

test.describe("Duplicate document name conflict", () => {
  // Use a unique base name so tests don't collide with other test runs.
  // The .md extension is included explicitly throughout so the server stores it correctly.
  const BASE_NAME = `smoke-conflict-${Date.now()}`;
  const FIRST_DOC = `${BASE_NAME}.md`;
  // After the conflict prompt the user provides this alternative name (with .md)
  const RESOLVED_DOC = `${BASE_NAME}-resolved.md`;

  test.beforeEach(async ({ request }) => {
    // Seed the first document via API so there is no in-progress rename when the
    // second document creation begins — this avoids a UI race where the rename
    // _syncUI() re-render could destroy the inline input for the new document.
    await request.put(`/store/${FIRST_DOC}`, {
      data: "",
      headers: { "Content-Type": "text/markdown" },
    });
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/store/${FIRST_DOC}`).catch(() => undefined);
    await request.delete(`/store/${RESOLVED_DOC}`).catch(() => undefined);
  });

  test("renaming a new document to an existing name shows a conflict prompt and allows retry with a different name", async ({ page }) => {
    await page.goto("/");

    const docPanel = page.locator("ui-pane", { hasText: "Documents" });
    const newDocBtn = docPanel.locator('button[title="New document"]');

    // Confirm the pre-seeded document is already visible in the sidebar
    await expect(async () => {
      const titles = await docPanel.locator(".list-item-title").allTextContents();
      expect(titles).toContain(FIRST_DOC);
    }).toPass({ timeout: 5000 });

    // Click "New document" — the workbench creates an "Untitled Document.md" (or
    // similar unique name) and immediately shows a focused inline rename input.
    await newDocBtn.click();
    await expect(docPanel.locator('input[type="text"].input')).toBeVisible({ timeout: 5000 });

    // Clear the default value and type the conflicting filename (same as FIRST_DOC),
    // then commit with Enter. The workbench catches DocumentIdConflictError and
    // re-opens the inline rename input with an error message below it.
    await page.keyboard.press("Control+a");
    await page.keyboard.type(FIRST_DOC);
    await page.keyboard.press("Enter");

    // Wait for the inline input to reappear with the error message.
    await expect(docPanel.locator('input[type="text"].input')).toBeVisible({ timeout: 5000 });

    // Assert that the error message element is visible and mentions "already exists".
    const errorSpan = docPanel.locator(".input-error");
    await expect(errorSpan).toBeVisible({ timeout: 5000 });
    await expect(errorSpan).toContainText("already exists");

    // Type the resolved (non-conflicting) name and commit.
    await page.keyboard.press("Control+a");
    await page.keyboard.type(RESOLVED_DOC);
    await page.keyboard.press("Enter");

    // Assert the second document now appears in the sidebar with the resolved name.
    await expect(async () => {
      const titles = await docPanel.locator(".list-item-title").allTextContents();
      expect(titles).toContain(RESOLVED_DOC);
    }).toPass({ timeout: 5000 });
  });
});
