export type DocumentIdString = string & { readonly __brand: unique symbol };
export type DocumentPathString = string & { readonly __brand: unique symbol };

const StoreRegex = /^[a-z0-9-]+$/;
const DocumentIdRegex = /^\/([^\/]+)(\/[^\/?]+)+$/;
const SEPARATOR = "/";

export class DocumentId {
  
  private constructor(
    private readonly value: DocumentIdString,
  ) {}
  
  static create(store: string, path: DocumentPath): DocumentId {
    const str = `${SEPARATOR}${store}${path}`;
    if (!this.isValidFormat(str)) {
      throw new Error(`Invalid document id format: ${str}`);
    }
    return new DocumentId(str);
  }

  static parse(value: DocumentIdString): DocumentId {
    if (!this.isValidFormat(value)) {
      throw new Error(`Invalid document id format: ${value}`);
    }
    return new DocumentId(value);
  }

  static isValidFormat(id: string): id is DocumentIdString {
    if(!id || typeof id !== "string") {
      return false;
    }
    const match = id.match(DocumentIdRegex);
    if (!match) {
      return false;
    }
    const store = match[1];
    return StoreRegex.test(store);
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }

  equals(other: DocumentId): boolean
  equals(other: string): boolean
  equals(other: DocumentId | string): boolean {
    return this.value === (other instanceof DocumentId ? other.value : other);
  }

  get path(): DocumentPath {
    const [, , path = ""] = this.value.match(DocumentIdRegex) || [];
    return DocumentPath.parse(path);
  }

  get store(): string {
    const match = this.value.match(DocumentIdRegex);
    if (!match) {
      throw new Error(`Invalid document id format: ${this.value}`);
    }
    return match[1];
  }
}

const DocumentPathRegex = /^(\/[^/?]+)+$/;

export class DocumentPath {

  private constructor(
    private readonly value: DocumentPathString,
  ) {
  }

  private static createFromString(str: string): DocumentPath {
    if (!this.isValidFormat(str)) {
      throw new Error(`Invalid document path format: ${str}`);
    }
    return new DocumentPath(str);
  }


  private static _normalize(str: string): DocumentPath {
    const segments = str.split(SEPARATOR);
    const normalizedSegments: string[] = [];
    for (const segment of segments) {
      if (segment === "" || segment === ".") {
        continue;
      }
      if (segment === "..") {
        if (normalizedSegments.length > 0) {
          normalizedSegments.pop();
        }
        continue;
      }
      normalizedSegments.push(segment);
    }

    const pathString = SEPARATOR + normalizedSegments.join(SEPARATOR);
    if (!this.isValidFormat(pathString)) {
      throw new Error(`Invalid document path format: ${str}`);
    }
    return new DocumentPath(pathString);
  }

  static readonly sep = SEPARATOR;

  static isValidFormat(path: string): path is DocumentPathString {
    return typeof path === "string" && DocumentPathRegex.test(path);
  }
  
  static parse(str: string): DocumentPath {
    if (!this.isValidFormat(str)) {
      throw new Error(`Invalid document path format: ${str}`);
    }
    return this._normalize(str);
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }

  equals(other: DocumentPath): boolean
  equals(other: string): boolean
  equals(other: DocumentPath | string): boolean {
    return this.value === (other instanceof DocumentPath ? other.value : other);
  }
  
  withSuffixName(suffix: string): DocumentPath {
    const dotIndex = this.filename.lastIndexOf(".");
    if (dotIndex === -1) {
      return DocumentPath.createFromString(`${this.value}${suffix}`);
    }
    return DocumentPath.createFromString(`${this.base}${this.sep}${this.name}${suffix}${this.ext}`);
  }

  createDocumentId(store: string): DocumentId {
    return DocumentId.create(store, this);
  }

  get filename(): string {
    const segments = this.value.split(this.sep);
    return segments[segments.length - 1] || "";
  }

  get sep(): string {
    return SEPARATOR;
  }

  get base(): string {
    const segments = this.value.split(this.sep);
    return segments.slice(0, -1).join(this.sep);
  }

  get ext(): string {
    const filename = this.filename;
    const dotIndex = filename.lastIndexOf("."); 
    if (dotIndex === -1) {
      return "";
    }
    return filename.substring(dotIndex);
  }

  get name(): string {
    const filename = this.filename;
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex === -1) {
      return filename;
    }
    return filename.substring(0, dotIndex);
  }
}

export interface IDocumentService {
  documentPathFromString(str: string): DocumentPath;
  documentIdFromPath(candidatePath: DocumentPath): DocumentId;
  createDocument(filepath: DocumentPath): Promise<DocumentId>;
  deleteDocument(id: DocumentId): Promise<void>;
  getStoreNamespaces(): string[];
  listDocuments(): Promise<DocumentId[]>;
  readDocument(id: DocumentId): Promise<string>;
  renameDocument(id: DocumentId, toFilepath: DocumentPath): Promise<DocumentId>;
  updateDocument(id: DocumentId, content: string): Promise<void>;
}