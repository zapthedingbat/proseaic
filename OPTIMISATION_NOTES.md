# Optimisation Notes

Running log of findings from automated evaluation of the ProseAI writing assistant.

## Setup

**Evaluation approach**: Playwright-based harness (`scripts/eval.mjs`) that:
1. Creates a test document via the REST API
2. Opens it in the browser
3. Sends a chat prompt
4. Waits for the agent loop to complete
5. Scores: tool usage correctness, doc changes, task_complete called, iteration count

**Scoring (0–4 per scenario)**:
- +1 `task_complete` was called
- +1 required tools were used
- +1 document changed correctly (or answer was correct for Q&A scenarios)
- +1 completed in ≤ 4 iterations

**Test scenarios**:
| ID | Description |
|----|-------------|
| `add-section` | Add a new "Summary" section at end of doc |
| `edit-section` | Rewrite the Introduction to be 2 sentences |
| `answer-question` | How many unchecked tasks? (expects "4") |
| `multi-section-fill` | Fill two empty sections with bullet points |
| `remove-section` | Remove "Draft Notes" section, keep Timeline |

**Prompt variants**:
| Variant | Description |
|---------|-------------|
| `default` | Current production prompt (CRITICAL + conditional workflow) |
| `minimal` | Short numbered steps, no CRITICAL, no conditionals |
| `direct` | Imperative rules-only, "NEVER output text" style |
| `verbose` | Detailed with per-step rationale, encouraging tone |
| `task-explicit` | Like default but with extra task_complete reminders |
| `ultra-minimal` | Bare-minimum: just role + use tools + task_complete |

**Models tested** (Ollama, local):
| Model | Size | Notes |
|-------|------|-------|
| `qwen3.5:0.8b` | 1GB | 90% — correct answers, too many iterations on multi-step |
| `llama3.2:1b` | 1GB | Not yet tested |
| `llama3.2:3b` | 2GB | Best overall performer |
| `phi4-mini:3.8b` | 2GB | 0% — outputs tool calls as raw text, not structured tool_calls |
| `gemma4:e2b` | 7GB | Medium, reliable for replace/Q&A, broken for add-section |
| `gpt-oss:20b` | 14GB | Medium-large, tested once |
| `qwen3.6:35b` | 24GB | Crashes server after 1st scenario (OOM) |

---

## Results summary

### Baseline (before optimisations)

| Model | Score | Notes |
|-------|-------|-------|
| gemma4:e2b / default | 38-75% | Variable; add-section always fails |
| phi4-mini:3.8b / default | 0% | No tool calls ever produced |
| phi4-mini:3.8b / ultra-minimal | 0% | Same |
| gpt-oss:20b / default | 56% | Correct tool calls, doc save issue |
| qwen3.6:35b / default | 44% | OOM after first scenario |
| llama3.2:3b / default | 81% | Best baseline, wrong arg names |

### After optimisations (4-scenario suite)

| Model | Score | Notes |
|-------|-------|-------|
| llama3.2:3b / default | 88-100% | Avg ~90%, fully correct ~1/3 runs |
| gemma4:e2b / default | 75% | Stable; still broken on add-section |

### After scorer fix + insert-redirect + context note (5-scenario suite, corrected scorer)

**Corrected scorers**: `multi-section-fill` now uses `extractSection()` helper (was false-passing when Q2 empty). `answer-question` now rejects "4 total, 1 unchecked" pattern.

**eval.mjs fix**: `scoreReply` now also checks the `task_complete` summary field, not just `lastAssistantText`. Models like qwen3.5:0.8b put answers directly in the task_complete summary; missing this caused false-fails.

| Model | Score | Notes |
|-------|-------|-------|
| llama3.2:3b / default | 19/20 (95%) | Stable; answer-question 3/4 (3B reasoning limit) |
| gemma4:e2b / default | 17/20 (85%) | add-section 1/4 (stochastic task_complete after insert) |
| qwen3.5:0.8b / default | 16–18/20 (80–90%) | High variance — answer-question sometimes modifies doc instead; multi-section-fill fails stochastically |
| llama3.2:1b / default | 5/20 (25%) | Not viable — generates 280k tokens per response (infinite generation) |

### After auto-complete fix + balanced focused_document note

