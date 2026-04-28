import { describe, expect, it, vi } from "vitest";
import { InsertDocumentSectionTool } from "../../../src/browser/tools/insert-document-section.js";
import { ReplaceDocumentSectionTool } from "../../../src/browser/tools/replace-document-section.js";
import { RemoveDocumentSectionTool } from "../../../src/browser/tools/remove-document-section.js";
import { MoveDocumentSectionTool } from "../../../src/browser/tools/move-document-section.js";
import { ReadDocumentOutlineTool } from "../../../src/browser/tools/read-document-outline.js";
import { ReadDocumentSectionTool } from "../../../src/browser/tools/read-document-section.js";
import { ReplaceSelectionTool } from "../../../src/browser/tools/replace-selection.js";
import { TaskCompleteTool } from "../../../src/browser/tools/task-complete.js";
import { IStructuredDocument } from "../../../src/browser/lib/document/structured-document.js";
import { IEditableText } from "../../../src/browser/lib/document/editable-text.js";

const loggerFactory = () => ({
  trace: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

function makeDoc(overrides: Partial<IStructuredDocument> = {}): IStructuredDocument {
  return {
    insertSection: vi.fn(),
    moveSection: vi.fn(),
    removeSection: vi.fn(),
    replaceSection: vi.fn(),
    getSectionContent: vi.fn(() => ""),
    getOutline: vi.fn(() => []),
    ...overrides,
  };
}

function makeEditor(overrides: Partial<IEditableText> = {}): IEditableText {
  return {
    replaceSelection: vi.fn(),
    getContent: vi.fn(() => ""),
    setContent: vi.fn(),
    ...overrides,
  };
}

describe("insert_document_section", () => {
  it("calls insertSection with title and content", async () => {
    const doc = makeDoc();
    const tool = new InsertDocumentSectionTool(loggerFactory, () => doc);

    await tool.execute({ section_title: "Introduction", section_content: "Hello world" });

    expect(doc.insertSection).toHaveBeenCalledWith("Introduction", "Hello world", undefined);
  });

  it("passes insert_before_section_id when provided", async () => {
    const doc = makeDoc();
    const tool = new InsertDocumentSectionTool(loggerFactory, () => doc);

    await tool.execute({ section_title: "Chapter", section_content: "Body", insert_before_section_id: "s2" });

    expect(doc.insertSection).toHaveBeenCalledWith("Chapter", "Body", "s2");
  });

  it("throws when no document is focused", async () => {
    const tool = new InsertDocumentSectionTool(loggerFactory, () => null);

    await expect(tool.execute({ section_title: "T", section_content: "C" }))
      .rejects.toThrow("No focused editor is available.");
  });
});

describe("replace_document_section", () => {
  it("calls replaceSection with id and content", async () => {
    const doc = makeDoc();
    const tool = new ReplaceDocumentSectionTool(loggerFactory, () => doc);

    await tool.execute({ section_id: "s1", section_content: "New content" });

    expect(doc.replaceSection).toHaveBeenCalledWith("s1", "New content");
  });

  it("throws when no document is focused", async () => {
    const tool = new ReplaceDocumentSectionTool(loggerFactory, () => null);

    await expect(tool.execute({ section_id: "s1", section_content: "x" }))
      .rejects.toThrow("No focused editor is available.");
  });
});

describe("remove_document_section", () => {
  it("calls removeSection and returns removed: true", async () => {
    const doc = makeDoc();
    const tool = new RemoveDocumentSectionTool(loggerFactory, () => doc);

    const result = await tool.execute({ section_id: "s3" });

    expect(doc.removeSection).toHaveBeenCalledWith("s3");
    expect(result).toEqual({ section_id: "s3", removed: true });
  });

  it("throws when no document is focused", async () => {
    const tool = new RemoveDocumentSectionTool(loggerFactory, () => null);

    await expect(tool.execute({ section_id: "s3" }))
      .rejects.toThrow("No focused editor is available.");
  });
});

describe("move_document_section", () => {
  it("calls moveSection and returns moved: true", async () => {
    const doc = makeDoc();
    const tool = new MoveDocumentSectionTool(loggerFactory, () => doc);

    const result = await tool.execute({ section_id: "s2" });

    expect(doc.moveSection).toHaveBeenCalledWith("s2", undefined);
    expect(result).toEqual({ section_id: "s2", moved: true });
  });

  it("includes inserted_before when provided", async () => {
    const doc = makeDoc();
    const tool = new MoveDocumentSectionTool(loggerFactory, () => doc);

    const result = await tool.execute({ section_id: "s2", insert_before_section_id: "s1" });

    expect(doc.moveSection).toHaveBeenCalledWith("s2", "s1");
    expect(result).toEqual({ section_id: "s2", moved: true, inserted_before: "s1" });
  });

  it("throws when no document is focused", async () => {
    const tool = new MoveDocumentSectionTool(loggerFactory, () => null);

    await expect(tool.execute({ section_id: "s1" }))
      .rejects.toThrow("No focused editor is available.");
  });
});

describe("read_document_outline", () => {
  it("returns the outline from getOutline()", async () => {
    const outline = [{ id: "s1", title: "Intro", level: 1, children: [] }];
    const doc = makeDoc({ getOutline: vi.fn(() => outline as never) });
    const tool = new ReadDocumentOutlineTool(loggerFactory, () => doc);

    const result = await tool.execute({});

    expect(result).toEqual({ outline });
    expect(doc.getOutline).toHaveBeenCalled();
  });

  it("throws when no document is focused", async () => {
    const tool = new ReadDocumentOutlineTool(loggerFactory, () => null);

    await expect(tool.execute({})).rejects.toThrow("No focused editor is available.");
  });
});

describe("read_document_section", () => {
  it("returns section content by id", async () => {
    const doc = makeDoc({ getSectionContent: vi.fn(() => "## Overview\nText here.") });
    const tool = new ReadDocumentSectionTool(loggerFactory, () => doc);

    const result = await tool.execute({ section_id: "s1" });

    expect(result).toEqual({ section: "## Overview\nText here." });
    expect(doc.getSectionContent).toHaveBeenCalledWith("s1");
  });

  it("throws when no document is focused", async () => {
    const tool = new ReadDocumentSectionTool(loggerFactory, () => null);

    await expect(tool.execute({ section_id: "s1" }))
      .rejects.toThrow("No focused editor is available.");
  });
});

describe("replace_selection", () => {
  it("calls replaceSelection on the editor", async () => {
    const editor = makeEditor();
    const tool = new ReplaceSelectionTool(loggerFactory, () => editor);

    const result = await tool.execute({ text: "replacement text" });

    expect(editor.replaceSelection).toHaveBeenCalledWith("replacement text");
    expect(result).toEqual({});
  });

  it("throws when no editor is focused", async () => {
    const tool = new ReplaceSelectionTool(loggerFactory, () => null);

    await expect(tool.execute({ text: "x" }))
      .rejects.toThrow("No focused editor is available.");
  });
});

describe("task_complete", () => {
  it("returns the summary", async () => {
    const tool = new TaskCompleteTool(loggerFactory);

    const result = await tool.execute({ summary: "All done" });

    expect(result).toEqual({ summary: "All done" });
  });

  it("returns undefined summary when not provided", async () => {
    const tool = new TaskCompleteTool(loggerFactory);

    const result = await tool.execute({});

    expect(result).toEqual({ summary: undefined });
  });
});
