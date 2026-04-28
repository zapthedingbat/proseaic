import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocumentManager } from "../../../../src/browser/lib/document/document-manager";
import { DocumentId, DocumentPath } from "../../../../src/browser/lib/document/document-service";
import { MemoryDocumentStore } from "../../../../src/browser/lib/document/stores/memory-document-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const path = (s: string) => DocumentPath.parse(s);

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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let store: MemoryDocumentStore;
let storage: Storage;
let manager: DocumentManager;

beforeEach(() => {
  store = new MemoryDocumentStore();
  storage = makeStorage();
  manager = new DocumentManager([store], storage);
});

// ---------------------------------------------------------------------------
// Store registration
// ---------------------------------------------------------------------------

describe("getStoreNamespaces", () => {
  it("returns the namespace of each registered store", () => {
    expect(manager.getStoreNamespaces()).toEqual(["memory"]);
  });

  it("reflects dynamically registered stores", () => {
    const second = new MemoryDocumentStore();
    second.namespace = "second";
    manager.register(second);
    expect(manager.getStoreNamespaces()).toContain("second");
  });
});

// ---------------------------------------------------------------------------
// createDocument
// ---------------------------------------------------------------------------

describe("createDocument", () => {
  it("creates a document and returns a DocumentId", async () => {
    const id = await manager.createDocument(path("/notes.md"));
    expect(id).toBeInstanceOf(DocumentId);
    expect(id.toString()).toBe("/memory/notes.md");
  });

  it("creates a document with initial content", async () => {
    const id = await manager.createDocument(path("/hello.md"), "# Hello");
    const content = await manager.readDocument(id);
    expect(content).toBe("# Hello");
  });

  it("invalidates the list cache", async () => {
    const lsSpy = vi.spyOn(store, "ls");
    await manager.listDocuments(); // prime cache
    await manager.createDocument(path("/new.md"));
    await manager.listDocuments(); // should re-query
    expect(lsSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// readDocument
// ---------------------------------------------------------------------------

describe("readDocument", () => {
  it("returns the stored content when no draft exists", async () => {
    const id = await manager.createDocument(path("/doc.md"), "stored content");
    const content = await manager.readDocument(id);
    expect(content).toBe("stored content");
  });

  it("marks the document clean when there is no draft", async () => {
    const id = await manager.createDocument(path("/doc.md"), "stored");
    await manager.readDocument(id);
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("returns draft content when a draft exists", async () => {
    const id = await manager.createDocument(path("/doc.md"), "stored");
    manager.setDocumentDraft(id, "draft content");
    const content = await manager.readDocument(id);
    expect(content).toBe("draft content");
  });

  it("marks the document dirty when a draft exists", async () => {
    const id = await manager.createDocument(path("/doc.md"), "stored");
    manager.setDocumentDraft(id, "draft content");
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
  it("persists new content to the store", async () => {
    const id = await manager.createDocument(path("/doc.md"), "original");
    await manager.updateDocument(id, "updated");
    const content = await manager.readDocument(id);
    expect(content).toBe("updated");
  });

  it("clears the draft after saving", async () => {
    const id = await manager.createDocument(path("/doc.md"), "original");
    manager.setDocumentDraft(id, "draft");
    await manager.updateDocument(id, "saved");
    expect(manager.isDocumentDirty(id)).toBe(false);
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
    const dirty = manager.getDirtyDocumentIds();
    expect(dirty.some(d => d.equals(id))).toBe(true);
  });

  it("preserves the baseVersion from the initial store read", async () => {
    const id = await manager.createDocument(path("/doc.md"), "v1");
    await manager.readDocument(id); // loads version into memory
    manager.setDocumentDraft(id, "draft v1");

    // A second draft update must not reset the baseVersion to undefined.
    manager.setDocumentDraft(id, "draft v2");

    // Save should succeed (uses the stored baseVersion, not undefined).
    await expect(manager.updateDocument(id, "saved")).resolves.not.toThrow();
  });
});

describe("discardUnsavedDocumentChanges", () => {
  it("clears the draft and marks the document clean", async () => {
    const id = await manager.createDocument(path("/doc.md"), "stored");
    manager.setDocumentDraft(id, "draft");
    manager.discardUnsavedDocumentChanges(id);
    expect(manager.isDocumentDirty(id)).toBe(false);
    const content = await manager.readDocument(id);
    expect(content).toBe("stored");
  });
});

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------

describe("deleteDocument", () => {
  it("removes the document from the store", async () => {
    const id = await manager.createDocument(path("/doc.md"), "content");
    await manager.deleteDocument(id);
    const docs = await manager.listDocuments();
    expect(docs.some(d => d.equals(id))).toBe(false);
  });

  it("clears dirty state on deletion", async () => {
    const id = await manager.createDocument(path("/doc.md"));
    manager.setDocumentDraft(id, "draft");
    await manager.deleteDocument(id);
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("invalidates the list cache", async () => {
    const lsSpy = vi.spyOn(store, "ls");
    const id = await manager.createDocument(path("/doc.md"));
    await manager.listDocuments(); // prime cache
    await manager.deleteDocument(id);
    await manager.listDocuments(); // should re-query
    expect(lsSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

describe("listDocuments", () => {
  it("returns all documents in the store", async () => {
    await manager.createDocument(path("/a.md"));
    await manager.createDocument(path("/b.md"));
    const docs = await manager.listDocuments();
    expect(docs).toHaveLength(2);
  });

  it("returns cached results on the second call", async () => {
    const lsSpy = vi.spyOn(store, "ls");
    await manager.listDocuments();
    await manager.listDocuments();
    expect(lsSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// renameDocument
// ---------------------------------------------------------------------------

describe("renameDocument", () => {
  it("returns a DocumentId with the new path", async () => {
    const id = await manager.createDocument(path("/old.md"), "content");
    const newId = await manager.renameDocument(id, path("/new.md"));
    expect(newId.toString()).toBe("/memory/new.md");
  });

  it("makes the document readable under the new id", async () => {
    const id = await manager.createDocument(path("/old.md"), "content");
    const newId = await manager.renameDocument(id, path("/new.md"));
    const content = await manager.readDocument(newId);
    expect(content).toBe("content");
  });

  it("makes draft content readable under the new id", async () => {
    const id = await manager.createDocument(path("/old.md"), "stored");
    manager.setDocumentDraft(id, "draft content");
    const newId = await manager.renameDocument(id, path("/new.md"));
    const content = await manager.readDocument(newId);
    expect(content).toBe("draft content");
  });

  it("migrates dirty state to the new id", async () => {
    const id = await manager.createDocument(path("/old.md"));
    manager.setDocumentDraft(id, "draft");
    const newId = await manager.renameDocument(id, path("/new.md"));
    expect(manager.isDocumentDirty(newId)).toBe(true);
    expect(manager.isDocumentDirty(id)).toBe(false);
  });

  it("invalidates the list cache", async () => {
    const lsSpy = vi.spyOn(store, "ls");
    const id = await manager.createDocument(path("/old.md"));
    await manager.listDocuments(); // prime cache
    await manager.renameDocument(id, path("/new.md"));
    await manager.listDocuments(); // should re-query
    expect(lsSpy).toHaveBeenCalledTimes(2);
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
  it("creates an id scoped to the default store", () => {
    const id = manager.documentIdFromPath(path("/notes.md"));
    expect(id.toString()).toBe("/memory/notes.md");
  });
});
