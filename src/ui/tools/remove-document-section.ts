import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/structured-document.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "remove_document_section",
    description: "Remove a section from the current editor document after confirming the section title from read_document_outline.",
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

export class RemoveDocumentSectionTool {
  schema = schema;
  private _doc: IStructuredDocument;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, doc: IStructuredDocument) {
    this._logger = loggerFactory("Remove Document Section Tool");
    this._doc = doc;
  }

  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    this._logger.debug("Executing with args:", args);
    const sectionId = args.section_id as string;

    this._doc.removeSection(sectionId);

    return {
      section_id: sectionId,
      removed: true
    };
  };
}
