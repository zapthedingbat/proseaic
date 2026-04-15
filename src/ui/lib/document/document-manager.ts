export interface IDocumentService {
  getStoreNamespaces(): string[];
  createDocument(title: string, store: string): Promise<string>;
  readDocument(id: string): Promise<string>;
  updateDocument(id: string, content: string): Promise<void>;
  renameDocument(id: string, title: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  listDocuments(): Promise<{ id: string; title: string }[]>;
}

export class DocumentManager implements IDocumentService {
  private _stores: Map<string, IDocumentStore>;
  constructor(stores: IDocumentStore[] = []) {
    this._stores = new Map(stores.map(store => [store.namespace, store]));
  }

  public register(store: IDocumentStore): void {
    this._stores.set(store.namespace, store);
  }

  public registerMany(stores: IDocumentStore[]): void {
    stores.forEach(store => this.register(store));
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
    const escapedId = encodeURIComponent(id);
    return `${store}/${escapedId}`;
  }

  async readDocument(id: string): Promise<string> {
    const [store, docId] = id.split("/");
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const doc = await storeInstance.readDocument(decodeURIComponent(docId));
    return doc.content;
  }

  async updateDocument(id: string, content: string): Promise<void> {
    const [store, docId] = id.split("/");
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    return storeInstance.updateDocument(decodeURIComponent(docId), content);
  }

  async renameDocument(id: string, title: string): Promise<void> {
    const [store, docId] = id.split("/");
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    return storeInstance.renameDocument(decodeURIComponent(docId), title);
  }

  async deleteDocument(id: string): Promise<void> {
    const [store, docId] = id.split("/");
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    return storeInstance.deleteDocument(decodeURIComponent(docId));
  }

  async listDocuments(): Promise<{ id: string; title: string }[]> {
    const allDocs: { id: string; title: string }[] = [];
    for (const [namespace, storeInstance] of this._stores.entries()) {
      const docs = await storeInstance.listDocuments();
      allDocs.push(...docs.map(doc => ({ id: `${namespace}/${encodeURIComponent(doc.id)}`, title: doc.title })));
    }
    return allDocs;
  }
}

export interface IDocumentStore {
  namespace: string;
  createDocument(title: string): Promise<string>;
  readDocument(id: string): Promise<{ title: string; content: string }>;
  updateDocument(id: string, content: string): Promise<void>;
  renameDocument(id: string, title: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  listDocuments(): Promise<{ id: string; title: string }[]>;
}

