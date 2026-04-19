import { IDocumentService } from "./document-service";
import { FileVersionToken, IDocumentStore } from "./document-store";

type DraftRecord = {
  content: string;
  baseVersion?: FileVersionToken;
};

export class DocumentManager implements IDocumentService {
  private static readonly DRAFT_KEY_PREFIX = "document_draft:";
  private static readonly FILE_EXTENSION = ".md";
  private _stores: Map<string, IDocumentStore>;
  private _dirtyDocumentIds: Set<string>;
  private _documentVersions: Map<string, FileVersionToken | undefined>;

  constructor(stores: IDocumentStore[] = []) {
    this._stores = new Map(stores.map(store => [store.namespace, store]));
    this._dirtyDocumentIds = new Set();
    this._documentVersions = new Map();
  }

  private _parseDocumentId(id: string): { store: string; docId: string } {
    const [store, docId] = id.split("/");
    return {
      store,
      docId: decodeURIComponent(docId)
    };
  }

  private _toFilename(title: string): string {
    return `${title}${DocumentManager.FILE_EXTENSION}`;
  }

  private _toTitle(filename: string): string {
    return filename.endsWith(DocumentManager.FILE_EXTENSION)
      ? filename.slice(0, -DocumentManager.FILE_EXTENSION.length)
      : filename;
  }

  private _getDraftStorageKey(id: string): string {
    return `${DocumentManager.DRAFT_KEY_PREFIX}${id}`;
  }

  private _readDraft(id: string): DraftRecord | null {
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

  private _writeDraft(id: string, content: string, baseVersion?: FileVersionToken): void {
    const draft: DraftRecord = {
      content,
      baseVersion
    };
    globalThis.localStorage.setItem(this._getDraftStorageKey(id), JSON.stringify(draft));
  }

  private _clearDraft(id: string): void {
    globalThis.localStorage.removeItem(this._getDraftStorageKey(id));
  }

  private _setDirty(id: string, value: boolean): void {
    if (value) {
      this._dirtyDocumentIds.add(id);
      return;
    }
    this._dirtyDocumentIds.delete(id);
  }

  private _setDocumentVersion(id: string, version?: FileVersionToken): void {
    this._documentVersions.set(id, version);
  }

  private _getDocumentVersion(id: string): FileVersionToken | undefined {
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

  async createDocument(title: string, store: string): Promise<string> {
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const filename = this._toFilename(title);
    const existingFiles = await storeInstance.ls();
    if (existingFiles.some(file => file.filename === filename)) {
      throw new Error(`Failed to create document "${title}": File already exists`);
    }
    await storeInstance.write(filename, "");
    const escapedId = encodeURIComponent(filename);
    const fullId = `${store}/${escapedId}`;
    this.discardUnsavedDocumentChanges(fullId);
    return fullId;
  }

  async readDocument(id: string): Promise<string> {
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

  async updateDocument(id: string, content: string): Promise<void> {
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

  async renameDocument(id: string, title: string): Promise<string> {
    const { store, docId } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    const newFilename = this._toFilename(title);
    const movedFilename = await storeInstance.mv(docId, newFilename);
    const newFullId = `${store}/${encodeURIComponent(movedFilename)}`;

    // Migrate draft to new ID if it exists
    const draft = this._readDraft(id);
    if (draft) {
      this._writeDraft(newFullId, draft.content, draft.baseVersion);
      this._clearDraft(id);
    }

    // Migrate version
    const version = this._getDocumentVersion(id);
    if (version !== undefined) {
      this._setDocumentVersion(newFullId, version);
      this._documentVersions.delete(id);
    }

    // Migrate dirty state
    if (this._dirtyDocumentIds.has(id)) {
      this._dirtyDocumentIds.delete(id);
      this._setDirty(newFullId, true);
    }

    return newFullId;
  }

  async deleteDocument(id: string): Promise<void> {
    const { store, docId } = this._parseDocumentId(id);
    const storeInstance = this._stores.get(store);
    if (!storeInstance) {
      throw new Error(`Document store with namespace ${store} not found`);
    }
    await storeInstance.rm(docId);
    this._documentVersions.delete(id);
    this.discardUnsavedDocumentChanges(id);
  }

  async listDocuments(): Promise<{ id: string; title: string }[]> {
    const allDocs: { id: string; title: string }[] = [];
    for (const [namespace, storeInstance] of this._stores.entries()) {
      const files = await storeInstance.ls();
      allDocs.push(...files.map(file => ({
        id: `${namespace}/${encodeURIComponent(file.filename)}`,
        title: this._toTitle(file.filename)
      })));
    }
    return allDocs;
  }

  getDirtyDocumentIds(): string[] {
    return Array.from(this._dirtyDocumentIds);
  }

  isDocumentDirty(id: string): boolean {
    return this._dirtyDocumentIds.has(id);
  }

  setDocumentDraft(id: string, content: string): void {
    const existingDraft = this._readDraft(id);
    const baseVersion = existingDraft?.baseVersion ?? this._getDocumentVersion(id);
    this._writeDraft(id, content, baseVersion);
    this._setDirty(id, true);
  }

  discardUnsavedDocumentChanges(id: string): void {
    this._clearDraft(id);
    this._setDirty(id, false);
  }
}


