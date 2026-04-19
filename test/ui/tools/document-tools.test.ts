import { describe, expect, it, vi } from "vitest";
import { CreateDocumentTool } from "../../../src/ui/tools/create-document.js";
import { ListDocumentsTool } from "../../../src/ui/tools/list-documents.js";
import { OpenDocumentTool } from "../../../src/ui/tools/open-document.js";
import { RenameDocumentTool } from "../../../src/ui/tools/rename-document.js";
import { IDocumentToolContext } from "../../../src/ui/tools/document-tool-context.js";

const loggerFactory = () => ({
  trace: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

describe("document tools", () => {
  it("creates a document and reports it as active", async () => {
    const context: IDocumentToolContext = {
      getActiveDocumentId: () => "localStorage/doc-1",
      getStoreNamespaces: () => ["localStorage", "fileSystem"],
      listDocuments: vi.fn(),
      createDocument: vi.fn().mockResolvedValue({ id: "localStorage/doc-1", title: "Project brief" }),
      renameDocument: vi.fn(),
      openDocument: vi.fn()
    };

    const tool = new CreateDocumentTool(loggerFactory, context);

    await expect(tool.execute({ title: "Project brief" })).resolves.toEqual({
      document: { id: "localStorage/doc-1", title: "Project brief" },
      active_document_id: "localStorage/doc-1"
    });

    expect(context.createDocument).toHaveBeenCalledWith("Project brief", undefined);
    expect(tool.addContext?.()).toEqual({
      document_management: {
        active_document_id: "localStorage/doc-1",
        available_stores: ["localStorage", "fileSystem"]
      }
    });
  });

  it("lists documents with the active marker", async () => {
    const context: IDocumentToolContext = {
      getActiveDocumentId: () => "localStorage/doc-2",
      getStoreNamespaces: () => ["localStorage"],
      listDocuments: vi.fn().mockResolvedValue([
        { id: "localStorage/doc-1", title: "Alpha" },
        { id: "localStorage/doc-2", title: "Beta" }
      ]),
      createDocument: vi.fn(),
      renameDocument: vi.fn(),
      openDocument: vi.fn()
    };

    const tool = new ListDocumentsTool(loggerFactory, context);

    await expect(tool.execute({})).resolves.toEqual({
      active_document_id: "localStorage/doc-2",
      documents: [
        { id: "localStorage/doc-1", title: "Alpha", is_active: false },
        { id: "localStorage/doc-2", title: "Beta", is_active: true }
      ]
    });
  });

  it("opens a document and returns its content", async () => {
    const context: IDocumentToolContext = {
      getActiveDocumentId: () => null,
      getStoreNamespaces: () => ["localStorage"],
      listDocuments: vi.fn(),
      createDocument: vi.fn(),
      renameDocument: vi.fn(),
      openDocument: vi.fn().mockResolvedValue({
        id: "localStorage/doc-3",
        title: "Plan",
        content: "# Plan"
      })
    };

    const tool = new OpenDocumentTool(loggerFactory, context);

    await expect(tool.execute({ id: "localStorage/doc-3" })).resolves.toEqual({
      document: {
        id: "localStorage/doc-3",
        title: "Plan",
        content: "# Plan"
      },
      active_document_id: "localStorage/doc-3"
    });

    expect(context.openDocument).toHaveBeenCalledWith("localStorage/doc-3");
  });

  it("renames a document", async () => {
    const context: IDocumentToolContext = {
      getActiveDocumentId: () => null,
      getStoreNamespaces: () => ["localStorage"],
      listDocuments: vi.fn(),
      createDocument: vi.fn(),
      renameDocument: vi.fn().mockResolvedValue("localStorage/renamed-doc"),
      openDocument: vi.fn()
    };

    const tool = new RenameDocumentTool(loggerFactory, context);

    await expect(tool.execute({ id: "localStorage/doc-4", title: "Renamed" })).resolves.toEqual({
      id: "localStorage/renamed-doc",
      title: "Renamed"
    });

    expect(context.renameDocument).toHaveBeenCalledWith("localStorage/doc-4", "Renamed");
  });
});