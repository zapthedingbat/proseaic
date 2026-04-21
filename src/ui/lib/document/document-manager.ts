import { IDocumentService, Filepath, StoreQualifiedDocumentId } from "./document-service";
import { FileVersionToken, IDocumentStore } from "./document-store";

type DraftRecord = {
  content: string;
  baseVersion?: FileVersionToken;
};

export class DocumentManager implements IDocumentService {
  private static readonly DRAFT_KEY_PREFIX = "document_draft:";
  private _stores: Map<string, IDocumentStore>;
  private _dirtyDocumentIds: Set<StoreQualifiedDocumentId>;
  private _documentVersions: Map<StoreQualifiedDocumentId, FileVersionToken | undefined>;

  constructor(stores: IDocumentStore[] = []) {
    this._stores = new Map(stores.map(store => [store.namespace, store]));
    this._dirtyDocumentIds = new Set();
    this._documentVersions = new Map();
  }

  private _toStoreDocumentId(store: IDocumentStore, filepath: Filepath): StoreQualifiedDocumentId {
    const escapedId = encodeURIComponent(filepath);
    return `${store.namespace}/${escapedId}` as StoreQualifiedDocumentId;
  }

  private _getStoreForDocumentId(id: StoreQualifiedDocumentId): IDocumentStore {
    const [storeNamespace] = id.split("/");
    const store = this._stores.get(storeNamespace);
    if (!store) {
      throw new Error(`Document store with namespace ${storeNamespace} not found`);
    }
    return store;
  }

  private _getDefaultStore(): IDocumentStore {
    const store = this._stores.values().next().value;
    if (!store) {
      throw new Error("No document stores registered");
    }
    return store;
  }


