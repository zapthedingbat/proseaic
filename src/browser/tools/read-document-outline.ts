import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Call this first to understand document structure before reading or editing sections. If no document is open, the tool will return an error — create one first.",
  function: {
    name: "read_document_outline",
    description: "Read the outline of the current document in the editor. Use this first when a task involves reviewing, summarizing, or editing document structure.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

export class ReadDocumentOutlineTool {
  schema = schema;
  private _getDoc: () => IStructuredDocument | null;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, getDoc: () => IStructuredDocument | null) {
    this._logger = loggerFactory("Read Document Outline Tool");
    this._getDoc = getDoc;
  }
  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const doc = this._getDoc();
    if (!doc) {
      throw new Error("No focused editor is available.");
    }
    const outline = doc.getOutline();
    return {
      outline
    };
  };
}

