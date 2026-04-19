export interface IDocumentService {
  getStoreNamespaces(): string[];
  createDocument(title: string, store: string): Promise<string>;
  readDocument(id: string): Promise<string>;
  updateDocument(id: string, content: string): Promise<void>;
  renameDocument(id: string, title: string): Promise<string>;
  deleteDocument(id: string): Promise<void>;
  listDocuments(): Promise<{ id: string; title: string; }[]>;
  getDirtyDocumentIds(): string[];
  isDocumentDirty(id: string): boolean;
  setDocumentDraft(id: string, content: string): void;
  discardUnsavedDocumentChanges(id: string): void;
}
