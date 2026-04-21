import { IDocumentStore } from "../document-store.ts";
import { DocumentConcurrencyError } from "../errors.ts";

export class MemoryDocumentStore implements IDocumentStore {
  namespace: string = "memory";
  private _documents: Map<string, { content: string; version: number; }>;
  constructor() {
    this._documents = new Map();
  }

  async read(filename: string): Promise<{ content: string; version: string; }> {
    const doc = this._documents.get(filename);
    if (!doc) {
      throw new Error(`File not found: ${filename}`);
    }
    return { content: doc.content, version: String(doc.version) };
  }

  async write(filename: string, content: string, expectedVersion?: string): Promise<string> {
    const existing = this._documents.get(filename) ?? { content: "", version: -1 };
    if (expectedVersion !== undefined && expectedVersion !== String(existing.version)) {
      throw new DocumentConcurrencyError();
    }

    const nextVersion = existing.version + 1;
    this._documents.set(filename, { content, version: nextVersion });
    return String(nextVersion);
  }

  async mv(fromFilename: string, toFilename: string): Promise<string> {
    if (fromFilename === toFilename) {
      return fromFilename;
    }

    const source = this._documents.get(fromFilename);
    if (!source) {
      throw new Error(`File not found: ${fromFilename}`);
    }
    if (this._documents.has(toFilename)) {
      throw new Error("File already exists");
    }

    this._documents.set(toFilename, source);
    this._documents.delete(fromFilename);
    return toFilename;
  }

  async rm(filename: string): Promise<void> {
    this._documents.delete(filename);
  }

  async ls(): Promise<{ filename: string; version: string; }[]> {
    return Array.from(this._documents.entries()).map(([filename, { version }]) => ({
      filename,
      version: String(version)
    }));
  }
}
