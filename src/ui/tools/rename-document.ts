import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IWorkbench } from "../lib/workbench.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "rename_document",
    description: "Rename an existing document. Use list_documents first if you need to confirm the document ID.",
    parameters: {
      type: "object",
      properties: {
        fromId: {
          type: "string",
          description: "Original document filename."
        },
        toId: {
          type: "string",
          description: "New document filename."
        }
      },
      required: ["fromId", "toId"]
    }
  }
};

export class RenameDocumentTool {
  schema = schema;
  private _workspace: IWorkbench;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, workspace: IWorkbench ) {
    this._logger = loggerFactory("Rename Document Tool");
    this._workspace = workspace;
  }

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const fromId = args.fromId as string;
    const toId = args.toId as string;

    await this._workspace.renameDocument(fromId, toId);

    return {};
  };
}