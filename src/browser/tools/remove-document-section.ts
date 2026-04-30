import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Call after confirming the target section ID from read_document_outline. After removing, call task_complete to finish.",
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
  private _getDoc: () => IStructuredDocument | null;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, getDoc: () => IStructuredDocument | null) {
    this._logger = loggerFactory("Remove Document Section Tool");
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
    const target = outline.find(s => s.sectionTitleId === sectionId);
    if (!target) {
      const validIds = outline.map(s => `${s.sectionTitleId} ("${s.sectionTitle}")`).join(", ");
      throw new Error(`Section '${sectionId}' not found. Valid IDs: ${validIds}`);
    }

    doc.removeSection(sectionId);

    return {
      removed: true,
      removed_title: target.sectionTitle,
      next_step: "Section updated successfully. Call task_complete now to finish."
    };
  };
}

