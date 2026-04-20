import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IWorkspace } from "../lib/workspace.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "list_documents",
    description: "List all available documents and their IDs. Use this before open_document or rename_document when you need to identify the right document.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

export class ListDocumentsTool {
  schema = schema;
  private _logger: Logger;
  private _workspace: IWorkspace;


  constructor(loggerFactory: LoggerFactory, workspace: IWorkspace) {
    this._logger = loggerFactory("List Documents Tool");
    this._workspace = workspace;
  }

  addContext = async (): Promise<Record<string, unknown>> => {
    const allDocuments = await this._workspace.listDocuments();
    const openDocuments = allDocuments.filter(doc => doc.isOpen).map(doc => ({ id: doc.id, title: doc.title }));
    return ({document_management: {
      open_documents: openDocuments,
    }});
  };

  execute = async (_args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Listing documents");
    const documents = await this._workspace.listDocuments();
    return {
      documents: documents.map(doc => ({ id: doc.id, title: doc.title }))
    };
  };
}