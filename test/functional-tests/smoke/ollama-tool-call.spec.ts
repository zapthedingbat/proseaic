import { expect, test, type Page } from "./fixtures";
import * as fs from "fs";
import * as path from "path";

// Reproduces the bug where the model thinks about making a tool call after receiving
// a tool result, but the tool call never arrives in the stream.
// Logs the latest proxy log file after the test for inspection.

const TIMEOUT_MS = 180_000;

test.setTimeout(TIMEOUT_MS);

async function selectGemma4Model(page: Page): Promise<void> {
  // Wait for the model select to be populated
  await expect(async () => {
    const count = await page.locator("#chat-model-select option").count();
    expect(count).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  // Try to select gemma4:e2b specifically
  const options = await page.locator("#chat-model-select option").allTextContents();
  console.log("Available models:", options);

  const gemma4Option = options.find(o => o.toLowerCase().includes("gemma4"));
  if (gemma4Option) {
    // Select by visible text via the value (model name is the value)
    const optionValues = await page.locator("#chat-model-select option").evaluateAll(
      (els) => (els as HTMLOptionElement[]).map(e => ({ value: e.value, text: e.textContent }))
    );
    const match = optionValues.find(o => o.text?.toLowerCase().includes("gemma4"));
    if (match?.value) {
      await page.selectOption("#chat-model-select", match.value);
      console.log("Selected model:", match.text, "value:", match.value);
      return;
    }
  }

  // Fallback: log available and use first
  console.warn("gemma4 not found, using first available model:", options[0]);
}

function getLatestLogFile(): string | null {
  const logsDir = path.resolve("logs");
  if (!fs.existsSync(logsDir)) return null;
  const files = fs.readdirSync(logsDir)
    .filter(f => f.endsWith(".log"))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(logsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? path.join(logsDir, files[0].name) : null;
}

test("model makes tool call after receiving tool result (write document flow)", async ({ page }) => {
  await page.goto("/");

  await selectGemma4Model(page);

  // Clear existing chat history so we start fresh
  const chatPanel = page.locator("ui-pane", { hasText: "Chat" });
  await chatPanel.locator('button[title="Clear chat"]').click();

  // Send the prompt that triggered the bug
  await page.fill("#chat-textarea", "Write a document about Technical architecture");
  await page.press("#chat-textarea", "Enter");

  console.log("Sent prompt, waiting for first tool call (create_document)...");

  // Wait for the first assistant message to contain a tool call (create_document)
  const firstToolCall = page.locator('#chat-history .chat-message[data-role="assistant"] .tool-call').first();
  await expect(firstToolCall).toBeVisible({ timeout: 60_000 });
  const firstCallText = await firstToolCall.textContent();
  console.log("First tool call:", firstCallText);

  // Now wait for a SECOND assistant message to appear — this is the turn after the
  // tool result comes back, and it should call insert_document_section to write the content.
  console.log("Waiting for second assistant turn...");

  const assistantMessages = page.locator('#chat-history .chat-message[data-role="assistant"]');

  await expect(async () => {
    const count = await assistantMessages.count();
    expect(count).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 120_000 });

  const secondMessage = assistantMessages.nth(1);

  // Give the second message time to finish streaming
  await expect(async () => {
    // Either a tool call appeared, or text content appeared — either way the turn is done
    const toolCalls = await secondMessage.locator(".tool-call").count();
    const content = await secondMessage.locator(".content").count();
    const thinking = await secondMessage.locator(".thinking").textContent().catch(() => "");
    console.log(`Second message state — tool_calls: ${toolCalls}, content: ${content}, thinking length: ${thinking?.length ?? 0}`);
    expect(toolCalls + content).toBeGreaterThan(0);
  }).toPass({ timeout: 120_000 });

  const toolCallCount = await secondMessage.locator(".tool-call").count();
  const contentCount = await secondMessage.locator(".content").count();
  const toolCallTexts = await secondMessage.locator(".tool-call").allTextContents();
  const contentText = await secondMessage.locator(".content").textContent().catch(() => "");

  console.log("\n--- SECOND TURN RESULT ---");
  console.log("Tool calls made:", toolCallCount, toolCallTexts);
  console.log("Text content:", contentCount > 0 ? contentText?.slice(0, 200) : "(none)");

  // Log the latest proxy log path for inspection
  const logFile = getLatestLogFile();
  console.log("\nLatest proxy log:", logFile);

  // The assertion: the second turn MUST have made at least one tool call.
  // If this fails, the bug is confirmed — the model produced no tool calls after receiving the tool result.
  expect(toolCallCount).toBeGreaterThan(0);
  console.log("PASS: second turn made tool call(s):", toolCallTexts);
});
