export const CONTENT_BOUNDARY_START = "---BEGIN CONTENT---";
export const CONTENT_BOUNDARY_END = "---END CONTENT---";

export const BOUNDARY_PROMPT_ADDENDUM = `
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

export class PromptBuilder {
  private _basePrompt: string;
  private _instructions: Map<string, string[]> = new Map();

  constructor(basePrompt: string) {
    this._basePrompt = basePrompt;
  }

  withInstruction(key: string, instruction: string): this {
    if (!this._instructions.has(key)) {
      this._instructions.set(key, []);
    }
    this._instructions.get(key)!.push(instruction);
    return this;
  }

  build(): string {
    const parts: string[] = [this._basePrompt];
    for (const instructions of this._instructions.values()) {
      parts.push(...instructions);
    }
    return parts.join("\n\n");
  }
}
