
export interface IDocumentStateService {
  getDirtyDocumentIds(): string[];
  isDocumentDirty(id: string): boolean;
  setDocumentDraft(id: string, content: string): void;
  discardUnsavedDocumentChanges(id: string): void;
}
