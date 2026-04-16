import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { MdSection } from "../lib/markdown/markdown.js";

const schema: ToolSchema = {
  type: "function",
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
  private _doc: IStructuredDocument;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, doc: IStructuredDocument) {
    this._logger = loggerFactory("Read Document Outline Tool");
    this._doc = doc;
  }
  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    this._logger.debug("Executing with args:", args);
    const outline = this._doc.getOutline();

    // Restructure the outline to only include the section titles and their levels, to avoid sending too much data back to the LLM.
    // The full outline can be retrieved using the read_document_section tool.
    const simplifyOutline = (section: MdSection): any => {
      return {
        section_id: section.id,
        title: section.headingLine ? section.headingLine.raw : "Document Root",
        level: section.level,
        children: section.children.map(simplifyOutline)
      };
    };
    const simplifiedOutline = simplifyOutline(outline);

    return {
        outline: simplifiedOutline
    };
  };
}
