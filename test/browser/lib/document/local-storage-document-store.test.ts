import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageDocumentStore } from "../../../../src/browser/lib/document/stores/local-storage-document-store.js";
import { DocumentPath } from "../../../../src/browser/lib/document/document-service.js";
import { DocumentConcurrencyError, DocumentIdConflictError } from "../../../../src/browser/lib/document/errors.js";

function path(str: string): DocumentPath {
  return DocumentPath.parse(str);
}

describe("LocalStorageDocumentStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("write and read", () => {
    it("writes and reads content", async () => {
      const store = new LocalStorageDocumentStore("test");
      await store.write(path("/doc.md"), "hello");
      const { content } = await store.read(path("/doc.md"));
      expect(content).toBe("hello");
    });

    it("read throws for unknown path", async () => {
      const store = new LocalStorageDocumentStore("test");
      await expect(store.read(path("/missing.md"))).rejects.toThrow("File not found");
    });

    it("write increments version on each update", async () => {
      const store = new LocalStorageDocumentStore("test");
      const v1 = await store.write(path("/doc.md"), "v1");
      const v2 = await store.write(path("/doc.md"), "v2");
      expect(v2).not.toBe(v1);
    });

    it("write with matching expectedVersion succeeds", async () => {
      const store = new LocalStorageDocumentStore("test");
      const v1 = await store.write(path("/doc.md"), "first");
      await expect(store.write(path("/doc.md"), "second", v1)).resolves.toBeDefined();
    });

    it("write with stale expectedVersion throws DocumentConcurrencyError", async () => {
      const store = new LocalStorageDocumentStore("test");
      const v1 = await store.write(path("/doc.md"), "first");
      await store.write(path("/doc.md"), "second");
      await expect(store.write(path("/doc.md"), "third", v1))
        .rejects.toBeInstanceOf(DocumentConcurrencyError);
    });
  });

  describe("namespace isolation", () => {
    it("does not see documents from a different prefix", async () => {
      const storeA = new LocalStorageDocumentStore("ns-a");
      const storeB = new LocalStorageDocumentStore("ns-b");
      await storeA.write(path("/doc.md"), "from a");
      await expect(storeB.read(path("/doc.md"))).rejects.toThrow("File not found");
    });

    it("ls only returns documents under its own prefix", async () => {
      const storeA = new LocalStorageDocumentStore("ns-a");
      const storeB = new LocalStorageDocumentStore("ns-b");
      await storeA.write(path("/a.md"), "");
      await storeB.write(path("/b.md"), "");
      const entries = await storeA.ls();
      expect(entries.map(e => e.filepath.toString())).toEqual(["/a.md"]);
    });
  });

  describe("ls", () => {
    it("returns empty array for empty store", async () => {
      const store = new LocalStorageDocumentStore("test");
      expect(await store.ls()).toEqual([]);
    });

    it("lists all written documents", async () => {
      const store = new LocalStorageDocumentStore("test");
      await store.write(path("/a.md"), "");
      await store.write(path("/b.md"), "");
      const entries = await store.ls();
      expect(entries.map(e => e.filepath.toString()).sort()).toEqual(["/a.md", "/b.md"]);
    });
  });

  describe("rm", () => {
    it("removes a document", async () => {
      const store = new LocalStorageDocumentStore("test");
      await store.write(path("/doc.md"), "content");
      await store.rm(path("/doc.md"));
      await expect(store.read(path("/doc.md"))).rejects.toThrow("File not found");
    });
  });

  describe("mv", () => {
    it("moves a document to a new path", async () => {
      const store = new LocalStorageDocumentStore("test");
      await store.write(path("/old.md"), "data");
      await store.mv(path("/old.md"), path("/new.md"));
      const { content } = await store.read(path("/new.md"));
      expect(content).toBe("data");
      await expect(store.read(path("/old.md"))).rejects.toThrow("File not found");
    });

    it("is a no-op when source and destination are the same", async () => {
      const store = new LocalStorageDocumentStore("test");
      await store.write(path("/doc.md"), "content");
      await store.mv(path("/doc.md"), path("/doc.md"));
      const { content } = await store.read(path("/doc.md"));
      expect(content).toBe("content");
    });

    it("throws DocumentIdConflictError when destination already exists", async () => {
      const store = new LocalStorageDocumentStore("test");
      await store.write(path("/a.md"), "a");
      await store.write(path("/b.md"), "b");
      await expect(store.mv(path("/a.md"), path("/b.md")))
        .rejects.toBeInstanceOf(DocumentIdConflictError);
    });

    it("throws for a missing source path", async () => {
      const store = new LocalStorageDocumentStore("test");
      await expect(store.mv(path("/missing.md"), path("/target.md")))
        .rejects.toThrow("File not found");
    });
  });
});
