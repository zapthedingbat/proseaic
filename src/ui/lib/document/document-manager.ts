import { DocumentId } from "../workbench";
import { IDocumentService } from "./document-service";
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

  constructor(stores: IDocumentStore[] = []) {
    this._stores = new Map(stores.map(store => [store.namespace, store]));
    this._dirtyDocumentIds = new Set();
    this._documentVersions = new Map();
  }

  toDocumentId(filename: string): string {
    const escapedId = encodeURIComponent(filename);
    const storeInstance = this._getDefaultStore();
    return `${storeInstance.namespace}/${escapedId}`;
  }

  private _getStoreForDocumentId(id: DocumentId): IDocumentStore {
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


  private _parseDocumentId(id: DocumentId): { store: string; docId: string } {
    const [store, docId] = id.split("/");
    return {
      store,
      docId: decodeURIComponent(docId)
    };
  }

  private _getDraftStorageKey(id: DocumentId): string {
    return `${DocumentManager.DRAFT_KEY_PREFIX}${id}`;
  }

  private _readDraft(id: DocumentId): DraftRecord | null {
    const raw = globalThis.localStorage.getItem(this._getDraftStorageKey(id));
    if (raw === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { content?: unknown; baseVersion?: unknown };
      if (typeof parsed.content !== "string") {
        return null;
      }

      const baseVersion = typeof parsed.baseVersion === "string" ? parsed.baseVersion : undefined;
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
    globalThis.localStorage.setItem(this._getDraftStorageKey(id), JSON.stringify(draft));
  }

  private _clearDraft(id: DocumentId): void {
    globalThis.localStorage.removeItem(this._getDraftStorageKey(id));
  }

  private _setDirty(id: DocumentId, value: boolean): void {
    if (value) {
      this._dirtyDocumentIds.add(id);
      return;
    }
    this._dirtyDocumentIds.delete(id);
  }

  private _setDocumentVersion(id: DocumentId, version?: FileVersionToken): void {
    this._documentVersions.set(id, version);
  }

  private _getDocumentVersion(id: DocumentId): FileVersionToken | undefined {
    return this._documentVersions.get(id);
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

  async createDocument(filename: string, content?: string): Promise<string> {
    // TODO: We should allow specifying the store/namespace when creating a document. 
    // For now we will just use the first registered store.
    const storeInstance = this._stores.values().next().value;
    if (!storeInstance) {
      throw new Error("No document stores registered");
    }
    const existingFiles = await storeInstance.ls();
    if (existingFiles.some(file => file.filename === filename)) {
      throw new Error(`Failed to create document "${filename}": File already exists`);
    }
    const fullId = this.toDocumentId(filename);

    await storeInstance.write(filename, content);

    return fullId;
  }

  async readDocument(id: DocumentId): Promise<string> {
    const { store, docId } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const doc = await storeInstance.read(docId);
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
    const { store, docId } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const draft = this._readDraft(id);
    const expectedVersion = draft?.baseVersion ?? this._getDocumentVersion(id);
    const nextVersion = await storeInstance.write(docId, content, expectedVersion);
    this._setDocumentVersion(id, nextVersion);
    this.discardUnsavedDocumentChanges(id);
  }

  async renameDocument(fromId: DocumentId, toId: DocumentId): Promise<string> {
    const { store, docId } = this._parseDocumentId(fromId);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const movedFilename = await storeInstance.mv(docId, toId);
    const newFullId = `${store}/${encodeURIComponent(movedFilename)}`;

    // Migrate draft to new ID if it exists
    const draft = this._readDraft(newFullId);
    if (draft) {
      this._writeDraft(newFullId, draft.content, draft.baseVersion);
      this._clearDraft(fromId);
    }

    // Migrate version
    const version = this._getDocumentVersion(fromId);
    if (version !== undefined) {
      this._setDocumentVersion(newFullId, version);
      this._documentVersions.delete(fromId);
    }

    // Migrate dirty state
    if (this._dirtyDocumentIds.has(fromId)) {
      this._dirtyDocumentIds.delete(fromId);
      this._setDirty(newFullId, true);
    }

    return newFullId;
  }

  async deleteDocument(id: DocumentId): Promise<void> {
    const { store, docId } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    await storeInstance.rm(docId);
    this._documentVersions.delete(id);
    this.discardUnsavedDocumentChanges(id);
  }

  async listDocuments(): Promise<DocumentId[]> {
    const allDocs: DocumentId[] = [];
    for (const [namespace, storeInstance] of this._stores.entries()) {
      const files = await storeInstance.ls();
      allDocs.push(...files.map(file => `${namespace}/${encodeURIComponent(file.filename)}`));
    }
    return allDocs;
  }

  getDirtyDocumentIds(): DocumentId[] {
    return Array.from(this._dirtyDocumentIds);
  }

  isDocumentDirty(id: DocumentId): boolean {
    return this._dirtyDocumentIds.has(id);
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


