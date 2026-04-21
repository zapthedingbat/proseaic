import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store";
import { DocumentConcurrencyError } from "../errors";

type FileSystemDirectoryHandleFactory = () => Promise<FileSystemDirectoryHandle>;

export class FileSystemDocumentStore implements IDocumentStore {
  namespace: string = "fileSystem";
  private _directoryHandleFactory: FileSystemDirectoryHandleFactory;
  
  constructor(directoryHandleFactory: FileSystemDirectoryHandleFactory) {
    this._directoryHandleFactory = directoryHandleFactory;
  }

  private _getVersionFromFile(file: File): FileVersionToken {
    const lastModified = String(file.lastModified);
    return lastModified as FileVersionToken;
  }

  private async _getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
    return this._directoryHandleFactory();
  }

  async read(filename: string): Promise<FileContent> {
    const directoryHandle = await this._getDirectoryHandle();
    const fileHandle = await directoryHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return {
      content,
      version: this._getVersionFromFile(file)
    };
  }

  async write(filename: string, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const directoryHandle = await this._getDirectoryHandle();
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });

    if (expectedVersion !== undefined) {
      const currentFile = await fileHandle.getFile();
      const currentVersion = this._getVersionFromFile(currentFile);
      if (currentVersion !== expectedVersion) {
        throw new DocumentConcurrencyError();
      }
    }

    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    const updatedFile = await fileHandle.getFile();
    return this._getVersionFromFile(updatedFile);
  }

  async mv(fromFilename: string, toFilename: string): Promise<void> {
    if (fromFilename === toFilename) {
      return;
    }

    const directoryHandle = await this._getDirectoryHandle();
    try {
      const fileHandle = await directoryHandle.getFileHandle(fromFilename);
      const file = await fileHandle.getFile();
      const content = await file.text();

      const existingTarget = await directoryHandle.getFileHandle(toFilename).then(
        () => true,
        () => false
      );
      if (existingTarget) {
        throw new Error("File already exists");
      }

      const newFileHandle = await directoryHandle.getFileHandle(toFilename, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      await directoryHandle.removeEntry(fromFilename);

      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to move file "${fromFilename}" to "${toFilename}": ${message}`);
    }
  }

  async rm(filename: string): Promise<void> {
    const directoryHandle = await this._getDirectoryHandle();
    await directoryHandle.removeEntry(filename);
  }

  async ls(): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    const directoryHandle = await this._getDirectoryHandle();
    const handles = directoryHandle as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [, entry] of handles) {
      if (entry.kind === "file" && entry.name.endsWith(".md")) {
        const file = await (entry as FileSystemFileHandle).getFile();
        files.push({
          filename: entry.name,
          version: this._getVersionFromFile(file)
        });
      }
    }
    return files;
  }
}
