import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store.ts";
import { DocumentConcurrencyError } from "../errors.ts";

type Record = { content: string; version: number };

export class MemoryDocumentStore implements IDocumentStore {
  namespace: string = "memory";
  private _documents: Map<string, Record>;
  constructor() {
    this._documents = new Map();
  }

  private _getVersion(record: Record): FileVersionToken {
    return String(record.version) as FileVersionToken;
  }

  async read(filename: string): Promise<FileContent> {
    const doc = this._documents.get(filename);
    if (!doc) {
      throw new Error(`File not found: ${filename}`);
    }
    return { content: doc.content, version: this._getVersion(doc) };
  }

  async write(filename: string, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const existing = this._documents.get(filename) ?? { content: "", version: -1 };
    if (expectedVersion !== undefined && expectedVersion !== this._getVersion(existing)) {
      throw new DocumentConcurrencyError();
    }

    const nextVersion = existing.version + 1;
    this._documents.set(filename, { content, version: nextVersion });
    return this._getVersion({ content, version: nextVersion });
  }

  async mv(fromFilename: string, toFilename: string): Promise<void> {
    if (fromFilename === toFilename) {
      return;
    }

    const source = this._documents.get(fromFilename);
    if (!source) {
      throw new Error(`File not found: ${fromFilename}`);
    }
    if (this._documents.has(toFilename)) {
      throw new Error("File already exists");
    }

    this._documents.set(toFilename, source);
    this._documents.delete(fromFilename);
    return;
  }

  async rm(filename: string): Promise<void> {
    this._documents.delete(filename);
  }

  async ls(): Promise<FileEntry[]> {
    return Array.from(this._documents.entries()).map(([filename, { version }]) => ({
      filename,
      version: this._getVersion({ content: "", version })
    }));
  }
}
