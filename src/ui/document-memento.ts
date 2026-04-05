const DEFAULT_HISTORY_LIMIT = 50;

export type DocumentMemento = {
  content: string;
};

export type DocumentMementoEntry = {
  before: DocumentMemento;
  after: DocumentMemento;
  toolName: string;
  explanation: string;
  timestamp: number;
};

export type DocumentMementoHistory = {
  undo: DocumentMementoEntry[];
  redo: DocumentMementoEntry[];
};

type HistoryOptions = {
  limit?: number;
  nowFn?: () => number;
};

export function createDocumentMemento(content: string): DocumentMemento {
  const normalizedContent = typeof content === "string" ? content : "";
  return {
    content: normalizedContent
  };
}

function normalizeEntry(
  entry: Partial<DocumentMementoEntry> | null | undefined,
  nowFn: () => number
): DocumentMementoEntry | null {
  if (!entry) {
    return null;
  }

  if (typeof entry.before?.content !== "string" || typeof entry.after?.content !== "string") {
    return null;
  }

  return {
    before: createDocumentMemento(entry.before.content),
    after: createDocumentMemento(entry.after.content),
    toolName: typeof entry.toolName === "string" ? entry.toolName : "",
    explanation: typeof entry.explanation === "string" ? entry.explanation : "",
    timestamp: typeof entry.timestamp === "number" ? entry.timestamp : nowFn()
  };
}

export function normalizeDocumentMementoHistory(
  history: Partial<DocumentMementoHistory> | null | undefined,
  nowFn: () => number = Date.now
): DocumentMementoHistory {
  return {
    undo: Array.isArray(history?.undo)
      ? history.undo
        .map((entry) => normalizeEntry(entry, nowFn))
        .filter((entry): entry is DocumentMementoEntry => Boolean(entry))
      : [],
    redo: Array.isArray(history?.redo)
      ? history.redo
        .map((entry) => normalizeEntry(entry, nowFn))
        .filter((entry): entry is DocumentMementoEntry => Boolean(entry))
      : []
  };
}

export class DocumentHistoryCaretaker {
  private _history: DocumentMementoHistory;
  private _limit: number;

  constructor(history?: Partial<DocumentMementoHistory> | null, options: HistoryOptions = {}) {
    this._history = normalizeDocumentMementoHistory(history, options.nowFn || Date.now);
    this._limit = Math.max(1, options.limit || DEFAULT_HISTORY_LIMIT);
  }

  get canUndo(): boolean {
    return this._history.undo.length > 0;
  }

  get canRedo(): boolean {
    return this._history.redo.length > 0;
  }

  record(entry: DocumentMementoEntry): boolean {
    const before = createDocumentMemento(entry.before.content);
    const after = createDocumentMemento(entry.after.content);

    if (before.content === after.content) {
      return false;
    }

    this._history.undo = [...this._history.undo, {
      ...entry,
      before,
      after
    }].slice(-this._limit);
    this._history.redo = [];
    return true;
  }

  undo(): DocumentMemento | null {
    if (!this.canUndo) {
      return null;
    }

    const entry = this._history.undo[this._history.undo.length - 1];
    this._history.undo = this._history.undo.slice(0, -1);
    this._history.redo = [...this._history.redo, entry].slice(-this._limit);
    return entry.before;
  }

  redo(): DocumentMemento | null {
    if (!this.canRedo) {
      return null;
    }

    const entry = this._history.redo[this._history.redo.length - 1];
    this._history.redo = this._history.redo.slice(0, -1);
    this._history.undo = [...this._history.undo, entry].slice(-this._limit);
    return entry.after;
  }

  serialize(): DocumentMementoHistory {
    return {
      undo: [...this._history.undo],
      redo: [...this._history.redo]
    };
  }
}