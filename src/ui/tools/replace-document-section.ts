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
  private _doc: IStructuredDocument;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, doc: IStructuredDocument) {
    this._logger = loggerFactory("Replace Document Section Tool");
    this._doc = doc;
  }
  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const sectionId = args.section_id as string;
    const sectionContent = args.section_content as string;

    this._doc.replaceSection(sectionId, sectionContent);

    return {
    };
  };
}
