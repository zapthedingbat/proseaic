export interface IDocumentService {
  getStoreNamespaces(): string[];
  createDocument(id: string): Promise<string>;
  readDocument(id: string): Promise<string>;
  updateDocument(id: string, content: string): Promise<void>;
  renameDocument(fromId: string, toId: string): Promise<string>;
  deleteDocument(id: string): Promise<void>;
  listDocuments(): Promise<string[]>;
  toDocumentId(filename: string): string;
}


