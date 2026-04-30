#!/usr/bin/env node
/**
 * Evaluation harness for the ProseAI writing assistant.
 *
 * Runs a set of scenarios against a specific model + prompt variant and
 * records structured results. Server must already be running on port 3001.
 *
 * Usage:
 *   node scripts/eval.mjs [model] [variant]
 *
 * Examples:
 *   node scripts/eval.mjs gemma4:e2b default
 *   node scripts/eval.mjs phi4-mini:3.8b minimal
 *   node scripts/eval.mjs llama3.2:3b direct
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { SCENARIOS } from "./scenarios.mjs";

const BASE_URL = "http://localhost:3001";

// Support both positional args and --model / --variant flags
let _model = null;
let _variant = null;
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) { _model = args[++i]; }
    else if (args[i] === "--variant" && args[i + 1]) { _variant = args[++i]; }
    else if (!args[i].startsWith("--")) {
      if (_model === null) _model = args[i];
      else if (_variant === null) _variant = args[i];
    }
  }
}
const MODEL = _model ?? "gemma4:e2b";
const VARIANT = _variant ?? "default";
const CHAT_TIMEOUT = 120_000;
const DOC_NAME = `eval-test-${Date.now()}.md`;
const DOC_URL = `${BASE_URL}/documents/${DOC_NAME}`;

const slug = MODEL.replace(/[:/]/g, "-");
const runId = `${Date.now()}-${slug}-${VARIANT}`;

function log(msg) {
  console.log(`[eval:${MODEL}:${VARIANT}] ${msg}`);
}

// ── Document helpers (server-side REST) ─────────────────────────────────────

async function putDocument(content) {
  const res = await fetch(DOC_URL, { method: "PUT", body: content });
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    throw new Error(`PUT document failed: ${res.status} ${res.statusText}`);
  }
}

async function getDocument() {
  const res = await fetch(DOC_URL);
  if (!res.ok) return null;
  return res.text();
}

async function deleteDocument() {
  await fetch(DOC_URL, { method: "DELETE" }).catch(() => {});
}

// ── Playwright helpers ───────────────────────────────────────────────────────

/** Wait for the chat send button to become enabled again (agent loop finished). */
async function waitForAgentComplete(page) {
  try {
    await page.waitForFunction(
      () => !document.querySelector("#chat-send")?.hasAttribute("disabled"),
      { timeout: CHAT_TIMEOUT }
    );
    return true;
  } catch {
    return false; // timed out
  }
}

/** Get all tool-call texts from the chat panel. */
async function getToolCalls(page) {
  return page.$$eval(".tool-call", els => els.map(el => el.textContent?.trim() ?? ""));
}

/** Get the last assistant message text. */
async function getLastAssistantText(page) {
  const messages = await page.$$eval(
    ".chat-message[data-role='assistant'] .content",
    els => els.map(el => el.textContent?.trim() ?? "")
  );
  return messages[messages.length - 1] ?? "";
}

/** Count agent iterations by counting assistant messages (each = one LLM call). */
async function getIterationCount(page) {
  return page.$$eval(".chat-message[data-role='assistant']", els => els.length);
}

