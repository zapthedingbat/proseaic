import { describe, expect, it, vi } from "vitest";
import { CreateDocumentTool } from "../../../src/browser/tools/create-document.js";
import { ListDocumentsTool } from "../../../src/browser/tools/list-documents.js";
import { OpenDocumentTool } from "../../../src/browser/tools/open-document.js";
import { RenameDocumentTool } from "../../../src/browser/tools/rename-document.js";
import { DocumentId, DocumentPath } from "../../../src/browser/lib/document/document-service.js";
import { IWorkbench } from "../../../src/browser/lib/workbench.js";

const loggerFactory = () => ({
  trace: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

function makeWorkbench(overrides: Partial<IWorkbench> = {}): IWorkbench {
  return {
    closeDocument: vi.fn(),
    closeFocusedTab: vi.fn(),
    createDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getFocusedDocumentId: vi.fn(() => null),
    getFocusedEditor: vi.fn(() => null),
    listOpenDocuments: vi.fn(() => []),
    mount: vi.fn(),
    openDocument: vi.fn(),
    renameDocument: vi.fn(),
    saveFocusedDocument: vi.fn(),
    saveFocusedDocumentAs: vi.fn(),
    ...overrides,
  } as unknown as IWorkbench;
}

describe("document tools", () => {
  it("creates a document and returns its id", async () => {
    const newId = DocumentId.create("local", DocumentPath.parse("/project-brief"));
    const workspace = makeWorkbench({
      createDocument: vi.fn().mockResolvedValue(newId),
    });

    const tool = new CreateDocumentTool(loggerFactory, workspace);

    await expect(tool.execute({ filename: "/project-brief" })).resolves.toEqual({
      new_document_id: newId.toString(),
      next_step: "Document created and open. Call read_document_outline then insert_document_section to write content into it."
    });

    expect(workspace.createDocument).toHaveBeenCalled();
  });

  it("normalizes plain names from the model", async () => {
    const workspace = makeWorkbench({
      createDocument: vi.fn().mockResolvedValue(
        DocumentId.create("local", DocumentPath.parse("/Technical Architecture.md"))
      ),
    });

    const tool = new CreateDocumentTool(loggerFactory, workspace);

    // Model passes a human-readable name without leading slash or extension
    const result = await tool.execute({ filename: "Technical Architecture" }) as any;
    expect(result.new_document_id).toBeDefined();

    const [calledPath] = (workspace.createDocument as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledPath.toString()).toBe("/Technical Architecture.md");
  });

  it("lists documents with focused_document_id in context", async () => {
    const focusedId = DocumentId.create("local", DocumentPath.parse("/beta"));
    const workspace = makeWorkbench({
      getFocusedDocumentId: vi.fn(() => focusedId),
      listOpenDocuments: vi.fn(() => [{ id: focusedId, isDirty: false }]),
    });

    const documentService = {
      listDocuments: vi.fn().mockResolvedValue([
        DocumentId.create("local", DocumentPath.parse("/alpha")),
        focusedId,
      ]),
      readDocument: vi.fn(),
      createDocument: vi.fn(),
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      renameDocument: vi.fn(),
      documentPathFromString: vi.fn(),
      documentIdFromPath: vi.fn(),
    };

    const tool = new ListDocumentsTool(loggerFactory, documentService as any, workspace);

    const result = await tool.execute({});
    expect(result).toMatchObject({
      document_management: {
        documents: expect.arrayContaining([focusedId.toString()])
      }
    });

    const context = tool.addContext();
    expect(context).toEqual({
      document_management: {
        focused_document_id: focusedId.toString(),
        open_documents: [{ id: focusedId.toString(), has_unsaved_changes: false }]
      }
    });
  });

  it("opens a document by id", async () => {
    const workspace = makeWorkbench({
      openDocument: vi.fn().mockResolvedValue(undefined),
    });

    const tool = new OpenDocumentTool(loggerFactory, workspace);

    const id = DocumentId.create("local", DocumentPath.parse("/plan")).toString();
    await expect(tool.execute({ id })).resolves.toEqual({});
    expect(workspace.openDocument).toHaveBeenCalled();
  });

  it("rejects an invalid document id in open_document", async () => {
    const workspace = makeWorkbench();
    const tool = new OpenDocumentTool(loggerFactory, workspace);

    await expect(tool.execute({ id: "not-a-valid-id" })).rejects.toThrow();
  });

  it("renames a document", async () => {
    const workspace = makeWorkbench({
      renameDocument: vi.fn().mockResolvedValue(undefined),
    });

    const tool = new RenameDocumentTool(loggerFactory, workspace);

    const fromId = DocumentId.create("local", DocumentPath.parse("/old-name")).toString();
    await expect(tool.execute({ fromId, toFilepath: "/new-name" })).resolves.toEqual({});
    expect(workspace.renameDocument).toHaveBeenCalled();
  });
});
