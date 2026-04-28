import { IDocumentService, DocumentPath, DocumentId, DocumentIdString } from "./document-service";
import { FileVersionToken, IDocumentStore } from "./document-store";

type DraftRecord = {
  content: string;
  baseVersion?: FileVersionToken;
};

export class DocumentManager implements IDocumentService {
  private static readonly DRAFT_KEY_PREFIX = "document_draft:";
  private _stores: Map<string, IDocumentStore>;
  private _dirtyDocumentIds: Set<string>;
  private _documentVersions: Map<string, FileVersionToken | undefined>;
  private _documentListCache: DocumentId[] | null = null;
  private _storage: Storage;

  constructor(stores: IDocumentStore[], storage: Storage) {
    this._stores = new Map(stores.map(store => [store.namespace, store]));
    this._dirtyDocumentIds = new Set();
    this._documentVersions = new Map();
    this._storage = storage;
  }

  private _getDefaultStore(): IDocumentStore {
    const store = this._stores.values().next().value;
    if (!store) {
      throw new Error("No document stores registered");
    }
    return store;
  }

  private _getDraftStorageKey(id: DocumentId): string {
    return `${DocumentManager.DRAFT_KEY_PREFIX}${id}`;
  }

  private _readDraft(id: DocumentId): DraftRecord | null {
    const raw = this._storage.getItem(this._getDraftStorageKey(id));
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

  private _writeDraft(id: DocumentId, content: string, baseVersion?: FileVersionToken): void {
    const draft: DraftRecord = {
      content,
      baseVersion
    };
    this._storage.setItem(this._getDraftStorageKey(id), JSON.stringify(draft));
  }

  private _clearDraft(id: DocumentId): void {
    this._storage.removeItem(this._getDraftStorageKey(id));
  }

  private _setDirty(id: DocumentId, value: boolean): void {
    if (value) {
      this._dirtyDocumentIds.add(id.toString());
      return;
    }
    this._dirtyDocumentIds.delete(id.toString());
  }

  private _setDocumentVersion(id: DocumentId, version?: FileVersionToken): void {
    this._documentVersions.set(id.toString(), version);
  }

  private _getDocumentVersion(id: DocumentId): FileVersionToken | undefined {
    return this._documentVersions.get(id.toString());
  }

  public register(store: IDocumentStore): void {
    this._stores.set(store.namespace, store);
  }

  public registerMany(stores: IDocumentStore[]): void {
    stores.forEach(store => this.register(store));
  }

  documentPathFromString(str: string): DocumentPath {
    const absoluteStr = str.startsWith("/") ? str : `/${str}`;
    return DocumentPath.parse(absoluteStr);
  }

  documentIdFromPath(path: DocumentPath): DocumentId {
    // This method is needed to check for existing documents when creating new ones, since we only have the path at that point.
    // We will assume the default store for this lookup since we currently only support one store. This will need to be revisited if we add support for multiple stores.
    const defaultStore = this._getDefaultStore();
    return DocumentId.create(defaultStore.namespace, path);
  }

  getStoreNamespaces(): string[] {
    return Array.from(this._stores.keys());
  }

  async createDocument(filepath: DocumentPath, content?: string): Promise<DocumentId> {
    // TODO: We should allow specifying the store/namespace when creating a document.
    // For now we will just use the first registered store.
    const storeInstance = this._getDefaultStore();
    const version = await storeInstance.write(filepath, content);
    const id = DocumentId.create(storeInstance.namespace, filepath);
    this._setDocumentVersion(id, version);
    this._documentListCache = null;
    return id;
  }

  async readDocument(id: DocumentId): Promise<string> {

    const storeInstance = this._stores.get(id.store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${id.store} not found`);
    }
    const doc = await storeInstance.read(id.path);
    this._setDocumentVersion(id, doc.version);

    const draftContent = this._readDraft(id);
    if (!draftContent) {
      this._setDirty(id, false);
      return doc.content;
    }

    this._setDirty(id, true);
    return draftContent.content;
  }

  async updateDocument(id: DocumentId, content: string): Promise<void> {
    const storeInstance = this._stores.get(id.store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${id.store} not found`);
    }
    const draft = this._readDraft(id);
    const expectedVersion = draft?.baseVersion ?? this._getDocumentVersion(id);
    const nextVersion = await storeInstance.write(id.path, content, expectedVersion);
    this._setDocumentVersion(id, nextVersion);
    this.discardUnsavedDocumentChanges(id);
  }

  async renameDocument(id: DocumentId, toFilepath: DocumentPath): Promise<DocumentId> {

    const store = this._stores.get(id.store);
    if (!store) {
      throw new Error(`Document store with namespace ${id.store} not found`);
    }

    await store.mv(id.path, toFilepath);
    this._documentListCache = null;
    const newId = DocumentId.create(id.store, toFilepath);
    
    // Migrate draft to new ID if it exists
    const draft = this._readDraft(id);
    if (draft) {
      this._writeDraft(newId, draft.content, draft.baseVersion);
      this._clearDraft(id);
    }

    // Migrate version
    const version = this._getDocumentVersion(id);
    if (version !== undefined) {
      this._setDocumentVersion(newId, version);
      this._documentVersions.delete(id.toString());
    }

    // Migrate dirty state
    if (this._dirtyDocumentIds.has(id.toString())) {
      this._dirtyDocumentIds.delete(id.toString());
      this._setDirty(newId, true);
    }

    return newId;
  }

  async deleteDocument(id: DocumentId): Promise<void> {
    const storeInstance = this._stores.get(id.store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${id.store} not found`);
    }
    await storeInstance.rm(id.path);
    this._documentListCache = null;
    this._documentVersions.delete(id.toString());
    this.discardUnsavedDocumentChanges(id);
  }

  async listDocuments(): Promise<DocumentId[]> {
    if (this._documentListCache !== null) {
      return this._documentListCache;
    }

    const allDocs: DocumentId[] = [];
    await Promise.all(Array.from(this._stores.values()).map(async store => {
      const entries = await store.ls();
      allDocs.push(...entries.map(entry => DocumentId.create(store.namespace, entry.filepath)));
    }));

    this._documentListCache = allDocs;
    return allDocs;
  }

  getDirtyDocumentIds(): DocumentId[] {
    return Array.from(this._dirtyDocumentIds).map(s => DocumentId.parse(s as DocumentIdString));
  }

  isDocumentDirty(id: DocumentId): boolean {
    return this._dirtyDocumentIds.has(id.toString());
  }

  setDocumentDraft(id: DocumentId, content: string): void {
    const existingDraft = this._readDraft(id);
    const baseVersion = existingDraft?.baseVersion ?? this._getDocumentVersion(id);
    this._writeDraft(id, content, baseVersion);
    this._setDirty(id, true);
  }

  discardUnsavedDocumentChanges(id: DocumentId): void {
    this._clearDraft(id);
    this._setDirty(id, false);
  }
}


