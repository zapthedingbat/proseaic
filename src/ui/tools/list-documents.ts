import { IDocumentService } from "../lib/document/document-service.js";
import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IWorkbench } from "../lib/workbench.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "list_documents",
    description: "List all available documents. Use this before open_document or rename_document when you need to identify the right document.",
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
  private _documentService: IDocumentService;
  private _workspace: IWorkbench;

  constructor(loggerFactory: LoggerFactory, documentService: IDocumentService, workspace: IWorkbench) {
    this._logger = loggerFactory("List Documents Tool");
    this._documentService = documentService;
    this._workspace = workspace;
  }

  addContext = (): Record<string, unknown> => {
    const openDocuments = this._workspace.listOpenDocuments();
    return ({document_management: {
      open_documents: openDocuments.map(doc => ({id: doc.id.toString(), has_unsaved_changes: doc.isDirty}))
    }});
  };

  execute = async (_args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Listing documents");
    const documentIds = await this._documentService.listDocuments();
    return ({document_management: {
      documents: documentIds.map(id => id.toString()),
    }});
  };
}