import { IDocumentStore } from "./document-manager";

export class LocalStorageDocumentStore implements IDocumentStore {
  namespace: string = "localStorage";
  private _storageKeyPrefix: string;
  constructor(storageKeyPrefix: string) {
    this._storageKeyPrefix = storageKeyPrefix;
  }

  private _getStorageKey(id: string): string {
    return `${this._storageKeyPrefix}-${id}`;
  }

  async createDocument(title: string): Promise<string> {
    const id = `doc-${Date.now()}`;
    const doc = { title, content: "" };
    localStorage.setItem(this._getStorageKey(id), JSON.stringify(doc));
    return id;
  }

  async readDocument(id: string): Promise<{ title: string; content: string; }> {
    const raw = localStorage.getItem(this._getStorageKey(id));
    if (!raw) {
      throw new Error(`Document with id ${id} not found`);
    }
    return JSON.parse(raw);
  }

  async updateDocument(id: string, content: string): Promise<void> {
    const raw = localStorage.getItem(this._getStorageKey(id));
    if (!raw) {
      throw new Error(`Document with id ${id} not found`);
    }
    const doc = JSON.parse(raw);
    localStorage.setItem(this._getStorageKey(id), JSON.stringify({ ...doc, content }));
  }

  async renameDocument(id: string, title: string): Promise<void> {
    const raw = localStorage.getItem(this._getStorageKey(id));
    if (!raw) throw new Error(`Document with id ${id} not found`);
    const doc = JSON.parse(raw);
    localStorage.setItem(this._getStorageKey(id), JSON.stringify({ ...doc, title }));
  }

  async deleteDocument(id: string): Promise<void> {
    localStorage.removeItem(this._getStorageKey(id));
  }

  async listDocuments(): Promise<{ id: string; title: string; }[]> {
    const docs: { id: string; title: string; }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this._storageKeyPrefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const doc = JSON.parse(raw);
          const id = key.slice(this._storageKeyPrefix.length + 1);
          docs.push({ id, title: doc.title });
        }
      }
    }
    return docs;
  }
}
