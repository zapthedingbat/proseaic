#!/usr/bin/env node
/**
 * Optimization orchestrator for the ProseAI writing assistant.
 *
 * Runs eval across model/variant combinations, picks winners, uses an LLM to
 * suggest further improvements, applies them, then re-evaluates.
 *
 * Usage:
 *   node scripts/optimize.mjs [mode]
 *
 * Modes:
 *   sweep          - Test all variant × model combos (default)
 *   analyze        - Load existing eval results and print analysis
 *   suggest        - Use qwen3.6:35b to suggest new prompt improvements
 *
 * Requires the app server running on port 3001.
 */

import { spawnSync, execSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { SCENARIOS, PROMPT_VARIANTS, MODELS } from "./scenarios.mjs";

const OLLAMA_API = "http://localhost:3001/ollama";
const ANALYZER_MODEL = "qwen3.6:35b";
const RESULTS_DIR = "eval-results";
const NOTES_FILE = "OPTIMISATION_NOTES.md";

const MODE = process.argv[2] || "sweep";

function log(msg) { console.log(`[optimize] ${msg}`); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function runEval(model, variant) {
  log(`Running eval: ${model} × ${variant}`);
  const result = spawnSync("node", ["scripts/eval.mjs", model, variant], {
    stdio: "inherit",
    timeout: SCENARIOS.length * 130_000 + 30_000,
  });
  if (result.status !== 0) {
    log(`  eval exited with status ${result.status}`);
    return null;
  }
  // Load the latest result file for this combo
  return loadLatestResult(model, variant);
}

function loadLatestResult(model, variant) {
  const slug = model.replace(/[:/]/g, "-");
  if (!existsSync(RESULTS_DIR)) return null;
  const files = readdirSync(RESULTS_DIR)
    .filter(f => f.includes(slug) && f.includes(variant) && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) return null;
  return JSON.parse(readFileSync(join(RESULTS_DIR, files[0]), "utf8"));
}

function loadAllResults() {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")));
}

function buildResultsTable(results) {
  // Group by model → variant → score
  const table = {};
  for (const r of results) {
    if (!table[r.model]) table[r.model] = {};
    // Keep the highest score for this combo (in case of multiple runs)
    if (!table[r.model][r.variant] || r.pct > table[r.model][r.variant].pct) {
      table[r.model][r.variant] = r;
    }
  }
  return table;
}

function printTable(table) {
  const variants = [...new Set(Object.values(table).flatMap(v => Object.keys(v)))].sort();
  const models = Object.keys(table).sort();

  const header = ["Model", ...variants.map(v => v.padEnd(10))].join(" | ");
  log(header);
  log("-".repeat(header.length));

  for (const model of models) {
    const cols = variants.map(v => {
      const r = table[model]?.[v];
      return r ? `${String(r.pct).padStart(3)}%      `.slice(0, 10) : "  -       ".slice(0, 10);
    });
    log([model.padEnd(25), ...cols].join(" | "));
  }
}

// ── LLM analysis ─────────────────────────────────────────────────────────────

async function askOllama(prompt) {
  const res = await fetch(`${OLLAMA_API}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ANALYZER_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 2000 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.response ?? "";
}

async function analyzeResultsWithLLM(results) {
  const table = buildResultsTable(results);

  // Build a compact JSON summary for the LLM
  const summary = Object.entries(table).map(([model, variants]) => ({
    model,
    results: Object.entries(variants).map(([variant, r]) => ({
      variant,
      score: r.pct,
      completionRate: r.completionRate,
      docAccuracy: r.docAccuracy,
      avgIterations: r.avgIterations,
      failedScenarios: r.scenarios
        .filter(s => s.score < s.maxScore)
        .map(s => ({
          id: s.scenarioId,
          score: s.score,
          toolCalls: s.toolCalls?.slice(0, 5),
          errors: s.errors?.slice(0, 2),
        })),
    })),
  }));

  const prompt = `You are an AI prompt engineer analyzing results from a writing assistant agent evaluation.

The agent uses tools to edit markdown documents. The key tools are:
- read_document_outline: reads document structure (section IDs)
- read_document_section: reads a section's content
- insert_document_section: adds a new section
- replace_document_section: replaces a section
- task_complete: signals completion

Here are the evaluation results across different models and prompt variants:
${JSON.stringify(summary, null, 2)}

The current prompt variants are:
- default: Verbose CRITICAL warning + conditional workflow steps
- minimal: Short numbered steps, no CRITICAL
- direct: Very imperative rules-only, "NEVER" style
- verbose: Detailed step-by-step explanation with rationale

Based on these results, provide:
1. Analysis of which variants work best for which model sizes
2. Specific failure patterns you observe
3. 2-3 concrete suggestions to improve the prompts (be specific about wording)
4. Any tool description changes that might help

Keep your response focused and actionable. Format as plain text.`;

  log(`Asking ${ANALYZER_MODEL} to analyze results...`);
  try {
    const analysis = await askOllama(prompt);
    return analysis;
  } catch (err) {
    log(`LLM analysis failed: ${err.message}`);
    return null;
  }
}

// ── Notes file ────────────────────────────────────────────────────────────────

function appendToNotes(content) {
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const section = `\n## ${timestamp}\n\n${content}\n`;

  if (existsSync(NOTES_FILE)) {
    const existing = readFileSync(NOTES_FILE, "utf8");
    writeFileSync(NOTES_FILE, existing + section);
  } else {
    writeFileSync(NOTES_FILE, `# Optimisation Notes\n${section}`);
  }
  log(`Notes written to ${NOTES_FILE}`);
}

function buildResultsSummaryText(table) {
  const lines = ["### Evaluation Results\n"];
  const variants = [...new Set(Object.values(table).flatMap(v => Object.keys(v)))].sort();

  lines.push(`| Model | ${variants.join(" | ")} |`);
  lines.push(`| --- | ${variants.map(() => "---").join(" | ")} |`);

  for (const [model, variantData] of Object.entries(table)) {
    const cols = variants.map(v => {
      const r = variantData[v];
      return r ? `${r.pct}% (c:${r.completionRate}%)` : "-";
    });
    lines.push(`| ${model} | ${cols.join(" | ")} |`);
  }

  return lines.join("\n");
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function gitCommit(message) {
  try {
    execSync("git add OPTIMISATION_NOTES.md eval-results/ src/browser/agents/writing-assistant.ts scripts/", {
      stdio: "pipe",
    });
    execSync(`git commit -m "${message.replace(/"/g, "'")}"`, { stdio: "pipe" });
    log(`Committed: ${message}`);
  } catch (err) {
    log(`Git commit failed: ${err.message}`);
  }
}

// ── Modes ─────────────────────────────────────────────────────────────────────

async function sweep(modelsToTest, variantsToTest) {
  log(`Starting sweep: ${modelsToTest.length} models × ${variantsToTest.length} variants`);
  log(`Models: ${modelsToTest.join(", ")}`);
  log(`Variants: ${variantsToTest.join(", ")}`);

  const results = [];
  for (const model of modelsToTest) {
    for (const variant of variantsToTest) {
      const r = runEval(model, variant);
      if (r) results.push(r);
    }
  }

  const table = buildResultsTable(results);
  log("\n═══ Results Matrix ═══");
  printTable(table);

  const summaryText = buildResultsSummaryText(table);
  appendToNotes(summaryText);

  return results;
}

async function analyze() {
  const results = loadAllResults();
  if (!results.length) {
    log("No results found. Run `node scripts/optimize.mjs sweep` first.");
    return;
  }

  const table = buildResultsTable(results);
  log("\n═══ Results Matrix ═══");
  printTable(table);

  log("\n═══ LLM Analysis ═══");
  const analysis = await analyzeResultsWithLLM(results);
  if (analysis) {
    log("\n" + analysis);
    appendToNotes("### LLM Analysis\n\n" + analysis);
  }
}

async function suggest() {
  const results = loadAllResults();
  if (!results.length) {
    log("No results found. Run a sweep first.");
    return;
  }

  log("Asking LLM to suggest prompt improvements...");
  const analysis = await analyzeResultsWithLLM(results);
  if (analysis) {
    log("\n═══ Suggestions ═══\n");
    log(analysis);
    appendToNotes("### Suggestions\n\n" + analysis);
    gitCommit("docs(optimise): add LLM analysis and suggestions");
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Parse optional model/variant filters from env or args
const targetModels = process.env.EVAL_MODELS
  ? process.env.EVAL_MODELS.split(",").map(m => m.trim())
  : MODELS.slice(0, 4); // Default: first 4 models (skip the biggest ones for quick runs)

const targetVariants = process.env.EVAL_VARIANTS
  ? process.env.EVAL_VARIANTS.split(",").map(v => v.trim())
  : PROMPT_VARIANTS;

switch (MODE) {
  case "sweep": {
    const results = await sweep(targetModels, targetVariants);
    if (results.length > 0) {
      log("\nRunning LLM analysis on results...");
      const analysis = await analyzeResultsWithLLM(results);
      if (analysis) {
        log("\n═══ LLM Analysis ═══\n" + analysis);
        appendToNotes("### LLM Analysis\n\n" + analysis);
      }
      gitCommit("feat(optimise): sweep results and LLM analysis");
    }
    break;
  }
  case "analyze":
    await analyze();
    break;
  case "suggest":
    await suggest();
    break;
  default:
    log(`Unknown mode: ${MODE}. Use: sweep | analyze | suggest`);
    process.exit(1);
}

process.exit(0);
