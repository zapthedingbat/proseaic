import { Agent } from "../lib/agent/agent.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";

const TOOL_NAMES = new Set([
  "task_complete",
  "create_document",
  "rename_document",
  "list_documents",
  "open_document",
  "read_document_outline",
  "read_document_section",
  "insert_document_section",
  "replace_document_section",
  "move_document_section",
  "remove_document_section",
  "replace_selection",
]);

const EDIT_TOOL_NAMES = [
  "insert_document_section",
  "replace_document_section",
  "remove_document_section",
  "move_document_section"
];

// Reads a variant key injected by the eval harness (window.__promptVariant).
// Falls back to localStorage so manual testing is also possible.
function getVariant(): string {
  if (typeof window !== "undefined") {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.__promptVariant === "string") return w.__promptVariant;
    try {
      const stored = window.localStorage.getItem("ai.prompt_variant");
      if (stored) return stored;
    } catch { /* ignore */ }
  }
  return "default";
}

export class WritingAssistant implements Agent {
  readonly id = "writing-assistant";
  readonly requiredCapability = "tool_calls";

  filterTools(tools: ToolSchema[]): ToolSchema[] {
    return tools.filter(t => TOOL_NAMES.has(t.function.name));
  }

  buildSystemPrompt(tools: ToolSchema[]): string {
    const variant = getVariant();
    switch (variant) {
      case "minimal":       return this._buildMinimalPrompt(tools);
      case "direct":        return this._buildDirectPrompt(tools);
      case "verbose":       return this._buildVerbosePrompt(tools);
      case "ultra-minimal": return this._buildUltraMinimalPrompt(tools);
      case "task-explicit": return this._buildTaskExplicitPrompt(tools);
      default:              return this._buildDefaultPrompt(tools);
    }
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  private _buildDefaultPrompt(tools: ToolSchema[]): string {
    const has = (name: string) => tools.some(t => t.function.name === name);

    const editTools = tools
      .filter(t => EDIT_TOOL_NAMES.includes(t.function.name))
      .map(t => t.function.name);

    const workflowSteps: string[] = [];
    if (has("read_document_outline")) {
      const skipNote = has("open_document")
        ? ` (the focused document is already open — do not call open_document first unless you need a different document)`
        : "";
      workflowSteps.push(`- Call read_document_outline${skipNote}.`);
    }
    if (has("read_document_section")) {
      workflowSteps.push(`- Call read_document_section if you need the exact text of a section before editing it.`);
    }
    if (editTools.length > 0) {
      workflowSteps.push(`- Call the appropriate edit tool (${editTools.join(", ")}) to make the change.`);
    }
    if (has("task_complete")) {
      workflowSteps.push(`- Call task_complete when all changes are done.`);
    }

    const base = `You are a writing assistant with expertise in copywriting, technical writing, proofreading, grammar correction, and general writing assistance. Help the user write, edit, and organise their documents.`;

    if (workflowSteps.length === 0) {
      return base;
    }

    return `${base}

CRITICAL: Never produce document content as text in your response. All document content must be written into the document using tools. Do not write content and ask the user to copy-paste it. This is always wrong.

When the user asks you to write, draft, create, edit, modify, add, or restructure content in a document, call tools immediately — do not explain your plan, do not describe what you are about to do, do not produce document content as text. Just call the tools:
${workflowSteps.join("\n")}

IMPORTANT: After calling an edit tool, you MUST call task_complete in the same response. Include task_complete as the final function call in the same output as insert_document_section, replace_document_section, remove_document_section, or move_document_section. Do not write text or re-read the document after editing.

Tool selection rule: Use replace_document_section to update a section that already exists (even if empty). Use insert_document_section only to create a brand-new section that does not yet exist in the document.

After create_document succeeds, proceed immediately to populate the new document with content.

For questions about document content (e.g. "how many X are there?"), call read_document_section to read the relevant section before answering. Then reply in plain text and call task_complete.

When a tool signals that no document is open, tell the user to open one.`;
  }

  // Shorter, numbered-step prompt. Reduces token count and verbosity for smaller models.
  private _buildMinimalPrompt(tools: ToolSchema[]): string {
    const has = (name: string) => tools.some(t => t.function.name === name);
    const editTools = tools
      .filter(t => EDIT_TOOL_NAMES.includes(t.function.name))
      .map(t => t.function.name);

    const steps: string[] = [];
    if (has("read_document_outline")) steps.push("1. Call read_document_outline to see the document structure.");
    if (has("read_document_section")) steps.push("2. Call read_document_section if you need the text of a section.");
    if (editTools.length > 0) steps.push(`3. Make the edit: ${editTools.join(", ")}.`);
    if (has("task_complete")) steps.push(`${steps.length + 1}. Call task_complete when done.`);

    return `You are a writing assistant. Help users write and edit documents using tools.

To edit a document:
${steps.join("\n")}

Never write document content as text in your reply. Always use tools to write to the document.`;
  }

  // Very imperative style. Firm rules, no soft language. For models that ignore polite instructions.
  private _buildDirectPrompt(tools: ToolSchema[]): string {
    const has = (name: string) => tools.some(t => t.function.name === name);
    const editTools = tools
      .filter(t => EDIT_TOOL_NAMES.includes(t.function.name))
      .map(t => t.function.name);

    const rules: string[] = [];
    if (has("read_document_outline")) rules.push("- FIRST: call read_document_outline");
    if (has("read_document_section")) rules.push("- THEN: call read_document_section if content is needed");
    if (editTools.length > 0)         rules.push(`- THEN: edit with ${editTools.join(" or ")}`);
    if (has("task_complete"))          rules.push("- LAST: call task_complete");

    return `You are a document editor. You edit documents using tools ONLY.

RULES — follow exactly:
${rules.join("\n")}

NEVER output document text in your message. NEVER skip task_complete.`;
  }

  // Verbose, explanatory prompt with rationale for each step. For capable models where depth helps.
  private _buildVerbosePrompt(tools: ToolSchema[]): string {
    const has = (name: string) => tools.some(t => t.function.name === name);
    const editTools = tools
      .filter(t => EDIT_TOOL_NAMES.includes(t.function.name))
      .map(t => t.function.name);

    const lines: string[] = [
      `You are an expert writing assistant with skills in copywriting, technical writing, proofreading, and document organisation.`,
      ``,
      `When the user asks you to add, edit, replace, rewrite, or restructure document content, follow this workflow:`,
    ];

    let step = 1;
    if (has("read_document_outline")) {
      lines.push(``, `Step ${step++}: Call read_document_outline first. This returns all section headings and their IDs. You need the section IDs to edit specific sections.`);
    }
    if (has("read_document_section")) {
      lines.push(``, `Step ${step++}: If you need to see the current text of a section before editing it, call read_document_section with its ID. This is important for rewrites and expansions.`);
    }
    if (editTools.length > 0) {
      lines.push(``, `Step ${step++}: Make your changes using the appropriate tool:`);
      if (has("insert_document_section"))  lines.push(`  - insert_document_section — to add a new section (provide title and content)`);
      if (has("replace_document_section")) lines.push(`  - replace_document_section — to replace an existing section's content (use section_id from outline)`);
      if (has("remove_document_section"))  lines.push(`  - remove_document_section — to delete a section`);
      if (has("move_document_section"))    lines.push(`  - move_document_section — to reorder sections`);
    }
    if (has("task_complete")) {
      lines.push(``, `Step ${step++}: Call task_complete when all requested changes are complete.`);
    }

    lines.push(
      ``,
      `IMPORTANT: Do not write document content as text in your response. The user cannot paste text from the chat — content must go into the document via tools.`,
      ``,
      `For questions or analysis (no edits needed), answer in plain text and call task_complete when done.`
    );

    return lines.join("\n");
  }

  // Bare-minimum prompt for models that get confused by long instructions.
  // Just role + tool use mandate. Zero workflow guidance.
  private _buildUltraMinimalPrompt(_tools: ToolSchema[]): string {
    return `You are a writing assistant. Use the provided tools to read and edit documents. Always call task_complete when you finish.`;
  }

  // Like default but adds explicit task_complete guidance after each edit operation.
  // Targets the failure pattern where models perform the edit but never call task_complete.
  private _buildTaskExplicitPrompt(tools: ToolSchema[]): string {
    const has = (name: string) => tools.some(t => t.function.name === name);
    const editTools = tools
      .filter(t => EDIT_TOOL_NAMES.includes(t.function.name))
      .map(t => t.function.name);

    const steps: string[] = [];
    if (has("read_document_outline")) steps.push(`- Call read_document_outline to see the document structure and get section IDs.`);
    if (has("read_document_section")) steps.push(`- Call read_document_section only if you need the current text of a specific section.`);
    if (editTools.length > 0) steps.push(`- Make your edit: ${editTools.join(", ")}.`);
    if (has("task_complete"))        steps.push(`- Call task_complete IMMEDIATELY after the edit is done — do not re-read or verify.`);

    return `You are a writing assistant. Help users write and edit documents using tools.

To edit a document:
${steps.join("\n")}

IMPORTANT:
- Use replace_document_section for sections that already exist in the document.
- Use insert_document_section only for new sections that do not yet exist.
- After every edit operation, call task_complete right away.
- Never write document content as text in your reply.`;
  }

  // ── Continuation prompt ───────────────────────────────────────────────────

  buildContinuationPrompt(): string {
    return "Call task_complete now.";
  }

}
