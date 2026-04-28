import { describe, it, expect, vi, beforeEach } from "vitest";
import { Workbench } from "../../../src/browser/lib/workbench";
import { DocumentId, DocumentPath } from "../../../src/browser/lib/document/document-service";
import type { IDocumentStateService } from "../../../src/browser/lib/document/document-state-service";
import type { IDocumentService } from "../../../src/browser/lib/document/document-service";
import type { IUserInteraction } from "../../../src/browser/lib/ui/user-interaction";
import type { IInlineCompletionService } from "../../../src/browser/lib/completion/inline-completion-service";

// ---------------------------------------------------------------------------
// Minimal mocks
// ---------------------------------------------------------------------------

function makeDocumentId(idStr: string): DocumentId {
  return DocumentId.parse(idStr as any);
}

function makeUi(overrides: Partial<IUserInteraction> = {}): IUserInteraction {
  return {
    alert: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(true),
    prompt: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeDocumentService(): IDocumentService {
  return {
    documentPathFromString: vi.fn(),
    documentIdFromPath: vi.fn(),
    createDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getStoreNamespaces: vi.fn().mockReturnValue([]),
    listDocuments: vi.fn().mockResolvedValue([]),
    readDocument: vi.fn().mockResolvedValue(""),
    renameDocument: vi.fn(),
    updateDocument: vi.fn(),
  };
}

function makeDocumentStateService(
  overrides: Partial<IDocumentStateService> = {}
): IDocumentStateService {
  return {
    getDirtyDocumentIds: vi.fn().mockReturnValue([]),
    isDocumentDirty: vi.fn().mockReturnValue(false),
    setDocumentDraft: vi.fn(),
    discardUnsavedDocumentChanges: vi.fn(),
    ...overrides,
  };
}

function makeInlineCompletionService(): IInlineCompletionService {
  return {
    getCompletion: vi.fn(),
  } as unknown as IInlineCompletionService;
}

// Returns a plain object editor — safe to use when _getEditorForPane is not exercised.
function makeEditorComponentFactory() {
  return vi.fn().mockResolvedValue({
    setContent: vi.fn(),
    getContent: vi.fn().mockReturnValue(""),
    getOutline: vi.fn().mockReturnValue([]),
    addEventListener: vi.fn(),
    appendChild: vi.fn(),
  });
}

// Returns an editor that is a real HTMLElement (Node), required when the code
// calls pane.canvasElement.appendChild(editor) in jsdom.
function makeEditorNode() {
  const el = document.createElement("div");
  (el as any).setContent = vi.fn();
  (el as any).getContent = vi.fn().mockReturnValue("");
  (el as any).getOutline = vi.fn().mockReturnValue([]);
  return el;
}

function makeEditorNodeFactory() {
  const editor = makeEditorNode();
  return { factory: vi.fn().mockResolvedValue(editor), editor };
}

// ---------------------------------------------------------------------------
// Helpers to inject internal state without calling mount()
// ---------------------------------------------------------------------------

/**
 * Seeds the workbench private fields so that a document is "open" in a tab
 * without going through the full mount + openDocument flow, which would
 * require real custom-element infrastructure.
 */
function seedOpenDocument(
  workbench: Workbench,
  documentId: DocumentId,
  tabId: string
): void {
  const wb = workbench as any;

  // Minimal editor group (pane) with a single tab already active.
  const canvasElement = document.createElement("div");
  const tab = { id: tabId, title: documentId.path.filename };
  const pane = { canvasElement, tabs: [tab], activeTabId: tab };

  wb._editorGroups = [pane];
  wb._openDocuments = [{ documentId, tabId }];
  wb._focusedTab = tabId;
}

// Seeds an empty editor group (no open documents) for testing openDocument().
function seedEditorGroup(workbench: Workbench): HTMLDivElement {
  const wb = workbench as any;
  const canvasElement = document.createElement("div");
  wb._editorGroups = [{ canvasElement, tabs: [], activeTabId: null }];
  return canvasElement;
}

// Seeds both the open document state AND a pre-existing editor in the WeakMap,
// so saveFocusedDocument can retrieve it without triggering the factory again.
function seedOpenDocumentWithEditor(
  workbench: Workbench,
  documentId: DocumentId,
  tabId: string,
) {
  seedOpenDocument(workbench, documentId, tabId);
  const wb = workbench as any;
  const pane = wb._editorGroups[0];
  const editor = makeEditorNode();
  wb._editors.set(pane, editor);
  return editor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Workbench.closeTab – dirty document discard", () => {
  const DOCUMENT_ID_STR = "/store/notes.md";
  const TAB_ID = `tab-${DOCUMENT_ID_STR}`;

  let documentId: DocumentId;
  let ui: IUserInteraction;
  let documentService: IDocumentService;
  let documentStateService: IDocumentStateService;
  let workbench: Workbench;

  beforeEach(() => {
    documentId = makeDocumentId(DOCUMENT_ID_STR);

    ui = makeUi({
      // User always confirms the "discard changes" dialog.
      confirm: vi.fn().mockResolvedValue(true),
    });

    documentService = makeDocumentService();

    documentStateService = makeDocumentStateService({
      // The document is dirty.
      isDocumentDirty: vi.fn().mockReturnValue(true),
    });

    workbench = new Workbench(
      ui,
      // componentFactory – not used because we bypass mount()
      null as any,
      documentService,
      documentStateService,
      makeInlineCompletionService(),
      makeEditorComponentFactory()
    );

    // Directly seed internal state so the workbench believes a dirty document
    // is open in a tab, without requiring a real DOM or custom-element registry.
    seedOpenDocument(workbench, documentId, TAB_ID);
  });

  it("calls discardUnsavedDocumentChanges when the user confirms closing a dirty tab", async () => {
    // Act: close the document (which internally calls the private closeTab).
    await workbench.closeDocument(documentId);

    // Assert: the user was shown the confirmation dialog …
    expect(ui.confirm).toHaveBeenCalledOnce();

    // … and the draft should be discarded from the document state service.
    expect(documentStateService.discardUnsavedDocumentChanges).toHaveBeenCalledWith(documentId);
  });
});

describe("Workbench.listOpenDocuments", () => {
  it("returns empty when no documents are open", () => {
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    expect(workbench.listOpenDocuments()).toEqual([]);
  });

  it("returns entries with isDirty from the document state service", () => {
    const id = makeDocumentId("/store/doc.md");
    const dss = makeDocumentStateService({ isDocumentDirty: vi.fn().mockReturnValue(true) });
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), dss, makeInlineCompletionService(), makeEditorComponentFactory());
    seedOpenDocument(workbench, id, "tab-1");

    const docs = workbench.listOpenDocuments();

    expect(docs).toHaveLength(1);
    expect(docs[0].id.equals(id)).toBe(true);
    expect(docs[0].isDirty).toBe(true);
  });

  it("returns isDirty=false for a clean document", () => {
    const id = makeDocumentId("/store/doc.md");
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    seedOpenDocument(workbench, id, "tab-1");

    expect(workbench.listOpenDocuments()[0].isDirty).toBe(false);
  });
});

