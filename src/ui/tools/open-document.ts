import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IWorkbench } from "../lib/workbench.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "open_document",
    description: "Open an existing document in the editor so the read and edit tools operate on it. Use list_documents first if you need the document ID.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Document ID to open."
        }
      },
      required: ["id"]
    }
  }
};

export class OpenDocumentTool {
  schema = schema;
  private _workspace: IWorkbench;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, workspace: IWorkbench) {
    this._logger = loggerFactory("Open Document Tool");
    this._workspace = workspace;
  }

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const id = args.id as string;
    await this._workspace.openDocument(id);
    return {};
  };
}