  private _parseDocumentId(id: StoreQualifiedDocumentId): { store: string; filepath: Filepath } {
    const [_, store, filepath] = id.match(/^\/*([^/]+)(.*)$/) || [];
    return {
      store,
      filepath: decodeURIComponent(filepath) as Filepath
    };
  }

  private _getDraftStorageKey(id: StoreQualifiedDocumentId): string {
    return `${DocumentManager.DRAFT_KEY_PREFIX}${id}`;
  }

  private _readDraft(id: StoreQualifiedDocumentId): DraftRecord | null {
    const raw = globalThis.localStorage.getItem(this._getDraftStorageKey(id));
    if (raw === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { content?: unknown; baseVersion?: unknown };
      if (typeof parsed.content !== "string") {
        return null;
      }

      const baseVersion = typeof parsed.baseVersion === "string" ? parsed.baseVersion as FileVersionToken : undefined;
      return {
        content: parsed.content,
        baseVersion
      };
    } catch {
      // Backward-compat with older raw-string draft format.
      return {
        content: raw
      };
    }
  }

  private _writeDraft(id: StoreQualifiedDocumentId, content: string, baseVersion?: FileVersionToken): void {
    const draft: DraftRecord = {
      content,
      baseVersion
    };
    globalThis.localStorage.setItem(this._getDraftStorageKey(id), JSON.stringify(draft));
  }

  private _clearDraft(id: StoreQualifiedDocumentId): void {
    globalThis.localStorage.removeItem(this._getDraftStorageKey(id));
  }

  private _setDirty(id: StoreQualifiedDocumentId, value: boolean): void {
    if (value) {
      this._dirtyDocumentIds.add(id);
      return;
    }
    this._dirtyDocumentIds.delete(id);
  }

  private _setDocumentVersion(id: StoreQualifiedDocumentId, version?: FileVersionToken): void {
    this._documentVersions.set(id, version);
  }

  private _getDocumentVersion(id: StoreQualifiedDocumentId): FileVersionToken | undefined {
    return this._documentVersions.get(id);
  }

  public register(store: IDocumentStore): void {
    this._stores.set(store.namespace, store);
  }

  public registerMany(stores: IDocumentStore[]): void {
    stores.forEach(store => this.register(store));
  }

  filepathFromString(str: string): Filepath {
    return str as Filepath;
  }

  toDocumentId(filepath: Filepath): StoreQualifiedDocumentId {
    const storeInstance = this._getDefaultStore();
    return this._toStoreDocumentId(storeInstance, filepath);
  }

  getStoreNamespaces(): string[] {
    return Array.from(this._stores.keys());
  }

  async createDocument(filepath: Filepath, content?: string): Promise<StoreQualifiedDocumentId> {
    // TODO: We should allow specifying the store/namespace when creating a document. 
    // For now we will just use the first registered store.
    const storeInstance = this._getDefaultStore();
    const version = await storeInstance.write(filepath, content);
    const id = this._toStoreDocumentId(storeInstance, filepath);
    this._setDocumentVersion(id, version);
    return id;
  }

  async readDocument(id: StoreQualifiedDocumentId): Promise<string> {
    const { store, filepath } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const doc = await storeInstance.read(filepath);
    this._setDocumentVersion(id, doc.version);

    const draftContent = this._readDraft(id);
    if (!draftContent) {
      this._setDirty(id, false);
      return doc.content;
    }

    this._setDirty(id, true);
    return draftContent.content;
  }

  async updateDocument(id: StoreQualifiedDocumentId, content: string): Promise<void> {
    const { store, filepath } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const draft = this._readDraft(id);
    const expectedVersion = draft?.baseVersion ?? this._getDocumentVersion(id);
    const nextVersion = await storeInstance.write(filepath, content, expectedVersion);
    this._setDocumentVersion(id, nextVersion);
    this.discardUnsavedDocumentChanges(id);
  }

  async renameDocument(id: StoreQualifiedDocumentId, toFilepath: Filepath): Promise<StoreQualifiedDocumentId> {
    const { filepath } = this._parseDocumentId(id);

    const store = this._getStoreForDocumentId(id);
    await store.mv(filepath, toFilepath);
    const newId = this._toStoreDocumentId(store, toFilepath);

    // Migrate draft to new ID if it exists
    const draft = this._readDraft(newId);
    if (draft) {
      this._writeDraft(newId, draft.content, draft.baseVersion);
      this._clearDraft(id);
    }

    // Migrate version
    const version = this._getDocumentVersion(id);
    if (version !== undefined) {
      this._setDocumentVersion(newId, version);
      this._documentVersions.delete(id);
    }

    // Migrate dirty state
    if (this._dirtyDocumentIds.has(id)) {
      this._dirtyDocumentIds.delete(id);
      this._setDirty(newId, true);
    }

    return newId;
  }

  async deleteDocument(id: StoreQualifiedDocumentId): Promise<void> {
    const { store, filepath } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    await storeInstance.rm(filepath);
    this._documentVersions.delete(id);
    this.discardUnsavedDocumentChanges(id);
  }

  async listDocuments(): Promise<StoreQualifiedDocumentId[]> {
    const allDocs: StoreQualifiedDocumentId[] = [];

    // Call ls on all stores in parallel and aggregate results
    await Promise.all(Array.from(this._stores.values()).map(async store => {
      const entries = await store.ls();
      const storeDocs = entries.map(entry => {
        const filepath = entry.filename as Filepath;
        return this._toStoreDocumentId(store, filepath);
      });
      allDocs.push(...storeDocs);
    }));
    return allDocs;
  }

  getDirtyDocumentIds(): StoreQualifiedDocumentId[] {
    return Array.from(this._dirtyDocumentIds);
  }

  isDocumentDirty(id: StoreQualifiedDocumentId): boolean {
    return this._dirtyDocumentIds.has(id);
  }

  setDocumentDraft(id: StoreQualifiedDocumentId, content: string): void {
    const existingDraft = this._readDraft(id);
    const baseVersion = existingDraft?.baseVersion ?? this._getDocumentVersion(id);
    this._writeDraft(id, content, baseVersion);
    this._setDirty(id, true);
  }

  discardUnsavedDocumentChanges(id: StoreQualifiedDocumentId): void {
    this._clearDraft(id);
    this._setDirty(id, false);
  }
}


