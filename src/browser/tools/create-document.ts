import { DocumentPath } from "../lib/document/document-service.js";
import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IWorkbench } from "../lib/workbench.js";

export const schema: ToolSchema = {
  type: "function",
  function: {
    name: "create_document",
    description: "Create a new document and open it in the editor. Use this when the user asks to start a fresh document.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Name for the new document, e.g. \"Technical Architecture\" or \"meeting-notes\". A .md extension and path prefix will be added automatically if omitted."
        },
      },
      required: []
    }
  }
};

function normalizeFilename(input?: string): string {
  let name = (input ?? "").trim();
  if (!name) name = "untitled";
  if (!name.startsWith("/")) name = "/" + name;
  if (!name.includes(".")) name = name + ".md";
  return name;
}

export class CreateDocumentTool {
  schema = schema;
  private _workspace: IWorkbench;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, workspace: IWorkbench) {
    this._logger = loggerFactory("Create Document Tool");
    this._workspace = workspace;
  }

  addContext = () => ({});

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const filename = args.filename;
    if (filename !== undefined && typeof filename !== "string") {
      throw new Error("filename must be a string");
    }
    const documentPath = DocumentPath.parse(normalizeFilename(filename));
    const documentId = await this._workspace.createDocument(documentPath);
    return {
      new_document_id: documentId.toString(),
      next_step: "Document created and open. Call read_document_outline then insert_document_section to write content into it."
    };
  };
}
