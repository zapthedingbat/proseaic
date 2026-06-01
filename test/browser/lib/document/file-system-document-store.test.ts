// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { FileSystemDocumentStore } from "../../../../src/browser/lib/document/stores/file-system-document-store.js";
import { DocumentConcurrencyError, DocumentIdConflictError } from "../../../../src/browser/lib/document/errors.js";
import { DocumentPath } from "../../../../src/browser/lib/document/document-service.js";

const path = (s: string) => DocumentPath.parse(s);

describe("FileSystemDocumentStore", () => {
  it("reads raw markdown content", async () => {
    const getFile = vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue("# Notes\n\nHello"),
      lastModified: 123
    });
    const getFileHandle = vi.fn().mockResolvedValue({ getFile });
    const store = new FileSystemDocumentStore(async () => ({ getFileHandle } as unknown as FileSystemDirectoryHandle));

    await expect(store.read(path("/notes.md"))).resolves.toEqual({
      content: "# Notes\n\nHello",
      version: "123"
    });

    expect(getFileHandle).toHaveBeenCalledWith("notes.md");
  });

  it("writes document content", async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const getFileHandle = vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (name === "hello.md" && options?.create) {
        return {
          createWritable: vi.fn().mockResolvedValue(writable),
          getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(""), lastModified: 123 })
        };
      }
      throw new Error("missing");
    });
    const store = new FileSystemDocumentStore(async () => ({ getFileHandle } as unknown as FileSystemDirectoryHandle));

    const version = await store.write(path("/hello.md"), "");

    expect(version).toBeDefined();
    expect(writable.write).toHaveBeenCalledWith({ type: "write", data: "" });
    expect(writable.close).toHaveBeenCalled();
  });

  it("lists markdown files from directory entries", async () => {
    const directoryHandle = {
      async *[Symbol.asyncIterator]() {
        yield ["readme.md", {
          kind: "file",
          name: "readme.md",
          getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(""), lastModified: 123 })
        } as unknown as FileSystemHandle];
        yield ["photo.jpg", { kind: "file", name: "photo.jpg" } as FileSystemHandle];
      }
    } as unknown as FileSystemDirectoryHandle;

    const store = new FileSystemDocumentStore(async () => directoryHandle);

    const entries = await store.ls();
    expect(entries).toHaveLength(1);
    expect(entries[0].filepath.toString()).toBe("/readme.md");
    expect(entries[0].version).toBeDefined();
  });

  it("moves document to new filepath", async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const directoryHandle = {
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (name === "notes.md") {
          return {
            getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue("# Notes"), lastModified: 456 })
          };
        }
        if (name === "new-title.md" && !options) throw new Error("not found");
        if (name === "new-title.md" && options?.create) {
          return { createWritable: vi.fn().mockResolvedValue(writable) };
        }
        throw new Error(`Not found: ${name}`);
      }),
      removeEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as FileSystemDirectoryHandle;

    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await store.mv(path("/notes.md"), path("/new-title.md"));

    expect(writable.write).toHaveBeenCalledWith({ type: "write", data: "# Notes" });
    expect(directoryHandle.removeEntry).toHaveBeenCalledWith("notes.md");
  });

  it("rejects update when expected version is stale", async () => {
    const createWritable = vi.fn();
    const getFileHandle = vi.fn().mockResolvedValue({
      getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue("# Notes"), lastModified: 200 }),
      createWritable
    });
    const store = new FileSystemDocumentStore(async () => ({ getFileHandle } as unknown as FileSystemDirectoryHandle));

    await expect(store.write(path("/notes.md"), "changed", "100" as any)).rejects.toBeInstanceOf(DocumentConcurrencyError);
    expect(createWritable).not.toHaveBeenCalled();
  });

  it("reads nested file by walking subdirectories", async () => {
    const getFile = vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue("deep"),
      lastModified: 999
    });
    const fileHandle = { getFile };
    const subDir = {
      getFileHandle: vi.fn().mockResolvedValue(fileHandle)
    };
    const workDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue(subDir)
    };
    const root = {
      getDirectoryHandle: vi.fn().mockResolvedValue(workDir)
    } as unknown as FileSystemDirectoryHandle;

    const store = new FileSystemDocumentStore(async () => root);

    await expect(store.read(path("/work/projects/notes.md"))).resolves.toEqual({
      content: "deep",
      version: "999"
    });

    expect((root as any).getDirectoryHandle).toHaveBeenCalledWith("work", { create: false });
    expect(workDir.getDirectoryHandle).toHaveBeenCalledWith("projects", { create: false });
    expect(subDir.getFileHandle).toHaveBeenCalledWith("notes.md");
  });

  it("writes nested file, creating intermediate directories", async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const fileHandle = {
      createWritable: vi.fn().mockResolvedValue(writable),
      getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(""), lastModified: 42 })
    };
    const subDir = {
      getFileHandle: vi.fn().mockResolvedValue(fileHandle)
    };
    const root = {
      getDirectoryHandle: vi.fn().mockResolvedValue(subDir)
    } as unknown as FileSystemDirectoryHandle;

    const store = new FileSystemDocumentStore(async () => root);

    await store.write(path("/work/notes.md"), "hello");

    expect((root as any).getDirectoryHandle).toHaveBeenCalledWith("work", { create: true });
    expect(subDir.getFileHandle).toHaveBeenCalledWith("notes.md", { create: true });
    expect(writable.write).toHaveBeenCalledWith({ type: "write", data: "hello" });
  });

  it("lists markdown files recursively across subdirectories", async () => {
    const nestedFileHandle = {
      kind: "file" as const,
      name: "deep.md",
      getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(""), lastModified: 1 })
    };
    const subDir: any = {
      kind: "directory" as const,
      name: "work",
      async *[Symbol.asyncIterator]() {
        yield ["deep.md", nestedFileHandle];
      }
    };
    const rootFileHandle = {
      kind: "file" as const,
      name: "top.md",
      getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(""), lastModified: 2 })
    };
    const rootDir: any = {
      async *[Symbol.asyncIterator]() {
        yield ["top.md", rootFileHandle];
        yield ["work", subDir];
      }
    };

    const store = new FileSystemDocumentStore(async () => rootDir as FileSystemDirectoryHandle);

    const entries = await store.ls();
    const paths = entries.map(e => e.filepath.toString()).sort();
    expect(paths).toEqual(["/top.md", "/work/deep.md"]);
  });

  it("rejects move when target filepath already exists", async () => {
    const directoryHandle = {
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (name === "source.md" && !options) {
          return { getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue("source"), lastModified: 200 }) };
        }
        if (name === "target.md" && !options) {
          return { getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue("target"), lastModified: 201 }) };
        }
        throw new Error("missing");
      })
    } as unknown as FileSystemDirectoryHandle;

    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.mv(path("/source.md"), path("/target.md"))).rejects.toBeInstanceOf(DocumentIdConflictError);
  });
});
