import { DocumentConcurrencyError, IDocumentStore } from "./document-store";

type LocalStorageDocumentRecord = {
  content: string;
  version: number;
};

export class LocalStorageDocumentStore implements IDocumentStore {
  namespace: string = "localStorage";
  private _storageKeyPrefix: string;
  constructor(storageKeyPrefix: string) {
    this._storageKeyPrefix = storageKeyPrefix;
  }

  private _getStorageKey(id: string): string {
    return `${this._storageKeyPrefix}-${id}`;
  }

  private _parseRecord(raw: string): LocalStorageDocumentRecord {
    const doc = JSON.parse(raw) as { content?: unknown; version?: unknown };
    return {
      content: typeof doc.content === "string" ? doc.content : "",
      version: typeof doc.version === "number" ? doc.version : 0
    };
  }

  async read(filename: string): Promise<{ content: string; version: string; }> {
    const raw = localStorage.getItem(this._getStorageKey(filename));
    if (!raw) {
      throw new Error(`File not found: ${filename}`);
    }
    const doc = this._parseRecord(raw);
    return {
      content: doc.content,
      version: String(doc.version)
    };
  }

  async write(filename: string, content: string, expectedVersion?: string): Promise<string> {
    const raw = localStorage.getItem(this._getStorageKey(filename));
    const doc = raw ? this._parseRecord(raw) : { content: "", version: -1 };
    const currentVersion = String(doc.version);
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new DocumentConcurrencyError();
    }

    const nextVersion = doc.version + 1;
    localStorage.setItem(this._getStorageKey(filename), JSON.stringify({ content, version: nextVersion }));
    return String(nextVersion);
  }

  async mv(fromFilename: string, toFilename: string): Promise<string> {
    if (fromFilename === toFilename) {
      return fromFilename;
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
    return toFilename;
  }

  async rm(filename: string): Promise<void> {
    localStorage.removeItem(this._getStorageKey(filename));
  }

  async ls(): Promise<{ filename: string; version: string; }[]> {
    const files: { filename: string; version: string; }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this._storageKeyPrefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const doc = this._parseRecord(raw);
          const filename = key.slice(this._storageKeyPrefix.length + 1);
          files.push({ filename, version: String(doc.version) });
        }
      }
    }
    return files;
  }
}
