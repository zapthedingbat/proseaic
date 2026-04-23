import { DocumentPath } from "../document-service.ts";
import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store.ts";
import { DocumentConcurrencyError, DocumentIdConflictError } from "../errors.ts";

export class WebDavDocumentStore implements IDocumentStore {
  namespace: string = "webdav";
  private _baseUrl: string;

  constructor(baseUrl: string) {
    this._baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  private _toFileVersionToken(etag: string): FileVersionToken {
    return etag.slice(1, -1) as FileVersionToken;
  }

  private _getUrl(filename: string): string {
    const encoded = filename
      .split("/")
      .map(part => encodeURIComponent(part))
      .join("/");
    return `${this._baseUrl}/store/${encoded}`;
  }

  async read(filepath: DocumentPath): Promise<FileContent> {
    const response = await fetch(this._getUrl(filepath.toString()), {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${filepath.toString()}`);
      }
      throw new Error(`Failed to read file: ${response.statusText}`);
    }

    const content = await response.text();
    const etag = response.headers.get("ETag");
    if (!etag) {
      throw new Error("No ETag in response");
    }

    return {
      content,
      version: this._toFileVersionToken(etag)
    };
  }

  async write(filepath: DocumentPath, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const headers: Record<string, string> = {
      "Content-Type": "text/markdown"
    };

    if (expectedVersion) {
      headers["If-Match"] = `"${expectedVersion}"`;
    }

    const response = await fetch(this._getUrl(filepath.toString()), {
      method: "PUT",
      headers,
      body: content,
      credentials: "include"
    });

    if (response.status === 412) {
      throw new DocumentConcurrencyError(
        `File "${filepath.toString()}" has been modified since last read`
      );
    }

    if (!response.ok) {
      throw new Error(`Failed to write file: ${response.statusText}`);
    }

    const etag = response.headers.get("ETag");
    if (!etag) {
      throw new Error("No ETag in response");
    }

    return this._toFileVersionToken(etag);
  }

  async mv(fromFilepath: DocumentPath, toFilepath: DocumentPath): Promise<void> {
    if (fromFilepath.toString() === toFilepath.toString()) {
      return;
    }

    const destination = this._getUrl(toFilepath.toString());
    const response = await fetch(this._getUrl(fromFilepath.toString()), {
      method: "MOVE",
      headers: {
        "Destination": destination
      },
      credentials: "include"
    });

    if (response.status === 412) {
      throw new DocumentIdConflictError(toFilepath.toString());
    }

    if (!response.ok) {
      throw new Error(`Failed to move file: ${response.statusText}`);
    }

    return;
  }

  async rm(filepath: DocumentPath): Promise<void> {
    const response = await fetch(this._getUrl(filepath.toString()), {
      method: "DELETE",
      credentials: "include"
    });

    if (response.status === 404) {
      throw new Error(`File not found: ${filepath.toString()}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to delete file: ${response.statusText}`);
    }
  }

  async ls(): Promise<FileEntry[]> {
    const response = await fetch(`${this._baseUrl}/store/`, {
      method: "PROPFIND",
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }

    // We expect the response to be a JSON array of objects with "filename" and "version" properties
    const result = await response.json();
    if(!Array.isArray(result)) {
      throw new Error("Invalid response format for file listing");
    }

    const files = result.map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error("Invalid file entry format");
      }

      const jsonEntry = entry as { filename?: unknown; version?: unknown };

      if (typeof jsonEntry.filename !== "string" || typeof jsonEntry.version !== "string") {
        throw new Error("File entry missing required properties");
      }

      const filepath = DocumentPath.parse(jsonEntry.filename.startsWith("/") ? jsonEntry.filename : `/${jsonEntry.filename}`);

      return {
        filepath: filepath,
        version: this._toFileVersionToken(jsonEntry.version)
      } as FileEntry;
    });

    return files;
  }
}