describe("Workbench.getFocusedDocumentId", () => {
  it("returns null when nothing is open", () => {
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    expect(workbench.getFocusedDocumentId()).toBeNull();
  });

  it("returns the id of the currently focused document", () => {
    const id = makeDocumentId("/store/doc.md");
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    seedOpenDocument(workbench, id, "tab-1");

    expect(workbench.getFocusedDocumentId()?.equals(id)).toBe(true);
  });
});

describe("Workbench.getFocusedEditor", () => {
  it("returns null when no tab is focused", () => {
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    expect(workbench.getFocusedEditor()).toBeNull();
  });

  it("returns the editor associated with the focused tab", () => {
    const id = makeDocumentId("/store/doc.md");
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    const editor = seedOpenDocumentWithEditor(workbench, id, "tab-1");

    expect(workbench.getFocusedEditor()).toBe(editor);
  });
});

describe("Workbench.closeDocument", () => {
  it("is a no-op when the document is not open", async () => {
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());

    await workbench.closeDocument(makeDocumentId("/store/doc.md"));

    expect(workbench.listOpenDocuments()).toHaveLength(0);
  });

  it("removes the document from the open list", async () => {
    const id = makeDocumentId("/store/doc.md");
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    seedOpenDocument(workbench, id, "tab-1");

    await workbench.closeDocument(id);

    expect(workbench.listOpenDocuments()).toHaveLength(0);
  });
});

describe("Workbench.closeFocusedTab", () => {
  it("is a no-op when no tab is focused", async () => {
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    await workbench.closeFocusedTab();
    expect(workbench.listOpenDocuments()).toHaveLength(0);
  });

  it("does not close the tab when the user cancels the dirty-document dialog", async () => {
    const id = makeDocumentId("/store/doc.md");
    const dss = makeDocumentStateService({ isDocumentDirty: vi.fn().mockReturnValue(true) });
    const ui = makeUi({ confirm: vi.fn().mockResolvedValue(false) });
    const workbench = new Workbench(ui, null as any, makeDocumentService(), dss, makeInlineCompletionService(), makeEditorComponentFactory());
    seedOpenDocument(workbench, id, "tab-1");

    await workbench.closeFocusedTab();

    expect(workbench.listOpenDocuments()).toHaveLength(1);
  });
});

