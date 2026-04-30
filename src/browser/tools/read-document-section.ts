import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Call after read_document_outline. Use section_id from the outline results, not heading text.",
  function: {
    name: "read_document_section",
    description: "Read a specific section from the current editor document. Use after read_document_outline to inspect the exact content before reviewing or editing.",
    parameters: {
      type: "object",
      properties: {
        section_id: {
          type: "string",
          description: "Unique section ID from read_document_outline."
        }
      },
      required: ["section_id"]
    }
  }
};

export class ReadDocumentSectionTool {
  schema = schema;
  private _getDoc: () => IStructuredDocument | null;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, getDoc: () => IStructuredDocument | null) {
    this._logger = loggerFactory("Read Document Section Tool");
    this._getDoc = getDoc;
  }
  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const doc = this._getDoc();
    if (!doc) {
      throw new Error("No focused editor is available.");
    }
    const sectionId = args.section_id as string;

    const outline = doc.getOutline();
    const exists = outline.some(s => s.sectionTitleId === sectionId);
    if (!exists) {
      const validIds = outline.map(s => `${s.sectionTitleId} ("${s.sectionTitle}")`).join(", ");
      throw new Error(`Section '${sectionId}' not found. Call read_document_outline first. Valid IDs: ${validIds}`);
    }

    const sectionContent = doc.getSectionContent(sectionId);
    return {
        section: sectionContent
    };
  };
}

