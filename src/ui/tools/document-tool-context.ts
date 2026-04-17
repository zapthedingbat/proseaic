export type DocumentSummary = {
  id: string;
  title: string;
};

export interface IDocumentToolContext {
  getActiveDocumentId(): string | null;
  getStoreNamespaces(): string[];
  listDocuments(): Promise<DocumentSummary[]>;
  createDocument(title: string, store?: string): Promise<DocumentSummary>;
  renameDocument(id: string, title: string): Promise<void>;
  openDocument(id: string): Promise<{ id: string; title: string; content: string }>;
}