describe("Workbench.openDocument", () => {
  it("adds the document to the open list and sets it as focused", async () => {
    const id = makeDocumentId("/store/doc.md");
    const { factory } = makeEditorNodeFactory();
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), makeDocumentStateService(), makeInlineCompletionService(), factory);
    seedEditorGroup(workbench);

    await workbench.openDocument(id);

    expect(workbench.listOpenDocuments()).toHaveLength(1);
    expect(workbench.getFocusedDocumentId()?.equals(id)).toBe(true);
  });

  it("loads the document content into the editor", async () => {
    const id = makeDocumentId("/store/doc.md");
    const ds = makeDocumentService();
    vi.mocked(ds.readDocument).mockResolvedValue("hello world");
    const { factory, editor } = makeEditorNodeFactory();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), factory);
    seedEditorGroup(workbench);

    await workbench.openDocument(id);

    expect((editor as any).setContent).toHaveBeenCalledWith("hello world");
  });

  it("does not open a second tab for an already-open document", async () => {
    const id = makeDocumentId("/store/doc.md");
    const ds = makeDocumentService();
    const { factory } = makeEditorNodeFactory();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), factory);
    seedEditorGroup(workbench);

    await workbench.openDocument(id);
    const readCountAfterFirst = vi.mocked(ds.readDocument).mock.calls.length;
    await workbench.openDocument(id);

    expect(vi.mocked(ds.readDocument).mock.calls.length).toBe(readCountAfterFirst);
    expect(workbench.listOpenDocuments()).toHaveLength(1);
  });
});

describe("Workbench.createDocument", () => {
  it("creates a document with the default name and opens it", async () => {
    const ds = makeDocumentService();
    const newId = makeDocumentId("/store/Untitled Document.md");
    vi.mocked(ds.documentPathFromString).mockReturnValue(DocumentPath.parse("/Untitled Document.md"));
    vi.mocked(ds.documentIdFromPath).mockReturnValue(newId);
    vi.mocked(ds.createDocument).mockResolvedValue(newId);
    const { factory } = makeEditorNodeFactory();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), factory);
    seedEditorGroup(workbench);

    const id = await workbench.createDocument();

    expect(id.equals(newId)).toBe(true);
    expect(workbench.listOpenDocuments()).toHaveLength(1);
  });

  it("appends .md extension when the filepath does not have one", async () => {
    const ds = makeDocumentService();
    const newId = makeDocumentId("/store/doc.md");
    vi.mocked(ds.documentPathFromString).mockImplementation((str) => DocumentPath.parse(str));
    vi.mocked(ds.documentIdFromPath).mockReturnValue(newId);
    vi.mocked(ds.createDocument).mockResolvedValue(newId);
    const { factory } = makeEditorNodeFactory();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), factory);
    seedEditorGroup(workbench);

    await workbench.createDocument(DocumentPath.parse("/doc"));

    const filenameArg = vi.mocked(ds.documentPathFromString).mock.calls[0][0];
    expect(filenameArg).toMatch(/\.md$/);
  });

  it("generates a suffixed name when the default name is already taken", async () => {
    const ds = makeDocumentService();
    const existingId = makeDocumentId("/store/Untitled Document.md");
    const uniqueId = makeDocumentId("/store/Untitled Document(1).md");

    vi.mocked(ds.documentPathFromString).mockImplementation((str) => DocumentPath.parse(str.startsWith("/") ? str : `/${str}`));
    vi.mocked(ds.listDocuments).mockResolvedValue([existingId]);
    vi.mocked(ds.documentIdFromPath).mockImplementation((path) => {
      if (path.toString() === "/Untitled Document.md") return existingId;
      return uniqueId;
    });
    vi.mocked(ds.createDocument).mockResolvedValue(uniqueId);
    const { factory } = makeEditorNodeFactory();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), factory);
    seedEditorGroup(workbench);

    await workbench.createDocument();

    const pathArg = vi.mocked(ds.createDocument).mock.calls[0][0];
    expect(pathArg.toString()).not.toBe("/Untitled Document.md");
  });
});

