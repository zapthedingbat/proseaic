import { readDocumentLines } from "./tools/read-document-lines.js";
import { replaceDocument } from "./tools/replace-document.js";
import { replaceSelectionWithText } from "./tools/replace-selection.js";

export type ToolExecutor = (args: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown;

export type ToolDefinition = {
  name: string;
  execute: ToolExecutor;
};

export class ToolRegistry {
  private _tools: Map<string, ToolDefinition>;

  constructor(tools: ToolDefinition[] = []) {
    this._tools = new Map();
    this.registerMany(tools);
  }

  static create(): ToolRegistry {
    return new ToolRegistry().registerMany([
      { name: "read_document_lines", execute: readDocumentLines as ToolExecutor },
      { name: "replace_selection", execute: replaceSelectionWithText as ToolExecutor },
      { name: "replace_document", execute: replaceDocument as ToolExecutor }
    ]);
  }

  register(tool: ToolDefinition): ToolRegistry {
    this._tools.set(tool.name, tool);
    return this;
  }

  registerMany(tools: ToolDefinition[]): ToolRegistry {
    for (const tool of tools) {
      this.register(tool);
    }
    return this;
  }

  findTool(name: string): { execute: ToolExecutor } | null {
    const tool = this._tools.get(name);
    return tool ? { execute: tool.execute } : null;
  }
}
