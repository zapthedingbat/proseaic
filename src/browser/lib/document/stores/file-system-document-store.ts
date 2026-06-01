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

  private _splitPath(filepath: DocumentPath): { dirSegments: string[]; filename: string } {
    const segments = filepath.toString().split("/").filter(Boolean);
    const filename = segments.pop() ?? "";
    return { dirSegments: segments, filename };
  }

  private async _resolveDirectory(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = await this._directoryHandleFactory();
    for (const segment of segments) {
      try {
        dir = await dir.getDirectoryHandle(segment, { create });
      } catch {
        if (!create) return null;
        throw new Error(`Failed to access directory segment "${segment}"`);
      }
    }
    return dir;
  }

  private async _getFileHandle(filepath: DocumentPath, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const { dirSegments, filename } = this._splitPath(filepath);
    const dir = await this._resolveDirectory(dirSegments, options?.create === true);
    if (!dir) {
      throw new Error(`Directory not found for path "${filepath.toString()}"`);
    }
    return options ? dir.getFileHandle(filename, options) : dir.getFileHandle(filename);
  }

  async read(filepath: DocumentPath): Promise<FileContent> {
    const fileHandle = await this._getFileHandle(filepath);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return {
      content,
      version: this._getVersionFromFile(file)
    };
  }

  async write(filepath: DocumentPath, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const fileHandle = await this._getFileHandle(filepath, { create: true });

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

    try {
      const fromHandle = await this._getFileHandle(fromFilepath);
      const file = await fromHandle.getFile();
      const content = await file.text();

      const existingTarget = await this._getFileHandle(toFilepath).then(
        () => true,
        () => false
      );
      if (existingTarget) {
        throw new DocumentIdConflictError(toFilepath.toString());
      }

      const toHandle = await this._getFileHandle(toFilepath, { create: true });
      const writable = await toHandle.createWritable();
      const writeParams: WriteParams = { type: "write", data: content };
      await writable.write(writeParams);
      await writable.close();

      const { dirSegments: fromDirSegments, filename: fromFilename } = this._splitPath(fromFilepath);
      const fromDir = await this._resolveDirectory(fromDirSegments, false);
      if (fromDir) {
        await fromDir.removeEntry(fromFilename);
      }

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
    const { dirSegments, filename } = this._splitPath(filepath);
    const dir = await this._resolveDirectory(dirSegments, false);
    if (!dir) {
      throw new Error(`File not found: ${filepath.toString()}`);
    }
    await dir.removeEntry(filename);
  }

  async ls(): Promise<FileEntry[]> {
    const root = await this._directoryHandleFactory();
    const files: FileEntry[] = [];
    await this._collectMarkdownFiles(root, [], files);
    return files;
  }

  private async _collectMarkdownFiles(
    dir: FileSystemDirectoryHandle,
    pathSegments: string[],
    out: FileEntry[]
  ): Promise<void> {
    const handles = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [, entry] of handles) {
      if (entry.kind === "file" && entry.name.endsWith(".md")) {
        const file = await (entry as FileSystemFileHandle).getFile();
        const filepath = DocumentPath.parse("/" + [...pathSegments, entry.name].join("/"));
        out.push({ filepath, version: this._getVersionFromFile(file) });
      } else if (entry.kind === "directory") {
        await this._collectMarkdownFiles(
          entry as FileSystemDirectoryHandle,
          [...pathSegments, entry.name],
          out
        );
      }
    }
  }
}
