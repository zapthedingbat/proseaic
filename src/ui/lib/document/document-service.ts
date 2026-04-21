export type StoreQualifiedDocumentId = string & { readonly __brand: unique symbol };
export type Filepath = string & { readonly __brand: unique symbol };

export interface IDocumentService {
  filepathFromString(str: string): Filepath;
  createDocument(filepath: Filepath): Promise<StoreQualifiedDocumentId>;
  deleteDocument(id: StoreQualifiedDocumentId): Promise<void>;
  getStoreNamespaces(): string[];
  listDocuments(): Promise<StoreQualifiedDocumentId[]>;
  readDocument(id: StoreQualifiedDocumentId): Promise<string>;
  renameDocument(id: StoreQualifiedDocumentId, toFilepath: Filepath): Promise<StoreQualifiedDocumentId>;
  toDocumentId(filepath: Filepath): StoreQualifiedDocumentId;
  updateDocument(id: StoreQualifiedDocumentId, content: string): Promise<void>;
}