import { expect, test, type Page } from "./fixtures.js";
import { AppPage } from "./pages.js";

// Verifies that after the model receives a tool result it continues making tool calls
// rather than falling back to prose output. The original bug: create_document succeeded
// but the model never called insert_document_section — it just wrote the content as text.

const TIMEOUT_MS = 180_000;

test.setTimeout(TIMEOUT_MS);

async function selectGemma4Model(page: Page): Promise<void> {
  await expect(async () => {
    const count = await page.locator("#chat-model-select option").count();
    expect(count).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  const optionValues = await page.locator("#chat-model-select option").evaluateAll(
    (els) => (els as HTMLOptionElement[]).map(e => ({ value: e.value, text: e.textContent ?? "" }))
  );

  const match = optionValues.find(o => o.text.toLowerCase().includes("gemma4")) ?? optionValues[0];
  if (match?.value) {
    await page.selectOption("#chat-model-select", match.value);
  }
}

test("model calls edit tools after create_document succeeds", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();

  // Skip if no AI platform is available (e.g. Ollama not running in this environment).
  // In future this should be replaced with a stubbed/mocked AI platform.
  const modelCount = await page.locator("#chat-model-select option").count();
  test.skip(modelCount === 0, "No AI models available — skipping (Ollama not running)");

  await selectGemma4Model(page);

  await app.chat.pane().locator('button[title="Clear chat"]').click();

  await page.fill("#chat-textarea", "Write a document about Technical architecture");
  await page.press("#chat-textarea", "Enter");

  const anyToolCall = page.locator('#chat-history .chat-message[data-role="assistant"] .tool-call');
  await expect(anyToolCall.first()).toBeVisible({ timeout: 60_000 });

  const firstCallText = await anyToolCall.first().textContent() ?? "";
  expect(firstCallText).toContain("create_document");

  await expect(page.locator("#chat-send")).toBeEnabled({ timeout: TIMEOUT_MS });

  const allToolCallTexts = await anyToolCall.allTextContents();
  const editToolCalled = allToolCallTexts.some(t =>
    t.includes("insert_document_section") ||
    t.includes("replace_document_section") ||
    t.includes("read_document_outline")
  );

  expect(editToolCalled, `Expected an edit tool call after create_document. Got: ${JSON.stringify(allToolCallTexts)}`).toBe(true);
});
