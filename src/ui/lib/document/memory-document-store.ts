import { IDocumentStore } from "./document-manager";


export class MemoryDocumentStore implements IDocumentStore {
  namespace: string = "memory";
  private _documents: Map<string, { title: string; content: string; }>;
  constructor() {
    this._documents = new Map();
  }

  async createDocument(title: string): Promise<string> {
    const id = `doc-${Date.now()}`;
    this._documents.set(id, { title, content: "" });
    return id;
  }

  async readDocument(id: string): Promise<{ title: string; content: string; }> {
    const doc = this._documents.get(id);
    if (!doc) {
      throw new Error(`Document with id ${id} not found`);
    }
    return doc;
  }

  async updateDocument(id: string, content: string): Promise<void> {
    const doc = this._documents.get(id);
    if (!doc) {
      throw new Error(`Document with id ${id} not found`);
    }
    this._documents.set(id, { ...doc, content });
  }

  async deleteDocument(id: string): Promise<void> {
    this._documents.delete(id);
  }

  async listDocuments(): Promise<{ id: string; title: string; }[]> {
    return Array.from(this._documents.entries()).map(([id, { title }]) => ({ id, title }));
  }
}
