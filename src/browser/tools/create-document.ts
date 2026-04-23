import { DocumentPath } from "../lib/document/document-service.js";
import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IWorkbench } from "../lib/workbench.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "create_document",
    description: "Create a new document and open it in the editor. Use this when the user asks to start a fresh document.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "filename for the new document, including path if desired. If not provided, a default name will be generated."
        },
      },
      required: []
    }
  }
};

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
    const filename = args.filename as string;
    if(filename && typeof filename !== "string") {
      throw new Error("filename must be a string");
    }
    const documentPath = DocumentPath.parse(filename);
    const documentId = await this._workspace.createDocument(documentPath);
    return {
      new_document_id: documentId.toString()
    };
  };
}