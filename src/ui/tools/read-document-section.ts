import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/structured-document.js";

const schema: ToolSchema = {
  type: "function",
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
  private _doc: IStructuredDocument;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, doc: IStructuredDocument) {
    this._logger = loggerFactory("Read Document Section Tool");
    this._doc = doc;
  }
  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    this._logger.debug("Executing with args:", args);
    const sectionId = args.section_id as string;
    const sectionContent = this._doc.getSectionContent(sectionId);
    return {
        section: sectionContent
    };
  };
}
