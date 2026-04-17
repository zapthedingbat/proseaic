import { describe, expect, it, vi } from "vitest";
import { FileSystemDocumentStore } from "../../../../src/ui/lib/document/file-system-document-store.js";

describe("FileSystemDocumentStore", () => {
  it("reads raw markdown content instead of parsing JSON", async () => {
    const getFile = vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue("# Notes\n\nHello")
    });
    const getFileHandle = vi.fn().mockResolvedValue({ getFile });
    const directoryHandle = { getFileHandle } as unknown as FileSystemDirectoryHandle;
    const store = new FileSystemDocumentStore(async () => directoryHandle);

    await expect(store.readDocument("notes")).resolves.toEqual({
      title: "notes",
      content: "# Notes\n\nHello"
    });

    expect(getFileHandle).toHaveBeenCalledWith("notes.md");
  });
});