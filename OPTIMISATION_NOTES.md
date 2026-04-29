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
| `qwen3.5:0.8b` | 1GB | Not yet tested |
| `llama3.2:1b` | 1GB | Not yet tested |
| `llama3.2:3b` | 2GB | Best overall performer |
| `phi4-mini:3.8b` | 2GB | Never produces tool calls (0%) |
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

### After optimisations (5-scenario suite, includes remove-section)

| Model | Score | Notes |
|-------|-------|-------|
| llama3.2:3b / default | 20/20 (100%) | Avg 2.0 iterations — near-perfect |
| gemma4:e2b / default | 17/20 (85%) | Avg 4.4 iterations; add-section still 1/4 |

**llama3.2:3b per-scenario** (run `1777500207873`):
| Scenario | Score | Iterations | Notes |
|----------|-------|------------|-------|
| add-section | 4/4 | 2 | Inserted before Goals (not at end) — scored OK |
| edit-section | 4/4 | 2 | Replaced heading-1 directly from context |
| answer-question | 4/4 | 3 | Said "4 total, 1 unchecked" — regex matched "4" |
| multi-section-fill | 4/4 | 1 | Replaced Q1, but created Q3 instead of Q2; scorer passed |
| remove-section | 4/4 | 2 | Directly removed heading-2 without read_document_outline |

**gemma4:e2b per-scenario** (run `1777500324504`):
| Scenario | Score | Iterations | Notes |
|----------|-------|------------|-------|
| add-section | 1/4 | 10 | Inserted correctly, never called task_complete |
| edit-section | 4/4 | 2 | Replaced heading-1, called task_complete |
| answer-question | 4/4 | 3 | Read section, answered "4 unchecked" correctly |
| multi-section-fill | 4/4 | 3 | Replaced Q1, inserted duplicate Q2 instead of replacing |
| remove-section | 4/4 | 4 | Directly removed heading-2; needed 4 iters total |

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

### gemma4:e2b -- add-section never calls task_complete
- **Symptom**: After `insert_document_section` succeeds (doc changes), model makes 10 more iterations without calling `task_complete`. Always scores 1/4 on add-section.
- **Not fixed by**: IMPORTANT rules in prompt, `next_step` hint in tool response, continuation prompt.
- **Root cause**: Appears to be model-level behavior. gemma4 reliably calls `task_complete` after `replace_document_section` but not after `insert_document_section`.

### gemma4:e2b -- multi-section-fill uses insert instead of replace
- **Symptom**: Even with explicit prompt guidance to use `replace` for existing sections, gemma4 uses `insert`.
- **Effect on score**: 3/4 (required tool `replace_document_section` not used).

### llama3.2:3b -- stochastic behavior
- **Symptom**: Score varies between 88-100% across runs. Failures are:
  - add-section: Sometimes creates "Project Summary" instead of "Summary" (strict title match in scorer)
  - answer-question: Sometimes reads section but gives wrong count (3B reasoning limit)
  - multi-section-fill: Sometimes inserts new section instead of replacing existing one

### Scorer leniency — false passes
- **answer-question (llama3.2:3b)**: Scored 4/4 even though model said "4 total, 1 unchecked". The `scoreReply` regex `/\b4\b|four/i` matched "4" in "4 action items in total" — not the intended answer.
- **multi-section-fill (llama3.2:3b)**: Scored 4/4 even though model replaced Q1 then created a new Q3 section instead of replacing Q2. The `scoreDoc` regex checks that Q1 and Q2 have content, but Q2 still had the original empty content — only Q1 and Q3 were filled. The scorer passed because the regex matched partial content.
- **multi-section-fill (gemma4:e2b)**: Scored 4/4 despite model inserting a duplicate "Q2 Goals" heading instead of replacing the existing one. The doc now has two "Q2 Goals" sections; scorer passed because some Q2 content exists.
- **Implication**: Real accuracy may be lower than scored. The 100% llama3.2:3b result includes at least one scenario (multi-section-fill) that produced an imperfect document.

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

### scripts/scenarios.mjs
- Added `remove-section` scenario: removes "Draft Notes" section, verifies Timeline still present
