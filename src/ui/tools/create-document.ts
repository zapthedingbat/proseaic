import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IDocumentToolContext } from "./document-tool-context.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "create_document",
    description: "Create a new document and open it in the editor. Use this when the user asks to start a fresh document.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title for the new document."
        },
        store: {
          type: "string",
          description: "Optional document store namespace. Omit this to use the default store."
        }
      },
      required: ["title"]
    }
  }
};

export class CreateDocumentTool {
  schema = schema;
  private _context: IDocumentToolContext;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, context: IDocumentToolContext) {
    this._logger = loggerFactory("Create Document Tool");
    this._context = context;
  }

  addContext = (): Record<string, unknown> => ({
    document_management: {
      active_document_id: this._context.getActiveDocumentId(),
      available_stores: this._context.getStoreNamespaces()
    }
  });

  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const title = args.title as string;
    const store = args.store as string | undefined;
    const document = await this._context.createDocument(title, store);

    return {
      document,
      active_document_id: document.id
    };
  };
}