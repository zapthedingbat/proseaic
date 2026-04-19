
export class DocumentConcurrencyError extends Error {
  constructor(message = "Document has changed since it was loaded.") {
    super(message);
    this.name = "DocumentConcurrencyError";
  }
}

export type FileVersionToken = string;

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
  write(filename: string, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken | undefined>;
  mv(fromFilename: string, toFilename: string): Promise<string>;
  rm(filename: string): Promise<void>;
  ls(): Promise<FileEntry[]>;
}
