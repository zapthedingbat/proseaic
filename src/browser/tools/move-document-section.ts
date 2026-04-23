import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Call after read_document_outline to understand the current section order. Use section_id values from the outline.",
  function: {
    name: "move_document_section",
    description: "Move an existing section in the current editor document to reorder sections.",
    parameters: {
      type: "object",
      properties: {
        section_id: {
          type: "string",
          description: "Unique section ID from read_document_outline for the section to move."
        },
        insert_before_section_id: {
          type: "string",
          description: "Optional unique section ID from read_document_outline to insert before."
        }
      },
      required: ["section_id"]
    }
  }
};

export class MoveDocumentSectionTool {
  schema = schema;
  private _getDoc: () => IStructuredDocument | null;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, getDoc: () => IStructuredDocument | null) {
    this._logger = loggerFactory("Move Document Section Tool");
    this._getDoc = getDoc;
  }

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const doc = this._getDoc();
    if (!doc) {
      throw new Error("No focused editor is available.");
    }
    const sectionId = args.section_id as string;
    const insertBeforeSectionId = args.insert_before_section_id as string | undefined;

    doc.moveSection(sectionId, insertBeforeSectionId);

    const result: JSONValue = {
      section_id: sectionId,
      moved: true
    };
    if (insertBeforeSectionId) {
      result.inserted_before = insertBeforeSectionId;
    }
    return result;
  };
}
