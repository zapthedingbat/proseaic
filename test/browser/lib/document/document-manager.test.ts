import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocumentManager } from "../../../../src/browser/lib/document/document-manager";
import { DocumentId, DocumentPath } from "../../../../src/browser/lib/document/document-service";
import type { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../../../../src/browser/lib/document/document-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const path = (s: string) => DocumentPath.parse(s);
const version = (v: string) => v as FileVersionToken;
const fileContent = (content: string, v = "1"): FileContent => ({ content, version: version(v) });

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => { map.delete(key); },
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
  };
}

function makeStore(namespace = "mem"): IDocumentStore {
  return {
    namespace,
    read: vi.fn().mockResolvedValue(fileContent("")),
    write: vi.fn().mockResolvedValue(version("1")),
    mv: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    ls: vi.fn().mockResolvedValue([] as FileEntry[]),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let store: IDocumentStore;
let storage: Storage;
let manager: DocumentManager;

beforeEach(() => {
  store = makeStore();
  storage = makeStorage();
  manager = new DocumentManager([store], storage);
});

// ---------------------------------------------------------------------------
// Store registration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Default storage
// ---------------------------------------------------------------------------

describe("constructor", () => {
  it("reads and writes drafts through the injected storage", async () => {
    const injected = makeStorage();
    const mgr = new DocumentManager([makeStore()], injected);
    const id = await mgr.createDocument(path("/doc.md"));
    mgr.setDocumentDraft(id, "hello");
    expect(injected.getItem(`document_draft:${id}`)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("getStoreNamespaces", () => {
  it("returns the namespace of each registered store", () => {
    expect(manager.getStoreNamespaces()).toEqual(["mem"]);
  });

  it("reflects dynamically registered stores", () => {
    manager.register(makeStore("second"));
    expect(manager.getStoreNamespaces()).toContain("second");
  });
});

// ---------------------------------------------------------------------------
// createDocument
// ---------------------------------------------------------------------------

describe("createDocument", () => {
  it("writes to the store and returns a DocumentId", async () => {
    const id = await manager.createDocument(path("/notes.md"));
    expect(store.write).toHaveBeenCalledWith(path("/notes.md"), undefined);
    expect(id.toString()).toBe("/mem/notes.md");
  });

  it("passes initial content to the store", async () => {
    await manager.createDocument(path("/hello.md"), "# Hello");
    expect(store.write).toHaveBeenCalledWith(path("/hello.md"), "# Hello");
  });

  it("invalidates the list cache", async () => {
    await manager.listDocuments(); // prime cache
    await manager.createDocument(path("/new.md"));
    await manager.listDocuments();
    expect(store.ls).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// readDocument
// ---------------------------------------------------------------------------

describe("readDocument", () => {
  it("returns the stored content when no draft exists", async () => {
    vi.mocked(store.read).mockResolvedValue(fileContent("stored content"));
    const id = await manager.createDocument(path("/doc.md"));
    const content = await manager.readDocument(id);
    expect(content).toBe("stored content");
  });

  it("marks the document clean when there is no draft", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    await manager.readDocument(id);
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("returns draft content when a draft exists", async () => {
    vi.mocked(store.read).mockResolvedValue(fileContent("stored"));
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft content");
    expect(await manager.readDocument(id)).toBe("draft content");
  });

  it("marks the document dirty when a draft exists", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    await manager.readDocument(id);
    expect(manager.isDocumentDirty(id)).toBe(true);
  });

  it("throws when the store namespace is not registered", async () => {
    const id = DocumentId.parse("/unknown/doc.md" as any);
    await expect(manager.readDocument(id)).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// updateDocument
// ---------------------------------------------------------------------------

describe("updateDocument", () => {
  it("writes updated content to the store", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    await manager.updateDocument(id, "updated");
    expect(store.write).toHaveBeenLastCalledWith(path("/doc.md"), "updated", expect.anything());
  });

  it("clears the draft and dirty state after saving", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    await manager.updateDocument(id, "saved");
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("passes the baseVersion from the draft to the store", async () => {
    vi.mocked(store.read).mockResolvedValue(fileContent("content", "42"));
    const id = await manager.createDocument(path("/doc.md"));
    await manager.readDocument(id); // loads version "42" from read response
    manager.setDocumentDraft(id, "draft");
    await manager.updateDocument(id, "saved");
    expect(store.write).toHaveBeenLastCalledWith(path("/doc.md"), "saved", version("42"));
  });
});

// ---------------------------------------------------------------------------
// setDocumentDraft / discardUnsavedDocumentChanges
// ---------------------------------------------------------------------------

describe("setDocumentDraft", () => {
  it("marks the document dirty", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    expect(manager.isDocumentDirty(id)).toBe(true);
  });

  it("appears in getDirtyDocumentIds", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    expect(manager.getDirtyDocumentIds().some(d => d.equals(id))).toBe(true);
  });

  it("preserves baseVersion across multiple draft updates", async () => {
    vi.mocked(store.read).mockResolvedValue(fileContent("content", "5"));
    const id = await manager.createDocument(path("/doc.md"));
    await manager.readDocument(id); // loads version "5" from read response
    manager.setDocumentDraft(id, "draft v1");
    manager.setDocumentDraft(id, "draft v2"); // second update must not reset baseVersion
    await manager.updateDocument(id, "saved");
    expect(store.write).toHaveBeenLastCalledWith(path("/doc.md"), "saved", version("5"));
  });
});

describe("discardUnsavedDocumentChanges", () => {
  it("clears dirty state", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    manager.discardUnsavedDocumentChanges(id);
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("causes readDocument to return stored content again", async () => {
    vi.mocked(store.read).mockResolvedValue(fileContent("stored"));
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    manager.discardUnsavedDocumentChanges(id);
    expect(await manager.readDocument(id)).toBe("stored");
  });
});

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------

describe("deleteDocument", () => {
  it("calls rm on the store", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    await manager.deleteDocument(id);
    expect(store.rm).toHaveBeenCalledWith(path("/doc.md"));
  });

  it("clears dirty state on deletion", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    await manager.deleteDocument(id);
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("invalidates the list cache", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    await manager.listDocuments(); // prime cache
    await manager.deleteDocument(id);
    await manager.listDocuments();
    expect(store.ls).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

describe("listDocuments", () => {
  it("maps store entries to DocumentIds", async () => {
    vi.mocked(store.ls).mockResolvedValue([
      { filepath: path("/a.md"), version: version("1") },
      { filepath: path("/b.md"), version: version("1") },
    ]);
    const docs = await manager.listDocuments();
    expect(docs.map(d => d.toString())).toEqual(["/mem/a.md", "/mem/b.md"]);
  });

  it("returns cached results on the second call without re-querying", async () => {
    await manager.listDocuments();
    await manager.listDocuments();
    expect(store.ls).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// renameDocument
// ---------------------------------------------------------------------------

describe("renameDocument", () => {
  it("calls mv on the store with the correct paths", async () => {
    const id = await manager.createDocument(path("/old.md"));
    await manager.renameDocument(id, path("/new.md"));
    expect(store.mv).toHaveBeenCalledWith(path("/old.md"), path("/new.md"));
  });

  it("returns a DocumentId with the new path", async () => {
    const id = await manager.createDocument(path("/old.md"));
    const newId = await manager.renameDocument(id, path("/new.md"));
    expect(newId.toString()).toBe("/mem/new.md");
  });

  it("migrates draft content to the new id", async () => {
    vi.mocked(store.read).mockResolvedValue(fileContent("stored"));
    const id = await manager.createDocument(path("/old.md"));
    manager.setDocumentDraft(id, "draft content");
    const newId = await manager.renameDocument(id, path("/new.md"));
    expect(await manager.readDocument(newId)).toBe("draft content");
  });

  it("migrates dirty state to the new id", async () => {
    const id = await manager.createDocument(path("/old.md"));
    manager.setDocumentDraft(id, "draft");
    const newId = await manager.renameDocument(id, path("/new.md"));
    expect(manager.isDocumentDirty(newId)).toBe(true);
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("invalidates the list cache", async () => {
    const id = await manager.createDocument(path("/old.md"));
    await manager.listDocuments(); // prime cache
    await manager.renameDocument(id, path("/new.md"));
    await manager.listDocuments();
    expect(store.ls).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// documentPathFromString / documentIdFromPath
// ---------------------------------------------------------------------------

describe("documentPathFromString", () => {
  it("parses an absolute path", () => {
    expect(manager.documentPathFromString("/notes.md").toString()).toBe("/notes.md");
  });

  it("prepends a leading slash to relative paths", () => {
    expect(manager.documentPathFromString("notes.md").toString()).toBe("/notes.md");
  });
});

describe("documentIdFromPath", () => {
  it("creates an id scoped to the default store namespace", () => {
    expect(manager.documentIdFromPath(path("/notes.md")).toString()).toBe("/mem/notes.md");
  });
});
