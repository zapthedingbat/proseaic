import { DocumentPath } from "../document-service";
import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store";
import { DocumentConcurrencyError, DocumentIdConflictError } from "../errors";

type FileSystemDirectoryHandleFactory = () => Promise<FileSystemDirectoryHandle>;

export class FileSystemDocumentStore implements IDocumentStore {
  namespace: string = "file-system";
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

  async read(filepath: DocumentPath): Promise<FileContent> {
    const directoryHandle = await this._getDirectoryHandle();
    const fileHandle = await directoryHandle.getFileHandle(filepath.filename);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return {
      content,
      version: this._getVersionFromFile(file)
    };
  }

  async write(filepath: DocumentPath, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const directoryHandle = await this._getDirectoryHandle();
    const fileHandle = await directoryHandle.getFileHandle(filepath.filename, { create: true });

    if (expectedVersion !== undefined) {
      const currentFile = await fileHandle.getFile();
      const currentVersion = this._getVersionFromFile(currentFile);
      if (currentVersion !== expectedVersion) {
        throw new DocumentConcurrencyError();
      }
    }

    const writable = await fileHandle.createWritable();
    const writeParams: WriteParams = { type: "write", data: content };
    await writable.write(writeParams);
    await writable.close();

    const updatedFile = await fileHandle.getFile();
    return this._getVersionFromFile(updatedFile);
  }

  async mv(fromFilepath: DocumentPath, toFilepath: DocumentPath): Promise<void> {
    if (fromFilepath.toString() === toFilepath.toString()) {
      return;
    }

    const directoryHandle = await this._getDirectoryHandle();
    try {
      const fileHandle = await directoryHandle.getFileHandle(fromFilepath.filename);
      const file = await fileHandle.getFile();
      const content = await file.text();

      const existingTarget = await directoryHandle.getFileHandle(toFilepath.filename).then(
        () => true,
        () => false
      );
      if (existingTarget) {
        throw new DocumentIdConflictError(toFilepath.toString());
      }

      const newFileHandle = await directoryHandle.getFileHandle(toFilepath.filename, { create: true });
      const writable = await newFileHandle.createWritable();
      const writeParams: WriteParams = { type: "write", data: content };
      await writable.write(writeParams);
      await writable.close();

      await directoryHandle.removeEntry(fromFilepath.filename);

      return;
    } catch (err) {
      if (err instanceof DocumentIdConflictError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to move file "${fromFilepath.toString()}" to "${toFilepath.toString()}": ${message}`, { cause: err });
    }
  }

  async rm(filepath: DocumentPath): Promise<void> {
    const directoryHandle = await this._getDirectoryHandle();
    await directoryHandle.removeEntry(filepath.filename);
  }

  async ls(): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    const directoryHandle = await this._getDirectoryHandle();
    const handles = directoryHandle as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [, entry] of handles) {
      if (entry.kind === "file" && entry.name.endsWith(".md")) {
        const file = await (entry as FileSystemFileHandle).getFile();
        files.push({
          filepath: DocumentPath.parse("/" + entry.name),
          version: this._getVersionFromFile(file)
        });
      }
    }
    return files;
  }
}
