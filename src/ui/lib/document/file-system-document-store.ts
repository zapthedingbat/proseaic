import { IDocumentStore } from "./document-manager";

type FileSystemDirectoryHandleFactory = () => Promise<FileSystemDirectoryHandle>;

export class FileSystemDocumentStore implements IDocumentStore {
  namespace: string = "fileSystem";
  private _directoryHandleFactory: FileSystemDirectoryHandleFactory;
  constructor(directoryHandleFactory: FileSystemDirectoryHandleFactory) {
    this._directoryHandleFactory = directoryHandleFactory;
  }

  private async _getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
    return this._directoryHandleFactory();
  }

  async createDocument(title: string, content?: string): Promise<string> {
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 20);
    const id = safeTitle;
    const directoryHandle = await this._getDirectoryHandle();
    const fileHandle = await directoryHandle.getFileHandle(`${id}.md`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content || "");
    await writable.close();
    return id;
  }

  async readDocument(id: string): Promise<{ title: string; content: string; }> {
    const directoryHandle = await this._getDirectoryHandle();
    const fileHandle = await directoryHandle.getFileHandle(`${id}.md`);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return {
      title: id,
      content
    };
  }

  async updateDocument(id: string, content: string): Promise<void> {
    const directoryHandle = await this._getDirectoryHandle();
    const fileHandle = await directoryHandle.getFileHandle(`${id}.md`);
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async renameDocument(_id: string, _title: string): Promise<void> {
    // File system documents use the filename as their identity; renaming is not supported.
    throw new Error("Renaming is not supported by the file system document store.");
  }

  async deleteDocument(id: string): Promise<void> {
    const directoryHandle = await this._getDirectoryHandle();
    await directoryHandle.removeEntry(`${id}.md`);
  }

  async listDocuments(): Promise<{ id: string; title: string; }[]> {
    const docs: { id: string; title: string; }[] = [];
    const directoryHandle = await this._getDirectoryHandle();
    const handles = directoryHandle as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [, entry] of handles) {
      if (entry.kind === "file" && entry.name.endsWith(".md")) {
        const id = entry.name.slice(0, -5);
        docs.push({ id, title: id });
      }
    }
    return docs;
  }
}
