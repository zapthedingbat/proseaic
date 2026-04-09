const DEFAULT_HISTORY_LIMIT = 50;

export type DocumentHistoryEntry = {
  state: string;
  toolName: string;
  explanation: string;
  timestamp: number;
};

type HistoryOptions = {
  limit?: number;
  nowFn?: () => number;
};

export class DocumentHistoryCaretaker {
  private _history: DocumentHistoryEntry[];
  private _limit: number;

  constructor(history?: Partial<DocumentHistoryEntry>[] | null, options: HistoryOptions = {}) {
    this._history = (history || []).map(entry => ({
      state: entry.state || "",
      toolName: entry.toolName || "",
      explanation: entry.explanation || "",
      timestamp: entry.timestamp || (options.nowFn ? options.nowFn() : Date.now())
    }));
    this._limit = Math.max(1, options.limit || DEFAULT_HISTORY_LIMIT);
  }

  record(entry: DocumentHistoryEntry): boolean {
    this._history = [...this._history, {
      ...entry,
      state: entry.state || "",
    }].slice(-this._limit);
    return true;
  }

  revert(): DocumentHistoryEntry | null {
    const entry = this._history[this._history.length - 1];
    if (!entry) {
      return null;
    }
    this._history = this._history.slice(0, -1);
    return entry;
  }

  serialize(): DocumentHistoryEntry[] {
    return [...this._history];
  }
}