import { expect, test, type Page } from "./fixtures";

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
  console.log("Available models:", optionValues.map(o => o.text));

  const match = optionValues.find(o => o.text.toLowerCase().includes("gemma4"))
    ?? optionValues[0];

  if (match?.value) {
    await page.selectOption("#chat-model-select", match.value);
    console.log("Selected model:", match.text);
  }
}

test("model calls edit tools after create_document succeeds", async ({ page }) => {
  await page.goto("/");
  await selectGemma4Model(page);

  const chatPanel = page.locator("ui-pane", { hasText: "Chat" });
  await chatPanel.locator('button[title="Clear chat"]').click();

  await page.fill("#chat-textarea", "Write a document about Technical architecture");
  await page.press("#chat-textarea", "Enter");

  // Step 1: wait for create_document to be called in any assistant message
  const anyToolCall = page.locator('#chat-history .chat-message[data-role="assistant"] .tool-call');
  await expect(anyToolCall.first()).toBeVisible({ timeout: 60_000 });

  const firstCallText = await anyToolCall.first().textContent() ?? "";
  console.log("First tool call:", firstCallText);
  expect(firstCallText).toContain("create_document");

  // Step 2: wait for the send button to become enabled again (agent loop finished)
  await expect(page.locator("#chat-send")).toBeEnabled({ timeout: TIMEOUT_MS });

  // Step 3: the core assertion — at least one edit tool call must have been made
  // across all assistant messages (not locked to a specific turn number).
  const allToolCallTexts = await anyToolCall.allTextContents();
  console.log("All tool calls made:", allToolCallTexts);

  const editToolCalled = allToolCallTexts.some(t =>
    t.includes("insert_document_section") ||
    t.includes("replace_document_section") ||
    t.includes("read_document_outline")
  );

  expect(editToolCalled, `Expected an edit tool call after create_document. Got: ${JSON.stringify(allToolCallTexts)}`).toBe(true);
});
