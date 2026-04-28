import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store.ts";
import { DocumentPath } from "../document-service.ts";
import { DocumentConcurrencyError, DocumentIdConflictError } from "../errors.ts";

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

  async read(filepath: DocumentPath): Promise<FileContent> {
    const key = filepath.toString();
    const doc = this._documents.get(key);
    if (!doc) {
      throw new Error(`File not found: ${key}`);
    }
    return { content: doc.content, version: this._getVersion(doc) };
  }

  async write(filepath: DocumentPath, content: string = "", expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const key = filepath.toString();
    const existing = this._documents.get(key) ?? { content: "", version: -1 };
    if (expectedVersion !== undefined && expectedVersion !== this._getVersion(existing)) {
      throw new DocumentConcurrencyError();
    }

    const nextVersion = existing.version + 1;
    this._documents.set(key, { content, version: nextVersion });
    return this._getVersion({ content, version: nextVersion });
  }

  async mv(fromFilepath: DocumentPath, toFilepath: DocumentPath): Promise<void> {
    const fromKey = fromFilepath.toString();
    const toKey = toFilepath.toString();
    if (fromKey === toKey) {
      return;
    }

    const source = this._documents.get(fromKey);
    if (!source) {
      throw new Error(`File not found: ${fromKey}`);
    }
    if (this._documents.has(toKey)) {
      throw new DocumentIdConflictError(toKey);
    }

    this._documents.set(toKey, source);
    this._documents.delete(fromKey);
  }

  async rm(filepath: DocumentPath): Promise<void> {
    this._documents.delete(filepath.toString());
  }

  async ls(): Promise<FileEntry[]> {
    return Array.from(this._documents.entries()).map(([key, { version }]) => ({
      filepath: DocumentPath.parse(key),
      version: this._getVersion({ content: "", version }),
    }));
  }
}