/** Get any error messages in the chat. */
async function getErrors(page) {
  return page.$$eval(
    ".chat-message[data-role='error'] .content",
    els => els.map(el => el.textContent?.trim() ?? "")
  );
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreScenario(scenario, result) {
  const points = { total: 0, max: 4 };

  // +1 task_complete was called
  const completedWithTool = result.toolCalls.some(tc => tc.startsWith("task_complete"));
  points.total += completedWithTool ? 1 : 0;
  result.taskCompleted = completedWithTool;

  // +1 required tools were used
  const calledToolNames = result.toolCalls.map(tc => tc.split("(")[0]);
  const requiredUsed = scenario.requiredTools.every(t => calledToolNames.includes(t));
  points.total += requiredUsed ? 1 : 0;
  result.requiredToolsUsed = requiredUsed;

  // +1 document changed correctly (or answer was correct)
  if (scenario.expectDocChange && scenario.scoreDoc) {
    const docOk = scenario.scoreDoc(result.docBefore, result.docAfter ?? "");
    points.total += docOk ? 1 : 0;
    result.docScoreOk = docOk;
  } else if (!scenario.expectDocChange && scenario.scoreReply) {
    // Check both assistant text AND task_complete summary — some models put the answer
    // directly in the task_complete summary rather than in a text message.
    const taskCompleteSummary = result.toolCalls
      .filter(tc => tc.startsWith("task_complete("))
      .map(tc => { try { return JSON.parse(tc.slice("task_complete(".length, -1))?.summary ?? ""; } catch { return ""; } })
      .join(" ");
    const combinedText = [result.lastAssistantText, taskCompleteSummary].filter(Boolean).join(" ");
    const replyOk = scenario.scoreReply(combinedText);
    points.total += replyOk ? 1 : 0;
    result.replyScoreOk = replyOk;
  } else {
    // No scoring function: just check doc changed/unchanged as expected
    const changed = result.docAfter !== result.docBefore;
    const ok = changed === scenario.expectDocChange;
    points.total += ok ? 1 : 0;
    result.docScoreOk = ok;
  }

  // +1 efficient (≤ 4 iterations)
  points.total += result.iterations <= 4 ? 1 : 0;

  result.score = points.total;
  result.maxScore = points.max;
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  log(`Starting evaluation — model: ${MODEL}, variant: ${VARIANT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    // Inject the prompt variant before any scripts run
    extraHTTPHeaders: {},
  });

  // Inject the prompt variant global so writing-assistant.ts picks it up
  await context.addInitScript(`window.__promptVariant = ${JSON.stringify(VARIANT)};`);

  const page = await context.newPage();
  page.setDefaultTimeout(CHAT_TIMEOUT);

  page.on("console", msg => {
    if (msg.type() === "error") {
      log(`[browser error] ${msg.text()}`);
    }
  });
  page.on("pageerror", err => log(`[page error] ${err.message}`));

  // Load app and wait for it to be ready
  await page.goto(BASE_URL);
  await page.waitForLoadState("networkidle");

  // Select the model
  const options = await page.$$eval("#chat-model-select option", opts =>
    opts.map(o => ({ value: o.value, text: o.textContent }))
  );
  const target = options.find(o => o.value === MODEL || o.value.startsWith(MODEL));
  if (target) {
    await page.selectOption("#chat-model-select", target.value);
    log(`Model selected: ${target.text}`);
  } else {
    log(`WARNING: model "${MODEL}" not found in selector. Available: ${options.map(o => o.value).join(", ")}`);
  }

  const scenarioResults = [];

  for (const scenario of SCENARIOS) {
    log(`\n── Scenario: ${scenario.name} (${scenario.id}) ──`);

    const result = {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      model: MODEL,
      variant: VARIANT,
      toolCalls: [],
      iterations: 0,
      taskCompleted: false,
      docBefore: scenario.document,
      docAfter: null,
      lastAssistantText: "",
      errors: [],
      elapsedMs: 0,
      timedOut: false,
      score: 0,
      maxScore: 4,
    };

    try {
      // 1. Set up the document on the server (delete stale version first for clean ETag)
      await deleteDocument();
      await page.waitForTimeout(200);
      await putDocument(scenario.document);
      log(`Document created: ${DOC_URL}`);

      // 2. Full page reload to ensure browser has no stale document state or ETags
      await page.goto(BASE_URL, { waitUntil: "networkidle" });

      // Re-select model after navigation
      if (target) {
        await page.selectOption("#chat-model-select", target.value);
      }

      // 3. Open the document by clicking its title in the panel
      const docTitle = DOC_NAME.replace(/\.md$/, "");
      // Wait for document list to be populated
      await page.waitForFunction(
        (title) => {
          const els = [...document.querySelectorAll(".list-item-title[data-action='select']")];
          return els.some(el => el.textContent?.includes(title) || el.title?.includes(title));
        },
        docTitle,
        { timeout: 8000 }
      ).catch(() => null);

      const docEl = await page.evaluateHandle((title) => {
        const els = [...document.querySelectorAll(".list-item-title[data-action='select']")];
        return els.find(el => el.textContent?.includes(title) || el.title?.includes(title)) ?? null;
      }, docTitle);

      const docElHandle = docEl.asElement();
      if (docElHandle) {
        await docElHandle.click();
        await page.waitForTimeout(800);
        log("Document opened in editor");
      } else {
        log("WARNING: could not find document in panel — skipping scenario");
        scenarioResults.push(scoreScenario(scenario, result));
        continue;
      }

      // 4. Clear chat history (if any from previous run)
      const clearBtn = await page.$('[title="Clear chat"]');
      if (clearBtn) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }

      // 5. Send the prompt
      const chatTextarea = page.locator("#chat-textarea");
      await chatTextarea.click();
      await chatTextarea.fill(scenario.prompt);
      log(`Sending: "${scenario.prompt.substring(0, 80)}..."`);

      const t0 = Date.now();
      await page.click("#chat-send");

      // 6. Wait for the agent to finish
      const finished = await waitForAgentComplete(page);
      result.elapsedMs = Date.now() - t0;
      result.timedOut = !finished;
      log(`Agent ${finished ? "finished" : "TIMED OUT"} in ${(result.elapsedMs / 1000).toFixed(1)}s`);

      await page.waitForTimeout(500);

      // 7. Collect results
      result.toolCalls = await getToolCalls(page);
      result.iterations = await getIterationCount(page);
      result.lastAssistantText = await getLastAssistantText(page);
      result.errors = await getErrors(page);

      // 8. Save document (Ctrl+S) so tool edits are persisted, then fetch
      await page.keyboard.press("Control+s");
      await page.waitForTimeout(1200); // allow async save + server write
      result.docAfter = await getDocument();

      // Fallback: read from the CodeMirror editor DOM if server still unchanged
      if (result.docAfter === result.docBefore) {
        const editorContent = await page.evaluate(() => {
          // Try editor-page inner text
          return document.getElementById("editor-page")?.innerText ?? null;
        });
        if (editorContent && editorContent !== result.docBefore) {
          result.docAfter = editorContent;
          result.savedViaDOM = true;
        }
      }

      log(`Tool calls: ${result.toolCalls.join(", ") || "(none)"}`);
      log(`Iterations: ${result.iterations}, DocChanged: ${result.docAfter !== result.docBefore}`);
      if (result.errors.length) log(`Errors: ${result.errors.join("; ")}`);

    } catch (err) {
      result.errors.push(`Harness error: ${err.message}`);
      log(`ERROR in scenario: ${err.message}`);
    }

    scoreScenario(scenario, result);
    log(`Score: ${result.score}/${result.maxScore} | taskComplete:${result.taskCompleted} | requiredTools:${result.requiredToolsUsed}`);
    scenarioResults.push(result);

    // Clean up document for next scenario (will be replaced by next PUT)
    await deleteDocument();
    await page.waitForTimeout(500);
  }

  await browser.close();

  // ── Aggregate stats ────────────────────────────────────────────────────────

  const totalScore = scenarioResults.reduce((s, r) => s + r.score, 0);
  const maxTotal = scenarioResults.reduce((s, r) => s + r.maxScore, 0);
  const completionRate = scenarioResults.filter(r => r.taskCompleted).length / scenarioResults.length;
  const avgIterations = scenarioResults.reduce((s, r) => s + r.iterations, 0) / scenarioResults.length;
  const docAccuracy = scenarioResults
    .filter(r => r.docScoreOk !== undefined)
    .reduce((s, r) => s + (r.docScoreOk ? 1 : 0), 0)
    / scenarioResults.filter(r => r.docScoreOk !== undefined).length || 0;

  const summary = {
    runId,
    model: MODEL,
    variant: VARIANT,
    timestamp: new Date().toISOString(),
    totalScore,
    maxTotal,
    pct: Math.round((totalScore / maxTotal) * 100),
    completionRate: Math.round(completionRate * 100),
    avgIterations: Math.round(avgIterations * 10) / 10,
    docAccuracy: Math.round(docAccuracy * 100),
    scenarios: scenarioResults,
  };

  // ── Write results file ─────────────────────────────────────────────────────

  mkdirSync("eval-results", { recursive: true });
  const outPath = `eval-results/${runId}.json`;
  writeFileSync(outPath, JSON.stringify(summary, null, 2));

  log(`\n═══════════════════════════════════════════`);
  log(`RESULTS: ${MODEL} / ${VARIANT}`);
  log(`Overall score: ${totalScore}/${maxTotal} (${summary.pct}%)`);
  log(`Completion rate: ${summary.completionRate}%`);
  log(`Doc accuracy: ${summary.docAccuracy}%`);
  log(`Avg iterations: ${summary.avgIterations}`);
  log(`Results saved to: ${outPath}`);
  log(`═══════════════════════════════════════════`);

  process.exit(0);
})();