describe("Workbench.renameDocument", () => {
  it("delegates rename to the document service", async () => {
    const fromId = makeDocumentId("/store/old.md");
    const toPath = DocumentPath.parse("/new.md");
    const newId = makeDocumentId("/store/new.md");
    const ds = makeDocumentService();
    vi.mocked(ds.renameDocument).mockResolvedValue(newId);
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());

    await workbench.renameDocument(fromId, toPath);

    expect(ds.renameDocument).toHaveBeenCalledWith(fromId, toPath);
  });

  it("updates the tab title when the renamed document is currently open", async () => {
    const fromId = makeDocumentId("/store/old.md");
    const toPath = DocumentPath.parse("/new.md");
    const newId = makeDocumentId("/store/new.md");
    const ds = makeDocumentService();
    vi.mocked(ds.renameDocument).mockResolvedValue(newId);
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    seedOpenDocument(workbench, fromId, "tab-old");

    await workbench.renameDocument(fromId, toPath);

    const tab = (workbench as any)._editorGroups[0].tabs[0];
    expect(tab.title).toBe("new.md");
  });

  it("calls startRename on the document panel when there is a name conflict", async () => {
    const { DocumentIdConflictError } = await import("../../../src/browser/lib/document/errors.js");
    const fromId = makeDocumentId("/store/old.md");
    const toPath = DocumentPath.parse("/existing.md");
    const ds = makeDocumentService();
    vi.mocked(ds.renameDocument).mockRejectedValue(new DocumentIdConflictError("/store/existing.md"));
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    const documentPanelMock = { startRename: vi.fn() };
    (workbench as any)._documentPanel = documentPanelMock;

    await workbench.renameDocument(fromId, toPath);

    expect(documentPanelMock.startRename).toHaveBeenCalled();
  });

  it("shows an alert and rethrows on unexpected errors", async () => {
    const fromId = makeDocumentId("/store/doc.md");
    const toPath = DocumentPath.parse("/other.md");
    const ds = makeDocumentService();
    vi.mocked(ds.renameDocument).mockRejectedValue(new Error("disk full"));
    const ui = makeUi();
    const workbench = new Workbench(ui, null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());

    await expect(workbench.renameDocument(fromId, toPath)).rejects.toThrow("disk full");
    expect(ui.alert).toHaveBeenCalled();
  });
});

describe("Workbench.deleteDocument", () => {
  it("calls deleteDocument on the service", async () => {
    const id = makeDocumentId("/store/doc.md");
    const ds = makeDocumentService();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());

    await workbench.deleteDocument(id);

    expect(ds.deleteDocument).toHaveBeenCalledWith(id);
  });

  it("closes the tab for the deleted document if it was open", async () => {
    const id = makeDocumentId("/store/doc.md");
    const ds = makeDocumentService();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    seedOpenDocument(workbench, id, "tab-1");

    await workbench.deleteDocument(id);

    expect(workbench.listOpenDocuments()).toHaveLength(0);
  });
});

describe("Workbench.saveFocusedDocument", () => {
  it("is a no-op when no tab is focused", async () => {
    const ds = makeDocumentService();
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());

    await workbench.saveFocusedDocument();

    expect(ds.updateDocument).not.toHaveBeenCalled();
  });

  it("saves the current editor content via the document service", async () => {
    const id = makeDocumentId("/store/doc.md");
    const ds = makeDocumentService();
    vi.mocked(ds.updateDocument).mockResolvedValue(undefined);
    const workbench = new Workbench(makeUi(), null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    const editor = seedOpenDocumentWithEditor(workbench, id, "tab-1");
    vi.mocked((editor as any).getContent).mockReturnValue("saved content");

    await workbench.saveFocusedDocument();

    expect(ds.updateDocument).toHaveBeenCalledWith(id, "saved content");
  });

  it("shows an alert when the save fails", async () => {
    const id = makeDocumentId("/store/doc.md");
    const ds = makeDocumentService();
    vi.mocked(ds.updateDocument).mockRejectedValue(new Error("save error"));
    const ui = makeUi();
    const workbench = new Workbench(ui, null as any, ds, makeDocumentStateService(), makeInlineCompletionService(), makeEditorComponentFactory());
    const editor = seedOpenDocumentWithEditor(workbench, id, "tab-1");
    vi.mocked((editor as any).getContent).mockReturnValue("content");

    await workbench.saveFocusedDocument();

    expect(ui.alert).toHaveBeenCalled();
  });
});

describe("Workbench - editor change event triggers draft save", () => {
  it("calls setDocumentDraft when the editor emits a change event after openDocument", async () => {
    const id = makeDocumentId("/store/doc.md");
    const dss = makeDocumentStateService();
    const { factory, editor } = makeEditorNodeFactory();
    const workbench = new Workbench(makeUi(), null as any, makeDocumentService(), dss, makeInlineCompletionService(), factory);
    seedEditorGroup(workbench);

    await workbench.openDocument(id);

    // Simulate a tool mutation: dispatch a "change" event on the editor
    // (exactly what CodeMirrorEditor._emitChange() does).
    editor.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true }));

    expect(dss.setDocumentDraft).toHaveBeenCalledWith(id, expect.any(String));
  });
});
