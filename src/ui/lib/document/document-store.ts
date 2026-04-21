export type FileVersionToken = string & { readonly __brand: unique symbol };

export type FileContent = {
  content: string;
  version: FileVersionToken;
};

export type FileEntry = {
  filename: string;
  version: FileVersionToken;
};

export interface IDocumentStore {
  namespace: string;
  read(filename: string): Promise<FileContent>;
  write(filename: string, content?: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken>;
  mv(fromFilename: string, toFilename: string): Promise<void>;
  rm(filename: string): Promise<void>;
  ls(): Promise<FileEntry[]>;
}
