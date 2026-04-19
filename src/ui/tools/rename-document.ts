import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IDocumentToolContext } from "./document-tool-context.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "rename_document",
    description: "Rename an existing document. Use list_documents first if you need to confirm the document ID.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Document ID to rename."
        },
        title: {
          type: "string",
          description: "New document title."
        }
      },
      required: ["id", "title"]
    }
  }
};

export class RenameDocumentTool {
  schema = schema;
  private _context: IDocumentToolContext;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, context: IDocumentToolContext) {
    this._logger = loggerFactory("Rename Document Tool");
    this._context = context;
  }

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const id = args.id as string;
    const title = args.title as string;

    const newId = await this._context.renameDocument(id, title);

    return {
      id: newId,
      title
    };
  };
}