import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IDocumentToolContext } from "./document-tool-context.js";

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
  private _context: IDocumentToolContext;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, context: IDocumentToolContext) {
    this._logger = loggerFactory("Open Document Tool");
    this._context = context;
  }

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const id = args.id as string;
    const document = await this._context.openDocument(id);

    return {
      document,
      active_document_id: document.id
    };
  };
}