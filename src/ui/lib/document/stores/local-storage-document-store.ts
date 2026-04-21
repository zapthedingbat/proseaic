import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store";
import { DocumentConcurrencyError } from "../errors";

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

  async read(filename: string): Promise<FileContent> {
    const raw = localStorage.getItem(this._getStorageKey(filename));
    if (!raw) {
      throw new Error(`File not found: ${filename}`);
    }
    const doc = this._parseRecord(raw);
    return {
      content: doc.content,
      version: this._getVersion(doc)
    };
  }

  async write(filename: string, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const raw = localStorage.getItem(this._getStorageKey(filename));
    const doc = raw ? this._parseRecord(raw) : { content: "", version: -1 };
    const currentVersion = this._getVersion(doc);
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new DocumentConcurrencyError();
    }

    const nextVersion = doc.version + 1;
    localStorage.setItem(this._getStorageKey(filename), JSON.stringify({ content, version: nextVersion }));
    return this._getVersion({ content, version: nextVersion });
  }

  async mv(fromFilename: string, toFilename: string): Promise<void> {
    if (fromFilename === toFilename) {
      return;
    }

    const sourceRaw = localStorage.getItem(this._getStorageKey(fromFilename));
    if (!sourceRaw) {
      throw new Error(`File not found: ${fromFilename}`);
    }
    const targetRaw = localStorage.getItem(this._getStorageKey(toFilename));
    if (targetRaw !== null) {
      throw new Error("File already exists");
    }

    localStorage.setItem(this._getStorageKey(toFilename), sourceRaw);
    localStorage.removeItem(this._getStorageKey(fromFilename));
    return;
  }

  async rm(filename: string): Promise<void> {
    localStorage.removeItem(this._getStorageKey(filename));
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
          files.push({ filename, version: this._getVersion(doc) });
        }
      }
    }
    return files;
  }
}
