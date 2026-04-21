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
          description: "Original document ID."
        },
        toFilepath: {
          type: "string",
          description: "New document filename. Not the full ID, just the filename or path within the same store"
        }
      },
      required: ["fromId", "toFilepath"]
    }
  }
};

export class RenameDocumentTool {
  schema = schema;
  private _logger: Logger;
  private _workspace: IWorkbench;

  constructor(loggerFactory: LoggerFactory, workspace: IWorkbench) {
    this._logger = loggerFactory("Rename Document Tool");
    this._workspace = workspace;
  }

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const fromId = args.fromId as string;
    const toFilepath = args.toFilepath as string;
    await this._workspace.renameDocument(fromId, toFilepath);

    return {};
  };
}