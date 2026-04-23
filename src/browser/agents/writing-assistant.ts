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

export class WritingAssistant implements Agent {
  readonly id = "writing-assistant";
  readonly requiredCapability = "tool_calls";

  filterTools(tools: ToolSchema[]): ToolSchema[] {
    return tools.filter(t => TOOL_NAMES.has(t.function.name));
  }

  buildSystemPrompt(tools: ToolSchema[]): string {
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

After create_document succeeds, proceed immediately to populate the new document with content.

Only reply with plain text (no tool calls) for questions or explanations. When a tool signals that no document is open, tell the user to open one.`;
  }

  buildContinuationPrompt(): string {
    return "You have not yet called task_complete. If there is still work to do, continue using tools now. If you are finished, call task_complete.";
  }
}