**Changes**: (a) Auto-complete detection added to `chat-session.ts` — if model produces empty response after a successful edit, loop exits cleanly instead of spinning 10 times; (b) `focused_document` note reworded to mention update/delete/insert equally (previously "use replace to edit or fill any of them" was causing qwen3.5 to replace instead of remove in remove-section tasks); (c) System prompt task_complete step softened to "After calling an edit tool, call task_complete immediately" (sequential language consistent with replace tool's proven pattern).

**Instruction wording experiment**: Changed insert/remove instructions to "simultaneously, not sequentially" (vs replace's "after replacing…"), then reverted back. No consistent improvement — gemma4's batching behavior is training-determined, not prompt-controlled.

| Model | Score (avg) | Range | Notes |
|-------|------------|-------|-------|
| gemma4:e2b / default | ~17/20 | 16–18 | Stochastic: remove-section sometimes 4/4, sometimes 2/4. add-section consistently 2/4 |
| qwen3.5:0.8b / default | 18/20 | 17–18 | Stable; multi-section-fill 3/4 (excess iters), answer-question stochastic 2–3/4 |
| llama3.2:3b / default | ~18/20 | 17–19 | Stable; answer-question 2–3/4 (reasoning limit), stochastic multi-section-fill |

**gemma4:e2b per-scenario** (stable pattern, e.g. `1777509475965`):
| Scenario | Score | Iterations | Notes |
|----------|-------|------------|-------|
| add-section | 2/4 | 2 | Doc correct, auto-complete fires, no task_complete scored |
| edit-section | 4/4 | 2 | replace + task_complete in same batch — always reliable |
| answer-question | 4/4 | 3 | Reads section, answers correctly |
| multi-section-fill | 4/4 | 1 | All 3 tools in single batch (excellent) |
| remove-section | 2–4/4 | 2 | Stochastic: sometimes batches task_complete, sometimes not |

**llama3.2:3b per-scenario** (typical run, e.g. `1777502116181`):
| Scenario | Score | Iterations | Notes |
|----------|-------|------------|-------|
| add-section | 4/4 | 2 | Inserts Summary + task_complete in same batch |
| edit-section | 4/4 | 2–3 | Replaces heading-1 directly from context |
| answer-question | 3/4 | 3 | Reads section but counts wrong ("1 unchecked") |
| multi-section-fill | 4/4 | 2 | Replaces heading-1 and heading-2 directly |
| remove-section | 4/4 | 2 | Removes heading-2 directly from context |

**qwen3.5:0.8b per-scenario** (stable across 2 runs, e.g. `1777503747557`):
| Scenario | Score | Iterations | Notes |
|----------|-------|------------|-------|
| add-section | 4/4 | 2–3 | Inserts + task_complete in same batch |
| edit-section | 4/4 | 3–4 | Replaces section correctly |
| answer-question | 3/4 | 4–6 | Correct answer ("4 unchecked") but too many iterations for efficiency point |
| multi-section-fill | 3/4 | 6 | Correct doc result but 6 iterations (uses insert errors to discover existing sections) |
| remove-section | 4/4 | 2–4 | Removes correctly, calls task_complete |

Note: qwen3.5:0.8b puts the answer in `task_complete({ summary: "..." })` rather than assistant text — fixed by checking both sources in scoreReply.

**gemma4:e2b per-scenario** (typical run, e.g. `1777502032749`):
| Scenario | Score | Iterations | Notes |
|----------|-------|------------|-------|
| add-section | 1/4 | 10 | Inserts correctly, never calls task_complete |
| edit-section | 4/4 | 2–3 | Replaces heading-1, calls task_complete |
| answer-question | 4/4 | 2–3 | Reads section, answers "4 unchecked" correctly |
| multi-section-fill | 4/4 | 3 | Replaces heading-1 and heading-2 directly (after context note) |
| remove-section | 4/4 | 2–3 | Removes heading-2, calls task_complete |

### gemma4:e2b prompt variant sweep (pre-optimisation)

| Variant | Score | Notes |
|---------|-------|-------|
| default | 69-75% | Best variant |
| minimal | 63% | -- |
| verbose | 69% | -- |
| task-explicit | 69% | -- |
| direct | 19% | Catastrophic -- model stopped using tools |

---

## Key findings

### 1. Document context injection (biggest win)
**Change**: Added `addContext()` to `ReadDocumentOutlineTool` that injects the full document outline and section content into every agent iteration as `<focused_document>` XML context.

**Effect**: Models can see section IDs (`heading-0`, `heading-1`, etc.) and content without calling `read_document_outline` first. This:
- Eliminated the need for a `read_document_outline` + `read_document_section` round-trip before edits
- Allowed models to use correct section IDs directly (e.g. `heading-1` for "Introduction")
- Enabled Q&A answers from context without extra tool calls
- Reduced average iterations from ~4 to ~2.3 for llama3.2:3b

**Impact**: llama3.2:3b went from 81% to 88-100%.

### 2. Argument aliasing
**Change**: `replace_document_section` and `insert_document_section` now accept `new_text`, `content`, `text` as aliases for `section_content`.

**Effect**: llama3.2:3b was calling `replace_document_section({"section_id":"...","new_text":"..."})` -- wrong arg name. With aliasing, these calls now succeed.

### 3. Section ID validation with helpful errors
**Change**: `replace_document_section` and `read_document_section` now throw a helpful error when section ID is not found, listing all valid IDs.

**Effect**: When models guess wrong section IDs, they get: "Section 'Introduction' not found. Valid IDs: heading-0 ('Technical Spec'), heading-1 ('Introduction'). Call read_document_outline first." This allows recovery in fewer iterations.

### 4. Tool response hints
**Change**: `insert_document_section` and `replace_document_section` return `next_step: "Call task_complete now..."` in their result.

**Effect**: Helps models know what to do after a successful edit.

### 5. Replace vs insert guidance in system prompt
**Change**: Added to default prompt: "Use replace_document_section to update a section that already exists (even if empty). Use insert_document_section only to create a brand-new section that does not yet exist."

**Effect**: llama3.2:3b stopped using `insert` on existing sections for multi-section-fill. This scenario went from 3/4 to 4/4.

---

## Known failure patterns

### gemma4:e2b -- add-section never calls task_complete (partially resolved)
- **Symptom**: After `insert_document_section` succeeds, model generates empty responses (96+ tokens, `eval_count > 0`, but `content=''`, `tool_calls=[]`, `thinking=''`). Previously this caused 10-iteration loops. Stochastic (~2/3 failure rate). Scores 2/4 (doc correct, auto-complete exits, but no task_complete).
- **Root cause**: When gemma4 includes task_complete in the SAME Ollama batch as insert, it works (score 4/4). When it doesn't batch them together, the model produces empty responses on the continuation turn — reasoning says "call task_complete" but generates nothing. The insert result updates the `focused_document` context to show the newly-inserted section as existing, which appears to confuse the model's follow-up generation.
- **Attempted fixes** (none fully resolved):
  - Various `next_step` phrasings in insert response
  - `required_next_action: "task_complete"` field (caused remove-section to take 9 iters)
  - Matching insert response format to replace response: `{ inserted: true, next_step: "Section updated successfully..." }`
  - "Include task_complete in the SAME response" instruction in system prompt (→ fixed remove-section, not add-section)
  - Short continuation prompt: "Call task_complete now." vs "task_complete()"
  - Keeping text turn in context vs dropping it (keeping broke llama3.2 answer-question from 3→0/4)
- **Mitigation**: Auto-complete in `chat-session.ts` now detects empty response after edit result and exits cleanly (loop doesn't spin 10 times). Score improved from 1/4 to 2/4.
- **Pattern**: gemma4 reliably batches task_complete with `replace_document_section` (always 4/4) but not with `insert_document_section` or `remove_document_section`. Likely model training bias — training data had more "replace + complete" examples than "remove + complete" or "insert + complete" patterns.
- **Instruction wording is not the cause**: Tried both "simultaneously" and "after X, call task_complete immediately" — no consistent difference. The batching decision is made at sampling time, not guided by prompt language.

### gemma4:e2b -- multi-section-fill uses insert instead of replace (resolved with context note)
- **Original symptom**: Even with explicit prompt guidance, gemma4 used `insert` for existing sections (creating duplicates).
- **Fix**: Added a `note` field to the `focused_document` context that explicitly says "Use replace_document_section to edit or fill any of them. Use insert_document_section ONLY to add a brand-new section not listed here."
- **Result**: gemma4 now uses replace directly for both Q1 and Q2, scoring 4/4 in 3 iterations.

### qwen3.5:0.8b -- excess iterations on multi-step scenarios
- **Symptom**: answer-question and multi-section-fill consistently take 5–6 iterations (>4 limit), losing the efficiency point. Simple scenarios (add/edit/remove) complete in 2–4 iters.
- **Root cause**: On multi-section-fill, qwen3.5:0.8b tries `insert_document_section` first (despite the context note), hits the existence-check error, then retries with `replace_document_section`. This insert-error-recover cycle adds 2–3 iterations. On answer-question, the model makes 2 read calls (outline + section) plus 2 more tool interactions before answering.
- **Status**: Partially resolved via `think: false` (see below). With thinking enabled, the model enters empty-response loops. With `think: false`, multi-section-fill drops to 3 iterations. However, `think: false` also introduces stochastic answer-question failures where the model modifies the document instead of just answering. Net effect: ~17-19/20 either way.

### Thinking mode (think: true vs think: false) — mixed results across models
- **Discovery**: Both qwen3.5:0.8b and gemma4:e2b report 'thinking' in their Ollama capabilities, so they receive `think: true` by default.
- **Effect on qwen3.5:0.8b with think: false**: Eliminates empty-response loops. Multi-section-fill drops from 6 to 3 iterations. Average score ~19/20. However, answer-question sometimes fails by modifying the document instead of answering (new failure mode).
- **Effect on gemma4:e2b with think: false**: Breaks `task_complete` batching for remove-section (same pattern as add-section failure). Score drops from 17/20 to 14/20 consistently. Thinking was helping the model include task_complete in the same batch for remove-section.
- **Conclusion**: `think: false` is not a net improvement — it helps qwen3.5:0.8b (~17→19/20) but hurts gemma4:e2b (~17→14/20). Reverted.
- **Infrastructure kept**: Added `getGenerateOptions()` to Agent interface and wired it through ChatSession for future per-model-or-per-agent configuration.

### phi4-mini:3.8b -- text-format tool calls (not viable)
- **Symptom**: All scenarios fail with 0 structured tool calls. Score 0%.
- **Root cause**: Model outputs tool calls as raw text content instead of structured `tool_calls` array. Example response content: `remove_document_section({"section_id":"heading-2"})\ntask_complete()` as plain text. Ollama's chat API may not be correctly formatting the tool-calling prompt template for this model family.
- **Tested variants**: default, ultra-minimal. Neither produced structured `tool_calls`.
- **Not viable** without a text-to-structured-tool-call parser. Current architecture requires `response.message.tool_calls` to be populated.

### llama3.2:1b -- not viable (infinite generation)
- **Symptom**: All scenarios timeout. 1 iteration, no tool calls, no text.
- **Root cause**: With 1B parameters and the full writing assistant system prompt (~200+ tokens of tools + context), the model generates 280,000+ tokens of hallucinated text in a single response. The generation never completes within the 2-minute eval timeout.
- **Note**: This is NOT a timeout configuration issue — the problem was confirmed at 30s AND 120s timeouts. The model simply cannot handle structured tool call schemas at this parameter count.
- **eval.mjs fix**: Fixed `waitForFunction` ignoring explicit timeout — Playwright 1.59.1 uses the page's default timeout (30s) instead of the `{ timeout }` option. Fixed with `page.setDefaultTimeout(CHAT_TIMEOUT)` after page creation.

### llama3.2:3b -- stochastic behavior
- **Symptom**: Score varies between 88-100% across runs. Failures are:
  - add-section: Sometimes creates "Project Summary" instead of "Summary" (strict title match in scorer)
  - answer-question: Sometimes reads section but gives wrong count (3B reasoning limit)
  - multi-section-fill: Sometimes inserts new section instead of replacing existing one

### Scorer leniency — false passes (fixed)

These were identified and fixed in `scripts/scenarios.mjs`:

- **answer-question regex too loose**: `/\b4\b|four/i` matched "4" in "4 action items in total, but only 1 unchecked". Fixed to require 4/four not be contradicted by a different unchecked count in the same sentence.
- **multi-section-fill regex overshoot**: `/## Q2 Goals\n+([\s\S]*?)(?=\n##|$)/` — the greedy `\n+` consumed all blank lines between Q2 and Q3, leaving `[\s\S]*?` to expand to `$` (end of string) and capture Q3's content. Fixed by replacing with `extractSection()` helper (indexOf + slice to next heading).
- **Root cause of regex overshoot**: When `\n+` (greedy) consumes all blank lines, the lazy `[\s\S]*?` must satisfy `(?=\n##|$)`. Since `\n##` is now behind the cursor and `$` is ahead, the lazy term expands all the way to end-of-string.
- **Implication**: Before these fixes, gemma4:e2b appeared to score 85% but actually scored 60% (multi-section-fill was a false pass every time).

### slug-based section IDs (reverted)
- **Attempted**: Changed section IDs from `heading-N` to title slugs (`introduction`, `q1-goals`)
- **Result**: Regression from 88% to 69% -- models started using URL paths and markdown link syntax as IDs
- **Lesson**: `heading-N` IDs are opaque enough that models know they need to call `read_document_outline` to get them (or read the context). Slug IDs look like guessable values, causing models to hallucinate creative wrong IDs.

### duplicate insert guard (reverted)
- **Attempted**: Block `insert_document_section` if section with same title already exists
- **Result**: gemma4 got into infinite error loops because it kept retrying insert after success
- **Lesson**: Error feedback must lead to a recoverable path. If the model doesn't understand the error, it loops.

---

## Architecture notes

- Ollama models have `supportsStreamingToolCalls: false` -- they return all tool calls at the end, not streamed.
- The agent loop runs up to 10 iterations. Smaller models often use more iterations.
- Context injection: every agent iteration prepends a fresh `<focused_document>` context block (~200-500 tokens for typical docs).
- Tool `instructions` strings are appended to the system prompt via `PromptBuilder`.
- Section IDs use positional `heading-N` format (0-indexed counter across all headings in document order).

---

## Changes made to production code

### src/browser/tools/insert-document-section.ts
- Arg aliasing: `section_title` accepts `title`, `heading`, `name`
- Arg aliasing: `section_content` accepts `new_text`, `content`, `text`
- Validation: throws helpful error if `section_title` is missing
- Response hint: `next_step: "Call task_complete now unless you still have more sections to add."`

### src/browser/tools/replace-document-section.ts
- Arg aliasing: `section_content` accepts `new_text`, `content`, `text`
- Section ID validation: throws with valid IDs if section not found
- Response hint: `next_step: "Call task_complete now unless you still have more sections to edit."`

### src/browser/tools/read-document-section.ts
- Section ID validation: throws with valid IDs if section not found

### src/browser/tools/task-complete.ts
- Updated description and instructions to be clearer about being the final step

### src/browser/tools/read-document-outline.ts
- Added `addContext()` that injects `focused_document` (section_id, title, content per section) into every agent iteration

### src/browser/agents/writing-assistant.ts
- Added prompt variant system (`window.__promptVariant` / localStorage `ai.prompt_variant`)
- Added 5 prompt variants: minimal, direct, verbose, ultra-minimal, task-explicit
- Default prompt: added explicit task_complete after edit tools rule
- Default prompt: added replace vs insert selection rule
- Default prompt: added Q&A section reading guidance
- Continuation prompt: strengthened to explicitly call task_complete

### src/browser/components/codemirror-editor.ts
- `getOutline()` now uses `s.id` directly from `splitIntoSections` (consistency fix)

### src/browser/tools/remove-document-section.ts
- Section ID validation: throws with valid IDs if section not found
- Response hint: `next_step: "Section removed. Call task_complete now to finish."`
- Updated instructions: "After the section is removed, call task_complete immediately to finish."

### src/browser/tools/replace-document-section.ts
- Updated description: "Replace or fill in an existing section (even if currently empty). Use this whenever a section already exists."
- Updated instructions: "Use for sections that ALREADY EXIST — whether the section is empty or has content."

### src/browser/tools/insert-document-section.ts
- Added existence check: if a section with the same title already exists, throws an error with the section_id and directs to use replace_document_section instead (prevents duplicate headings)
- Updated instructions: "Use ONLY for sections that do NOT already exist. If the section already exists, use replace_document_section instead."

### src/browser/tools/read-document-outline.ts
- Restructured `focused_document` context to include a `note` field at the top level instructing models to use replace for existing sections and insert only for new ones
- Updated note to be operation-balanced: "To update or fill a section, use replace_document_section. To delete a section, use remove_document_section. To add a brand-new section NOT listed here, use insert_document_section." (Fixes qwen3.5:0.8b using replace instead of remove in remove-section tasks)

### scripts/scenarios.mjs
- Added `remove-section` scenario: removes "Draft Notes" section, verifies Timeline still present
- Added `extractSection()` helper for accurate section content extraction (avoids regex overshoot bug)
- Fixed `multi-section-fill` scorer to use `extractSection()`
- Fixed `answer-question` scorer to require "4" not contradicted by a different unchecked count

### scripts/eval.mjs
- Fixed argument parsing to support both positional args and `--model`/`--variant` flags via null-sentinel tracking. Previously `--model gemma4:e2b` set `MODEL = "--model"`, causing 500 errors from Ollama (model not found).

### src/browser/lib/chat/chat-session.ts (session 3)
- Removed auto-complete detection heuristic (per user: simplify — all models with tool capability should inject continuation if no tool call)
- Continuation prompt now fires whenever no tool calls produced (regardless of what's in tool results context)
- `done` handler: only push assistant message to `contextMessages` if it has actionable output (text or tool calls). Empty/thinking-only turns go to history but not context — prevents consecutive user messages when a continuation is later injected.
- Continuation replacement: when the previous context message is already a pure-text user message (a prior continuation), pop it before adding the new one. Prevents continuation stacking that creates malformed consecutive-user-message sequences.
- Added "thinking-only turn" diagnostic log: when `isThinking` is true but no text/tool_calls produced, logs thinking content length at the `done` event.

### src/browser/agents/writing-assistant.ts (session 3)
- Changed task_complete workflow step to: "Call task_complete after the edit is done. If multiple edits are needed, call task_complete once all are complete."
- Changed CRITICAL footer to: "After calling an edit tool (insert/replace/remove/move), call task_complete immediately. Do not write text or re-read the document after editing."

### src/browser/tools/insert-document-section.ts (session 3)
- Updated `instructions`: "After inserting, call task_complete to finish." (sequential style, consistent with replace_document_section's proven pattern)

### src/browser/tools/remove-document-section.ts (session 3)
- Updated `instructions`: "After removing, call task_complete to finish." (sequential style, consistent with replace_document_section's proven pattern)

### src/browser/platform/ollama/ollama-platform.ts (session 3)
- `_formatAssistantMessage` now returns `OllamaAssistantRequestMessage | null` — returns `null` for empty messages (no text, no tool calls). Previously returned `content: " "` (a space placeholder), which poisoned the Ollama context and caused subsequent turns to collapse to `eval_count: 1`.
- Added diagnostic log when done chunk has no actionable content (text or tool calls).

### scripts/eval.mjs (session 3)
- Widened browser debug log filter to capture "Thinking-only turn" diagnostic messages in addition to existing patterns.

---

## Context poisoning bug (session 3 investigation)

**Symptom**: After fixing the `" "` placeholder, diagnostic logs showed gemma4 producing `eval_count: 424` but `content: ""` with `done_reason: "stop"`. 424 tokens were evaluated but zero content produced.

**Diagnosis**: The model is generating thinking tokens (in intermediate streaming chunks as `message.thinking`) and then deciding not to produce any output — a valid model behavior. Those tokens count toward `eval_count` but produce no `content`. This is NOT a bug in our streaming reader; we correctly capture thinking tokens as `reasoning_delta` events and populate `assistantMessage.thinking`.

**Root cause of the original problem**: When `_formatAssistantMessage` returned `content: " "` for empty messages, those messages were sent back to Ollama in subsequent turn context. Ollama's context window grew with each empty turn (prompt_eval_count increased by ~16 per turn), and the space-prefixed context caused the model to collapse its output to 1 token. This is the "context poisoning" pattern.

**Fix**: Return `null` from `_formatAssistantMessage` for empty messages. The `filter(Boolean)` call in `buildModelInput` removes them from the request. Additionally, the `done` handler in `chat-session.ts` now skips pushing empty turns to `contextMessages`, preventing the consecutive-user-messages problem that would arise when a continuation is later injected.

**Result after fix**: `prompt_eval_count` stays stable at 2312 between turns (instead of growing by 16 per turn). gemma4 evaluates 28–110 tokens per empty turn instead of collapsing to 1. Model still cannot call `task_complete` after `insert_document_section` — that's a model-training limitation, not a context issue.
