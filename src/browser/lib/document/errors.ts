export class DocumentIdConflictError extends Error {
  conflictingDocumentId: string;

  constructor(conflictingDocumentId: string) {
    super(`Document ID conflict with ID: ${conflictingDocumentId}`);
    this.conflictingDocumentId = conflictingDocumentId;
    this.name = "DocumentIdConflictError";
  }
}

export class DocumentConcurrencyError extends Error {
  constructor(message = "Document has changed since it was loaded.") {
    super(message);
    this.name = "DocumentConcurrencyError";
  }
}