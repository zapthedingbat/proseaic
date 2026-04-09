export interface DocumentManager {
  getStoreNamespaces(): string[];
  createDocument(title: string, store: string): Promise<string>;
  readDocument(id: string): Promise<string>;
  updateDocument(id: string, content: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  listDocuments(): Promise<string[]>;
}

export class DocumentManagerImpl implements DocumentManager {
  private _stores: Map<string, DocumentStore>;
  constructor(stores: DocumentStore[]) {
    this._stores = new Map(stores.map(store => [store.namespace, store]));
  }

  public registerStore(store: DocumentStore): void {
    this._stores.set(store.namespace, store);
  }

  getStoreNamespaces(): string[] {
    return Array.from(this._stores.keys());
  }
  async createDocument(title: string, store: string): Promise<string> {
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const id = await storeInstance.createDocument(title);
    return `${store}/${id}`;
  }
  async readDocument(id: string): Promise<string> {
    const [store, docId] = id.split("/");
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const doc = await storeInstance.readDocument(docId);
    return doc.content;
  }
  async updateDocument(id: string, content: string): Promise<void> {
    const [store, docId] = id.split("/");
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    return storeInstance.updateDocument(docId, content);
  }
  async deleteDocument(id: string): Promise<void> {
    const [store, docId] = id.split("/");
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    return storeInstance.deleteDocument(docId);
  }
  async listDocuments(): Promise<string[]> {
    const allDocs: string[] = [];
    for (const [namespace, storeInstance] of this._stores.entries()) {
      const docs = await storeInstance.listDocuments();
      allDocs.push(...docs.map(doc => `${namespace}/${doc.id}`));
    }
    return allDocs;
  }
}

export interface DocumentStore {
  namespace: string;
  createDocument(title: string): Promise<string>;
  readDocument(id: string): Promise<{ title: string; content: string }>;
  updateDocument(id: string, content: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  listDocuments(): Promise<{ id: string; title: string }[]>;
}

export class InMemoryDocumentStore implements DocumentStore {
  namespace: string = "memory";
  private _documents: Map<string, { title: string; content: string }>;
  constructor() {
    this._documents = new Map();
  }

  async createDocument(title: string): Promise<string> {
    const id = `doc-${Date.now()}`;
    this._documents.set(id, { title, content: "" });
    return id;
  }

  async readDocument(id: string): Promise<{ title: string; content: string }> {
    const doc = this._documents.get(id);
    if (!doc) {
      throw new Error(`Document with id ${id} not found`);
    }
    return doc;
  }

  async updateDocument(id: string, content: string): Promise<void> {
    const doc = this._documents.get(id);
    if (!doc) {
      throw new Error(`Document with id ${id} not found`);
    }
    this._documents.set(id, { ...doc, content });
  }

  async deleteDocument(id: string): Promise<void> {
    this._documents.delete(id);
  }

  async listDocuments(): Promise<{ id: string; title: string }[]> {
    return Array.from(this._documents.entries()).map(([id, { title }]) => ({ id, title }));
  }
}

export class LocalStorageDocumentStore implements DocumentStore {
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

  async readDocument(id: string): Promise<{ title: string; content: string }> {
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

  async deleteDocument(id: string): Promise<void> {
    localStorage.removeItem(this._getStorageKey(id));
  }

  async listDocuments(): Promise<{ id: string; title: string }[]> {
    const docs: { id: string; title: string }[] = [];
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

export class FileSystemDocumentStore implements DocumentStore {
  namespace: string = "fileSystem";
  private _directoryHandle: FileSystemDirectoryHandle;
  constructor(directoryHandle: FileSystemDirectoryHandle) {
    this._directoryHandle = directoryHandle;
  }

  async createDocument(title: string, content?: string): Promise<string> {
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 20);
    const id = safeTitle;
    const fileHandle = await this._directoryHandle.getFileHandle(`${id}.md`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content || "");
    await writable.close();
    return id;
  }

  async readDocument(id: string): Promise<{ title: string; content: string }> {
    const fileHandle = await this._directoryHandle.getFileHandle(`${id}.md`);
    const file = await fileHandle.getFile();
    const raw = await file.text();
    return JSON.parse(raw);
  }

  async updateDocument(id: string, content: string): Promise<void> {
    const fileHandle = await this._directoryHandle.getFileHandle(`${id}.md`);
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async deleteDocument(id: string): Promise<void> {
    await this._directoryHandle.removeEntry(`${id}.md`);
  }

  async listDocuments(): Promise<{ id: string; title: string }[]> {
    const docs: { id: string; title: string }[] = [];
    const handles = this._directoryHandle as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [, entry] of handles) {
      if (entry.kind === "file" && entry.name.endsWith(".md")) {
        const id = entry.name.slice(0, -5);
        docs.push({ id, title: id });
      }
    }
    return docs;
  }
}