import { IDocumentService } from "../lib/document/document-service.js";
import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IWorkbench } from "../lib/workbench.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Use list_documents to inspect document IDs, open_document to switch the active document before reading or editing, create_document to start a new document, and rename_document to retitle an existing one.",
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
    const activeId = this._workspace.getFocusedDocumentId();

    const focusedPart = activeId
      ? `The focused document is ${activeId.toString()}.`
      : "There is no focused document.";
    const openPart = openDocuments.length === 0
      ? "No documents are open."
      : `Open documents:\n${openDocuments.map(doc => doc.id.toString() + (doc.isDirty ? " (unsaved changes)" : "")).reduce((p, c) => `${p}- ${c}\n`, "")}`;

    const openDocInstructionPart = `Use open_document with a document ID to open and switch the focused document if needed.`; 

    return { document_management: `\n${focusedPart}\n${openPart}\n${openDocInstructionPart}\n` };
  };

  execute = async (_args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Listing documents");
    const documentIds = await this._documentService.listDocuments();
    return ({document_management: {
      documents: documentIds.map(id => id.toString()),
    }});
  };
}
