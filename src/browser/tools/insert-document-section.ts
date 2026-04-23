import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Call after read_document_outline to understand document structure. Only call when document_management.open_documents is non-empty; if empty, tell the user no document is open.",
  function: {
    name: "insert_document_section",
    description: "Insert a new section into the current editor document after you have inspected structure with read_document_outline.",
    parameters: {
      type: "object",
      properties: {
        section_title: {
          type: "string",
          description: "Heading text for the new section. You may include markdown heading markers."
        },
        section_content: {
          type: "string",
          description: "Body content for the new section."
        },
        insert_before_section_id: {
          type: "string",
          description: "Optional section ID from read_document_outline to insert before. If omitted, section is appended to the document."
        }
      },
      required: ["section_title", "section_content"]
    }
  }
};

export class InsertDocumentSectionTool {
  schema = schema;
  private _getDoc: () => IStructuredDocument | null;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, getDoc: () => IStructuredDocument | null) {
    this._logger = loggerFactory("Insert Document Section Tool");
    this._getDoc = getDoc;
  }
  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const doc = this._getDoc();
    if (!doc) {
      throw new Error("No focused editor is available.");
    }
    const sectionTitle = args.section_title as string;
    const sectionContent = args.section_content as string;
    const insertBeforeSectionId = args.insert_before_section_id as string | undefined;

    doc.insertSection(sectionTitle, sectionContent, insertBeforeSectionId);

    return {
    };
  };
}

