import { describe, expect, it, vi } from "vitest";
import { FileSystemDocumentStore } from "../../../../src/browser/lib/document/file-system-document-store.js";
import { DocumentConcurrencyError } from "../../../../src/browser/lib/document/document-store.js";

describe("FileSystemDocumentStore", () => {
  it("reads raw markdown content instead of parsing JSON", async () => {
    const getFile = vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue("# Notes\n\nHello"),
      lastModified: 123
    });
    const getFileHandle = vi.fn().mockResolvedValue({ getFile });
    const directoryHandle = { getFileHandle } as unknown as FileSystemDirectoryHandle;
    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.read("notes.md")).resolves.toEqual({
      content: "# Notes\n\nHello",
      version: "123"
    });

    expect(getFileHandle).toHaveBeenCalledWith("notes.md");
  });

  it("writes document content to filename", async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };

    const getFileHandle = vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (name === "hello.md" && options?.create) {
        return {
          createWritable: vi.fn().mockResolvedValue(writable),
          getFile: vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue(""),
            lastModified: 123
          })
        };
      }
      throw new Error("missing");
    });

    const directoryHandle = { getFileHandle } as unknown as FileSystemDirectoryHandle;
    const store = new FileSystemDocumentStore(async () => directoryHandle);

    const version = await store.write("hello.md", "");

    expect(version).toBeDefined();
    expect(writable.write).toHaveBeenCalledWith("");
    expect(writable.close).toHaveBeenCalled();
  });

  it("lists markdown files from directory entries", async () => {
    const directoryHandle = {
      async *entries() {
        yield ["readme.md", {
          kind: "file",
          name: "readme.md",
          getFile: vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue(""),
            lastModified: 123
          })
        } as unknown as FileSystemHandle];
        yield ["photo.jpg", { kind: "file", name: "photo.jpg" } as FileSystemHandle];
      }
    } as unknown as FileSystemDirectoryHandle;

    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.ls()).resolves.toEqual([{ filename: "readme.md", version: expect.any(String) }]);
  });

  it("moves document to new filename", async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };

    const directoryHandle = {
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (name === "notes.md") {
          return {
            getFile: vi.fn().mockResolvedValue({
              text: vi.fn().mockResolvedValue("# Notes"),
              lastModified: 456
            })
          };
        }
        if (name === "new-title.md" && options?.create) {
          return { createWritable: vi.fn().mockResolvedValue(writable) };
        }
        throw new Error(`Not found: ${name}`);
      }),
      removeEntry: vi.fn().mockResolvedValue(undefined),
      async *entries() {
        yield ["new-title.md", { kind: "file", name: "new-title.md" } as FileSystemHandle];
      }
    } as unknown as FileSystemDirectoryHandle;

    const store = new FileSystemDocumentStore(async () => directoryHandle);

    const newFilename = await store.mv("notes.md", "new-title.md");

    expect(newFilename).toBe("new-title.md");
    expect(writable.write).toHaveBeenCalledWith("# Notes");
    expect(directoryHandle.removeEntry).toHaveBeenCalledWith("notes.md");
  });

  it("rejects update when expected version is stale", async () => {
    const createWritable = vi.fn();
    const getFileHandle = vi.fn().mockResolvedValue({
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue("# Notes"),
        lastModified: 200
      }),
      createWritable
    });
    const directoryHandle = { getFileHandle } as unknown as FileSystemDirectoryHandle;
    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.write("notes.md", "changed", "100")).rejects.toBeInstanceOf(DocumentConcurrencyError);
    expect(createWritable).not.toHaveBeenCalled();
  });

  it("rejects empty titles", async () => {
    const directoryHandle = {
      getFileHandle: vi.fn().mockRejectedValue(new TypeError("Filename cannot be empty"))
    } as unknown as FileSystemDirectoryHandle;
    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.write("", "")).rejects.toThrow();
  });

  it("rejects titles with invalid characters", async () => {
    const directoryHandle = {
      getFileHandle: vi.fn().mockRejectedValue(new TypeError("Invalid filename characters"))
    } as unknown as FileSystemDirectoryHandle;
    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.write("Hello @!# World.md", "")).rejects.toThrow();
  });

  it("rejects move when target filename already exists", async () => {
    const directoryHandle = {
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (name === "source.md" && !options) {
          return {
            getFile: vi.fn().mockResolvedValue({
              text: vi.fn().mockResolvedValue("source"),
              lastModified: 200
            })
          };
        }
        if (name === "target.md" && !options) {
          return {
            getFile: vi.fn().mockResolvedValue({
              text: vi.fn().mockResolvedValue("target"),
              lastModified: 201
            })
          };
        }
        throw new Error("missing");
      })
    } as unknown as FileSystemDirectoryHandle;
    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.mv("source.md", "target.md")).rejects.toThrow("Failed to move file");
  });
});