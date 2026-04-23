const KNOWLEDGE_AREA = "copy writing and technical writing, proofreading, grammar correction, and general writing assistance";

export const CONTENT_BOUNDARY_START = "---BEGIN CONTENT---";
export const CONTENT_BOUNDARY_END = "---END CONTENT---";

const BOUNDARY_PROMPT_ADDENDUM = `
<contentBoundaryInstructions>
IMPORTANT: When generating substantial blocks of text content (prose, drafts, examples, code snippets, etc.), ALWAYS wrap them with these exact delimiters on their own lines:

${CONTENT_BOUNDARY_START}
[the actual content here]
${CONTENT_BOUNDARY_END}

EXAMPLES:
- If asked to "write a paragraph about X", wrap the paragraph with the markers
- If asked to "generate a section", wrap the section with the markers  

Use these markers for ANY substantial content block. Do NOT use them for brief explanations, commentary, or short answers.
The markers help the editor identify content you want the user to insert into their document.
</contentBoundaryInstructions>`;

const DEFAULT_BASE_PROMPT = `You are an assistant. Help the user.`;

import { ToolSchema } from "../tools/tool-schema.js";

class PromptBuilder {
  private basePrompt: string = "";
  private _instructions: Map<string, string[]> = new Map();

  constructor(basePrompt = DEFAULT_BASE_PROMPT) {
    this.basePrompt = basePrompt;
  }

  withInstruction(key: string, instruction: string): this {
    if (!this._instructions.has(key)) {
      this._instructions.set(key, []);
    }
    this._instructions.get(key)?.push(instruction);
    return this;
  }

  withTool(toolSchema: ToolSchema): this {
    if (toolSchema.instructions) {
      this.withInstruction("toolInstructions", toolSchema.instructions);
    }
    return this;
  }

  build(): string {
    let promptParts: string[] = [];

    // TODO: Implement prompt construction logic.

    return promptParts.join("\n");
  }
}


export function buildWritingAssistantSystemPrompt(includeBoundaryInstructions = false, toolSchemas: ToolSchema[] = []): string {

  const promptBuilder = new PromptBuilder();
  promptBuilder.withInstruction("knowledgeArea", `Your knowledge and capabilities are strongest in ${KNOWLEDGE_AREA}.`);

  if (includeBoundaryInstructions) {
    promptBuilder.withInstruction("contentBoundary", BOUNDARY_PROMPT_ADDENDUM);
  }

  for (const toolSchema of toolSchemas) {
    promptBuilder.withTool(toolSchema);
  }

  return promptBuilder.build();
}