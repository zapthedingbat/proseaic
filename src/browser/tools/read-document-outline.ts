import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Call this before any document read or edit tool. The focused document is already open — call this immediately without calling open_document first. Only skip if document_management.focused_document_id is null; in that case tell the user no document is open.",
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

