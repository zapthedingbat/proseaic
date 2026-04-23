import { DocumentId } from "./document-service";

export interface IDocumentStateService {
  getDirtyDocumentIds(): DocumentId[];
  isDocumentDirty(id: DocumentId): boolean;
  setDocumentDraft(id: DocumentId, content: string): void;
  discardUnsavedDocumentChanges(id: DocumentId): void;
}
