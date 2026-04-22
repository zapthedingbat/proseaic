import { DocumentPath } from "./document-service";

export type FileVersionToken = string & { readonly __brand: unique symbol };

export type FileContent = {
  content: string;
  version: FileVersionToken;
};

export type FileEntry = {
  filepath: DocumentPath;
  version: FileVersionToken;
};

export interface IDocumentStore {
  namespace: string;
  read(filepath: DocumentPath): Promise<FileContent>;
  write(filepath: DocumentPath, content?: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken>;
  mv(fromFilepath: DocumentPath, toFilepath: DocumentPath): Promise<void>;
  rm(filepath: DocumentPath): Promise<void>;
  ls(): Promise<FileEntry[]>;
}
