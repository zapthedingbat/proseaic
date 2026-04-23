import { DocumentPath } from "../document-service";
import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store";
import { DocumentConcurrencyError, DocumentIdConflictError } from "../errors";

type Record = { content: string; version: number };

export class LocalStorageDocumentStore implements IDocumentStore {
  namespace: string = "localStorage";
  private _storageKeyPrefix: string;

  constructor(storageKeyPrefix: string) {
    this._storageKeyPrefix = storageKeyPrefix;
  }

  private _getVersion(record: Record): FileVersionToken {
    return String(record.version) as FileVersionToken;
  }

  private _getStorageKey(id: string): string {
    return `${this._storageKeyPrefix}-${id}`;
  }

  private _parseRecord(raw: string): Record {
    const doc = JSON.parse(raw) as { content?: unknown; version?: unknown };
    return {
      content: typeof doc.content === "string" ? doc.content : "",
      version: typeof doc.version === "number" ? doc.version : 0
    };
  }

  async read(filepath: DocumentPath): Promise<FileContent> {
    const raw = localStorage.getItem(this._getStorageKey(filepath.toString()));
    if (!raw) {
      throw new Error(`File not found: ${filepath.toString()}`);
    }
    const doc = this._parseRecord(raw);
    return {
      content: doc.content,
      version: this._getVersion(doc)
    };
  }

  async write(filepath: DocumentPath, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
  const raw = localStorage.getItem(this._getStorageKey(filepath.toString()));
    const doc = raw ? this._parseRecord(raw) : { content: "", version: -1 };
    const currentVersion = this._getVersion(doc);
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new DocumentConcurrencyError();
    }

    const nextVersion = doc.version + 1;
    localStorage.setItem(this._getStorageKey(filepath.toString()), JSON.stringify({ content, version: nextVersion }));
    return this._getVersion({ content, version: nextVersion });
  }

  async mv(fromFilepath: DocumentPath, toFilepath: DocumentPath): Promise<void> {
    if (fromFilepath.toString() === toFilepath.toString()) {
      return;
    }

    const sourceRaw = localStorage.getItem(this._getStorageKey(fromFilepath.toString()));
    if (!sourceRaw) {
      throw new Error(`File not found: ${fromFilepath}`);
    }
    const targetRaw = localStorage.getItem(this._getStorageKey(toFilepath.toString()));
    if (targetRaw !== null) {
      throw new DocumentIdConflictError(toFilepath.toString());
    }

    localStorage.setItem(this._getStorageKey(toFilepath.toString()), sourceRaw);
    localStorage.removeItem(this._getStorageKey(fromFilepath.toString()));
    return;
  }

  async rm(filepath: DocumentPath): Promise<void> {
    localStorage.removeItem(this._getStorageKey(filepath.toString()));
  }

  async ls(): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this._storageKeyPrefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const doc = this._parseRecord(raw);
          const filename = key.slice(this._storageKeyPrefix.length + 1);
          files.push({ filepath: DocumentPath.parse(filename), version: this._getVersion(doc) });
        }
      }
    }
    return files;
  }
}
