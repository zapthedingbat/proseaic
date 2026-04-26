import { describe, it, expect, vi, beforeEach } from "vitest";
import { Workbench } from "./workbench";
import { DocumentId } from "./document/document-service";
import type { IDocumentStateService } from "./document/document-state-service";
import type { IDocumentService } from "./document/document-service";
import type { IUserInteraction } from "./ui/user-interaction";
import type { IInlineCompletionService } from "./completion/inline-completion-service";

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

function makeEditorComponentFactory() {
  return vi.fn().mockResolvedValue({
    setContent: vi.fn(),
    getContent: vi.fn().mockReturnValue(""),
    getOutline: vi.fn().mockReturnValue([]),
    addEventListener: vi.fn(),
    appendChild: vi.fn(),
  });
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
    // BUG: this assertion currently FAILS because closeTab never calls
    // discardUnsavedDocumentChanges after the user confirms.
    expect(documentStateService.discardUnsavedDocumentChanges).toHaveBeenCalledWith(documentId);
  });
});
