import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "replace_document_section",
    description: "Replace an existing section in the current editor document after you have inspected structure with read_document_outline.",
    parameters: {
      type: "object",
      properties: {
        section_id: {
          type: "string",
          description: "Unique section ID from read_document_outline."
        },
        section_content: {
          type: "string",
          description: "Replacement body content for the section."
        },
      },
      required: ["section_id", "section_content"]
    }
  }
};

export class ReplaceDocumentSectionTool {
  schema = schema;
  private _getDoc: () => IStructuredDocument | null;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, getDoc: () => IStructuredDocument | null) {
    this._logger = loggerFactory("Replace Document Section Tool");
    this._getDoc = getDoc;
  }
  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const doc = this._getDoc();
    if (!doc) {
      throw new Error("No focused editor is available.");
    }
    const sectionId = args.section_id as string;
    const sectionContent = args.section_content as string;

    doc.replaceSection(sectionId, sectionContent);

    return {
    };
  };
}
