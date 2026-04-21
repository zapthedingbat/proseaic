import { FileContent, FileEntry, FileVersionToken, IDocumentStore } from "../document-store.ts";
import { DocumentConcurrencyError } from "../errors.ts";

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

  async read(filename: string): Promise<FileContent> {
    const response = await fetch(this._getUrl(filename), {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${filename}`);
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

  async write(filename: string, content: string, expectedVersion?: FileVersionToken): Promise<FileVersionToken> {
    const headers: Record<string, string> = {
      "Content-Type": "text/markdown"
    };

    if (expectedVersion) {
      headers["If-Match"] = `"${expectedVersion}"`;
    }

    const response = await fetch(this._getUrl(filename), {
      method: "PUT",
      headers,
      body: content,
      credentials: "include"
    });

    if (response.status === 412) {
      throw new DocumentConcurrencyError(
        `File "${filename}" has been modified since last read`
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

  async mv(fromFilename: string, toFilename: string): Promise<void> {
    if (fromFilename === toFilename) {
      return;
    }

    const destination = this._getUrl(toFilename);
    const response = await fetch(this._getUrl(fromFilename), {
      method: "MOVE",
      headers: {
        "Destination": destination
      },
      credentials: "include"
    });

    if (response.status === 412) {
      throw new Error(`Destination file already exists: ${toFilename}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to move file: ${response.statusText}`);
    }

    return;
  }

  async rm(filename: string): Promise<void> {
    const response = await fetch(this._getUrl(filename), {
      method: "DELETE",
      credentials: "include"
    });

    if (response.status === 404) {
      throw new Error(`File not found: ${filename}`);
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

    const files = await response.json();
    return files;
  }
}
