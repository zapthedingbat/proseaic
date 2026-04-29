import { ToolSchema } from "../lib/tools/tool-schema.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";
import { JSONValue } from "../lib/JSONValue.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Use ONLY for sections that do NOT already exist. If the section already exists, use replace_document_section instead. Call after read_document_outline. After the insertion succeeds, call task_complete immediately unless more sections still need to be inserted.",
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
    // Accept common aliases models use instead of the canonical param names
    const sectionTitle = (args.section_title ?? args.title ?? args.heading ?? args.name) as string;
    const sectionContent = (args.section_content ?? args.new_text ?? args.content ?? args.text) as string;
    const insertBeforeSectionId = (args.insert_before_section_id ?? args.before_section_id) as string | undefined;

    if (!sectionTitle) {
      throw new Error("section_title is required. Provide a heading text for the new section.");
    }

    // Redirect to replace if section already exists — prevents duplicate headings
    const normalise = (s: string) => s.replace(/^#{1,6}\s+/, "").trim().toLowerCase();
    const outline = doc.getOutline();
    const existing = outline.find(s => normalise(s.sectionTitle) === normalise(sectionTitle));
    if (existing) {
      throw new Error(
        `Section '${sectionTitle}' already exists (section_id: '${existing.sectionTitleId}'). ` +
        `Use replace_document_section with section_id='${existing.sectionTitleId}' to update it instead.`
      );
    }

    doc.insertSection(sectionTitle, sectionContent, insertBeforeSectionId);

    return {
      inserted: true,
      next_step: "Section inserted successfully. Call task_complete now to finish."
    };
  };
}

