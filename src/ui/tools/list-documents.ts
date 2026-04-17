import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IDocumentToolContext } from "./document-tool-context.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "list_documents",
    description: "List available documents and their IDs. Use this before open_document or rename_document when you need to identify the right document.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

export class ListDocumentsTool {
  schema = schema;
  private _context: IDocumentToolContext;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, context: IDocumentToolContext) {
    this._logger = loggerFactory("List Documents Tool");
    this._context = context;
  }

  addContext = (): Record<string, unknown> => ({
    document_management: {
      active_document_id: this._context.getActiveDocumentId(),
      available_stores: this._context.getStoreNamespaces()
    }
  });

  execute = async (_args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Listing documents");
    const activeDocumentId = this._context.getActiveDocumentId();
    const documents = await this._context.listDocuments();

    return {
      active_document_id: activeDocumentId,
      documents: documents.map(document => ({
        ...document,
        is_active: document.id === activeDocumentId
      }))
    };
  };
}