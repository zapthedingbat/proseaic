import { describe, expect, it } from "vitest";
import { createDocumentMemento, DocumentHistoryCaretaker, normalizeDocumentMementoHistory } from "./document-memento.js";

describe("DocumentHistoryCaretaker", () => {
  it("treats undo and redo as memento restoration", () => {
    const caretaker = new DocumentHistoryCaretaker();

    const before = createDocumentMemento("alpha beta");
    const after = createDocumentMemento("alpha gamma");

    const changed = caretaker.record({
      before,
      after,
      toolName: "replace_selection",
      explanation: "Updated the selected word.",
      timestamp: 1
    });

    expect(changed).toBe(true);
    expect(caretaker.canUndo).toBe(true);
    expect(caretaker.canRedo).toBe(false);

    expect(caretaker.undo()).toEqual(before);
    expect(caretaker.canUndo).toBe(false);
    expect(caretaker.canRedo).toBe(true);

    expect(caretaker.redo()).toEqual(after);
    expect(caretaker.canUndo).toBe(true);
    expect(caretaker.canRedo).toBe(false);
  });

  it("normalizes persisted history safely", () => {
    const persistedHistory = {
      undo: [
        {
          before: { content: "abc", selection: { start: 0, end: 99 } },
          after: { content: "abcd", selection: { start: -5, end: 2 } },
          toolName: "replace_document",
          explanation: "Expanded the document.",
          timestamp: 5
        }
      ]
    } as unknown;

    const normalized = normalizeDocumentMementoHistory(persistedHistory as any);

    expect(normalized.undo[0]?.before).toEqual({ content: "abc" });
    expect(normalized.undo[0]?.after).toEqual({ content: "abcd" });
    expect(normalized.redo).toEqual([]);
  });
});