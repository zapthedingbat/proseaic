export class DocumentVersionConflictError extends Error {
  conflictingDocumentId: string;

  constructor(conflictingDocumentId: string) {
    super(`Document version conflict with ID: ${conflictingDocumentId}`);
    this.conflictingDocumentId = conflictingDocumentId;
    this.name = "DocumentVersionConflictError";
  }
}

export class DocumentIdConflictError extends Error {
  conflictingDocumentId: string;

  constructor(conflictingDocumentId: string) {
    super(`Document ID conflict with ID: ${conflictingDocumentId}`);
    this.conflictingDocumentId = conflictingDocumentId;
    this.name = "DocumentIdConflictError";
  }
}

export interface IDocumentService {
  getStoreNamespaces(): string[];
  createDocument(id: string): Promise<string>;
  readDocument(id: string): Promise<string>;
  updateDocument(id: string, content: string): Promise<void>;
  renameDocument(fromId: string, toId: string): Promise<string>;
  deleteDocument(id: string): Promise<void>;
  listDocuments(): Promise<string[]>;
}


