import { ITool } from "../lib/tools/tool.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";

type ToolCallArgs = {
  startLine?: number;
  endLine?: number;
};

type ToolContext = {
  document?: string | null;
};

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "read_document_lines",
    description: "Read the current document by line range.",
    parameters: {
      type: "object",
      properties: {
        startLine: {
          type: "number",
          description: "The line number to start reading from, 1-based."
        },
        endLine: {
          type: "number",
          description: "The inclusive line number to end reading at, 1-based."
        }
      },
      required: ["startLine", "endLine"]
    }
  }
};

export class ReadDocumentLinesTool implements ITool {
  schema = schema;

  constructor(private context: ToolContext) {}
  
  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    const lines = (this.context.document || "").split(/\r?\n/);
    const safeStart = Math.max(1, Number((args as ToolCallArgs).startLine) || 1);
    const safeEnd = Math.max(safeStart, Number((args as ToolCallArgs).endLine) || safeStart);
    const excerpt = lines
      .slice(safeStart - 1, safeEnd)
      .map((line, index) => `${safeStart + index}: ${line}`)
      .join("\n");
    return {
      startLine: safeStart,
      endLine: safeEnd,
      content: excerpt
    };
  };
}
