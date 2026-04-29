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

  // Inject document structure into every agent iteration so models can see section IDs
  // and content without an extra round-trip before editing.
  addContext = (): Record<string, unknown> => {
    const doc = this._getDoc();
    if (!doc) return {};
    const outline = doc.getOutline();
    return {
      focused_document: {
        note: "These sections already exist. Use replace_document_section to edit or fill any of them. Use insert_document_section ONLY to add a brand-new section that is NOT listed here.",
        sections: outline.map(s => ({
          section_id: s.sectionTitleId,
          title: s.sectionTitle,
          content: doc.getSectionContent(s.sectionTitleId),
        }))
      }
    };
  };

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

