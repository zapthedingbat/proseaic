import { DocumentId, DocumentPath, IDocumentService} from "./document/document-service";
import { IDocumentStateService } from "./document/document-state-service";
import { DocumentIdConflictError } from "./document/errors";
import { DocumentOutline } from "./document/document-outline";
import { IEditorComponent } from "./editor-component";
import { IUserInteraction } from "./ui/user-interaction";
import { ComponentFactory } from "./ui/component-factory";
import { DocumentPanel } from "../components/document-panel";
import { DocumentOutlinePanel } from "../components/outline-panel";
import { UiPane } from "../components/pane";
import { UiPaneView } from "../components/pane-view";
import { UiTabBar } from "../components/tab-bar";

export type WorkbenchDocumentState = {
  id: DocumentId;
  isDirty?: boolean;
};


export type TabId = string;

export interface IWorkbench {
  closeDocument(documentId: DocumentId): Promise<void>;
  closeFocusedTab(): Promise<void>;
  createDocument(filepath?: DocumentPath): Promise<DocumentId>;
  deleteDocument(id: DocumentId): Promise<void>;
  getFocusedEditor(): IEditorComponent | null;
  listOpenDocuments(): Array<WorkbenchDocumentState>;
  mount(containerEl: HTMLElement): void;
  openDocument(id: DocumentId): Promise<void>;
  renameDocument(fromId: DocumentId, toFilepath: DocumentPath): Promise<void>;
  saveFocusedDocument(): Promise<void>;
  saveFocusedDocumentAs(): Promise<void>;
}

type Tab = {
  id: TabId;
  title: string;
}

type EditorGroup = {
  canvasElement: HTMLElement;
  tabs: Array<Tab>;
  activeTabId: Tab | null;
}

type EditorComponentFactory = (format: string) => Promise<IEditorComponent>;

// The workspace is the main API for the app to interact with documents and the UI.
// It coordinates tabs, instances of editor components, document state, and persistence.

// TODO: Implement a command/action system for the workspace, so that we can have a more flexible way of triggering actions like save, rename, delete, etc. This will also make it easier to add keyboard shortcuts and menu items for these actions in the future.

export class Workbench implements IWorkbench {
  // Services
  private _documentService: IDocumentService;
  private _documentStateService: IDocumentStateService;
  private _editorComponentFactory: EditorComponentFactory;
  private _componentFactory: ComponentFactory;

  // Internal state
  private _openDocuments: Array<{documentId: DocumentId; tabId: TabId}> = [];
  private _editors: WeakMap<EditorGroup, IEditorComponent> = new WeakMap();
  private _ui: IUserInteraction;
  private _focusedTab: TabId | null = null;
  private _editorGroups: Array<EditorGroup> = [];

  // UI components (set after mount())
  private _tabBar: UiTabBar | null = null;
  private _documentPanel: DocumentPanel | null = null;
  private _outlinePanel: DocumentOutlinePanel | null = null;

  constructor(
    ui: IUserInteraction,
    componentFactory: ComponentFactory,
    documentService: IDocumentService,
    documentStateService: IDocumentStateService,
    editorComponentFactory: EditorComponentFactory
  ) {
    this._ui = ui;
    this._componentFactory = componentFactory;
    this._documentService = documentService;
    this._documentStateService = documentStateService;
    this._editorComponentFactory = editorComponentFactory;
  }

  listOpenDocuments(): Array<WorkbenchDocumentState> {
    const openDocumentStates = this._openDocuments.map(openDoc => {
      const isDirty = this._documentStateService.isDocumentDirty(openDoc.documentId);
      return {
        id: openDoc.documentId,
        isDirty,
      };
    });
    return openDocumentStates;
  }

  async closeFocusedTab(): Promise<void> {
    if(this._focusedTab){
      await this.closeTab(this._focusedTab);
    }
  }

  private async closeTab(tabId: TabId): Promise<void> {
    
    // First find out if there are unsaved changes in the document associated with this tab, and if so, prompt the user to confirm they want to close it.
    const documentEntry = this._openDocuments.find(doc => doc.tabId === tabId);
    if(documentEntry){
      // There's a document associated with this tab
      const isDirty = this._documentStateService.isDocumentDirty(documentEntry.documentId);
      if(isDirty){
        const confirmed = await this._ui.confirm("You have unsaved changes. Are you sure you want to close this tab?");
        if(!confirmed){
          // Don't close the tab if the user cancels the confirmation dialog
          return;
        }
      }
    }

    //  Remove the document from the open documents list
    this._openDocuments = this._openDocuments.filter(doc => doc.tabId !== tabId);
    if (this._focusedTab === tabId) {
      this._focusedTab = null;
    }

    // Find the pane that contains the tab with the given tabId
    const pane = this._editorGroups.find(pane => pane.tabs.some(tab => tab.id === tabId));
    if (!pane) {
      console.warn(`Tab with id ${tabId} not found in any pane.`);
      return;
    }

    // Compute next tab before mutating the tabs array
    const remainingTabs = pane.tabs.filter(tab => tab.id !== tabId);

    // If the closed tab was active, select a new active tab from the remaining ones
    if (pane.activeTabId?.id === tabId) {
      const nextTab = remainingTabs.length > 0 ? remainingTabs[0] : null;
      if (nextTab) {
        await this._selectTab(nextTab.id);
      } else {
        pane.activeTabId = null;
      }
    }

    pane.tabs = remainingTabs;
    await this._syncUI();
  }

  async renameDocument(fromId: DocumentId, toFilepath: DocumentPath): Promise<void> {

    let newId: DocumentId;
    try {
      newId = await this._documentService.renameDocument(fromId, toFilepath);
    } catch (err: unknown) {
      if(err instanceof DocumentIdConflictError){
        this._documentPanel?.startRename(fromId, `"${toFilepath.toString()}" already exists. Try a different name.`);
        return;
      }
      await this._ui.alert(`Failed to rename document: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }

    // If the renamed document is currently open in a tab, we should also update the tab's title to reflect the new document name.
    const openDoc = this._openDocuments.find(doc => doc.documentId.equals(fromId));
    if (openDoc) {
      const pane = this._editorGroups.find(pane => pane.tabs.some(tab => tab.id === openDoc.tabId));
      if (pane) {
        const tab = pane.tabs.find(tab => tab.id === openDoc.tabId);
        if (tab) {
          tab.title = newId.path.filename;
        }
      }
    }

    await this._syncUI();
  }

  async deleteDocument(id: DocumentId): Promise<void> {
    // TODO: Depending on the desired UX, you might want to prompt the user to confirm deletion,
    // especially if the document is currently open or has unsaved changes.
    
    // Delete the document from persistence first, because it won't then be marked as dirty and we can skip the confirmation dialog about unsaved changes.
    await this._documentService.deleteDocument(id);
    
    // If it was open in a tab, close that tab.
    const openDoc = this._openDocuments.find(doc => doc.documentId.equals(id));
    if (openDoc) {
      await this.closeTab(openDoc.tabId);
    }
    await this._syncUI();
  }

  async duplicateDocument(id: DocumentId): Promise<void> {
    const originalContent = await this._documentService.readDocument(id);
    const originalDocumentPath = id.path;
    const copyDocumentPath = originalDocumentPath.withSuffixName(" Copy");
    const uniqueCopyDocumentPath = await this._getUniqueFilepath(copyDocumentPath);
    const newDocumentId = await this._documentService.createDocument(uniqueCopyDocumentPath);
    await this._documentService.updateDocument(newDocumentId, originalContent);
    await this.openDocument(newDocumentId);
  }

  async exportDocument(id: DocumentId): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async createDocument(filepath?:DocumentPath): Promise<DocumentId> {
    const filepathStr = filepath ? filepath.toString() : "Untitled Document.md";
    const filenameWithExtension = (filepathStr.endsWith(".md") ? filepathStr : `${filepathStr}.md`);
    const documentPath = this._documentService.documentPathFromString(filenameWithExtension);
    const newFilepath = await this._getUniqueFilepath(documentPath);
    const id = await this._documentService.createDocument(newFilepath);
    await this.openDocument(id);
    return id;
  }

  private async _getUniqueFilepath(basePath: DocumentPath): Promise<DocumentPath> {
    const existingDocumentIds = await this._documentService.listDocuments();
    let candidatePath = basePath;
    let index = 1;

    while (existingDocumentIds.some(id => id.equals(this._documentService.documentIdFromPath(candidatePath)))) {
      candidatePath = basePath.withSuffixName(`(${index})`);
      index += 1;
    }

    return candidatePath;
  }

  async closeDocument(documentId: DocumentId): Promise<void> {
    // This method is for closing a document by its ID, regardless of which tab it's in. It will find the tab that has this document open and close that tab.
    const openDoc = this._openDocuments.find(doc => doc.documentId.equals(documentId));
    if (openDoc) {
      return await this.closeTab(openDoc.tabId);
    }
  }

  async saveFocusedDocument(): Promise<void> {
    if(!this._focusedTab){
      // No focused tab, so nothing to save
      return;
    }

    // Find the document associated with the focused tab
    const documentEntry = this._openDocuments.find(doc => doc.tabId === this._focusedTab);
    if (!documentEntry) {
      // No document associated with the focused tab, so nothing to save
      return;
    }

    const documentId = documentEntry.documentId;

    // Get the pane and editor for the focused tab
    const pane = this._editorGroups.find(pane => pane.tabs.some(tab => tab.id === this._focusedTab));
    if (!pane) {
      console.warn(`Focused tab with id ${this._focusedTab} not found in any pane.`);
      return;
    }

    const editor = await this._getEditorForPane(documentId, pane);
    if (!editor) {
      console.warn(`No editor found for the pane containing the focused tab ${this._focusedTab}.`);
      return;
    }

    const content = editor.getContent();

    try {
      await this._documentService.updateDocument(documentId, content);
      // After saving, we should also update the document state to mark it as not dirty.
    } catch (err: unknown) {
      await this._ui.alert(`Failed to save document: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async saveFocusedDocumentAs(): Promise<void> {
    if (!this._focusedTab) {
      return;
    }

    const documentEntry = this._openDocuments.find(doc => doc.tabId === this._focusedTab);
    if (!documentEntry) {
      return;
    }

    const pane = this._editorGroups.find(group => group.tabs.some(tab => tab.id === this._focusedTab));
    if (!pane) {
      return;
    }

    const editor = await this._getEditorForPane(documentEntry.documentId, pane);
    const currentTitle = documentEntry.documentId.path.filename;
    const requestedFilename = await this._ui.prompt("Save document as:", currentTitle);
    if (!requestedFilename) {
      return;
    }

    const filepath = await this._getUniqueFilepath(documentEntry.documentId.path);
    const newDocumentId = await this._documentService.createDocument(filepath);
    await this._documentService.updateDocument(newDocumentId, editor.getContent());
    await this.openDocument(newDocumentId);
  }

  async openDocument(documentId: DocumentId): Promise<void> {

    // Check if the document is already open in a tab. If so, just focus that tab instead of opening a new one.
    const documentTabId = this._openDocuments.find(doc => doc.documentId.equals(documentId));
    if (documentTabId) {
      // Document is already open, just focus the existing tab.
      await this._selectTab(documentTabId.tabId);
      return;
    }

    // Pick a pane to open the document in, for now just use the first one.
    const pane = this._editorGroups[0];

    // Create a new tab for the document.
    const newTabId = `tab-${documentId}`;
    const newTab: Tab = {
      id: newTabId,
      title: documentId.path.filename
    };
    pane.tabs.push(newTab);
    pane.activeTabId = newTab;
    this._focusedTab = newTabId;

    // Track the open document and its associated tab.
    this._openDocuments.push({
      documentId,
      tabId: newTabId,
    });

    // Set the pane to show the editor for the document
    // TODO: If we support different types of documents, we might want to have different editor component factories based on the document type or other metadata.
    // For now, just assume all documents are markdown and use the same editor factory. We can extend this later.
    let editor = await this._getEditorForPane(documentId, pane);
    if(editor){
      // Use the documentService to load the document content, then set it in the editor.
      const content = await this._documentService.readDocument(documentId);
      editor.setContent(content);
    }
    await this._syncUI();
  }

  private _getDocumentFormat(documentId: DocumentId): string {
    switch(documentId.path.ext){
      case ".md":
        return "markdown";
      default:
        return "plaintext";
    }
  }

  private async _getEditorForPane(id: DocumentId, pane: EditorGroup): Promise<IEditorComponent> {

    const format = this._getDocumentFormat(id);

    // Check to see if there is already a editor associated with this pane, if so, reuse it. If not, create a new one and associate it with the pane.
    let editor = this._editors.get(pane);
    if (!editor) {
      // Create and associate an editor component with the pane if it doesn't exist.
      editor = await this._editorComponentFactory(format);
      pane.canvasElement.appendChild(editor);
      this._editors.set(pane, editor);

      // A single change listener per editor instance. Always reads the currently
      // focused document so that switching tabs cannot leak drafts into the wrong document.
      const editorRef = editor;
      editor.addEventListener("change", () => {
        const focusedDocId = this._getFocusedDocumentId();
        if (focusedDocId) {
          this._documentStateService.setDocumentDraft(focusedDocId, editorRef.getContent());
          void this._syncUI();
        }
      });
    }
    return editor;
  }

  private async _selectTab(tabId: TabId) {

    // Find the pane that has the tab already active, if any. If the tab is already active, we don't need to do anything.
    if(this._editorGroups.some(pane => pane.activeTabId?.id === tabId)){
      return;
    }

    // Find the pane that contains the tab with the given tabId
    const pane = this._editorGroups.find(pane => pane.tabs.some(tab => tab.id === tabId));
    if (!pane) {
      console.warn(`Tab with id ${tabId} not found in any pane.`);
      return;
    }

    // Set the found tab as the active tab in its pane
    const tabToActivate = pane.tabs.find(tab => tab.id === tabId);
    if (tabToActivate) {
      pane.activeTabId = tabToActivate;
      this._focusedTab = tabId;
    }

    // Reset the pane canvas to show the tab's content.
    
    // If this tab contains a document, load the document content into the editor for pane
    const documentEntry = this._openDocuments.find(doc => doc.tabId === tabId);
    if (documentEntry) {
      const editor = await this._getEditorForPane(documentEntry.documentId, pane);
      if (editor) {
        // Use the documentService to load the document content, then set it in the editor.
        const documentId = documentEntry.documentId;
        const content = await this._documentService.readDocument(documentId);
        editor.setContent(content);
      }
    }
    await this._syncUI();
  }

  mount(mainEl: HTMLElement): void {
    // Create center workspace section
    const center = document.createElement("section");
    center.className = "workspace center";

    this._tabBar = this._componentFactory.create(UiTabBar);
    this._tabBar.addEventListener("select", this._handleTabSelect);
    this._tabBar.addEventListener("close", this._handleTabClose);
    center.appendChild(this._tabBar);

    const editorCanvas = document.createElement("div");
    editorCanvas.className = "workbench-editor-area";
    center.appendChild(editorCanvas);

    this._editorGroups = [{
      canvasElement: editorCanvas,
      tabs: [],
      activeTabId: null,
    }];

    // Create left pane view with Documents and Outline panes
    const leftPaneView = this._componentFactory.create(UiPaneView);
    leftPaneView.classList.add("pane-view", "left");

    const docPane = this._componentFactory.create(UiPane);
    docPane.setAttribute("title", "Documents");
    this._documentPanel = this._componentFactory.create(DocumentPanel);
    this._documentPanel.addEventListener("select", this._handleDocumentSelect);
    this._documentPanel.addEventListener("create", this._handleDocumentCreate);
    this._documentPanel.addEventListener("rename", this._handleDocumentRename);
    this._documentPanel.addEventListener("delete", this._handleDocumentDelete);
    this._documentPanel.addEventListener("duplicate", this._handleDocumentDuplicate);
    this._documentPanel.addEventListener("export", this._handleDocumentExport);
    docPane.appendChild(this._documentPanel);

    const outlinePane = this._componentFactory.create(UiPane);
    outlinePane.setAttribute("title", "Outline");
    this._outlinePanel = this._componentFactory.create(DocumentOutlinePanel);
    this._outlinePanel.addEventListener("select", this._handleOutlineSelect);
    this._outlinePanel.addEventListener("delete", this._handleOutlineDelete);
    this._outlinePanel.addEventListener("decrease-level", this._handleOutlineDecreaseLevel);
    this._outlinePanel.addEventListener("increase-level", this._handleOutlineIncreaseLevel);
    outlinePane.appendChild(this._outlinePanel);

    leftPaneView.appendChild(docPane);
    leftPaneView.appendChild(outlinePane);

    // Prepend left + center before any existing children (e.g. right pane)
    const firstChild = mainEl.firstChild;
    mainEl.insertBefore(center, firstChild);
    mainEl.insertBefore(leftPaneView, center);

    // Ensure UI is synced with backend state on initial mount
    void this._syncUI();
  }

  getFocusedEditor(): IEditorComponent | null {
    if (!this._focusedTab) return null;
    const pane = this._editorGroups.find(g => g.tabs.some(t => t.id === this._focusedTab));
    if (!pane) return null;
    return this._editors.get(pane) ?? null;
  }

  private _getFocusedDocumentId(): DocumentId | null {
    if (!this._focusedTab) return null;
    return this._openDocuments.find(d => d.tabId === this._focusedTab)?.documentId ?? null;
  }

  private async _syncUI(): Promise<void> {
    this._syncTabBar();
    this._syncEditorArea();
    await this._syncDocumentPanel();
    this._syncOutlinePanel();
  }

  private _syncEditorArea(): void {
    const pane = this._editorGroups[0];
    if (!pane) return;
    pane.canvasElement.style.display = pane.activeTabId !== null ? "" : "none";
  }

  private _syncTabBar(): void {
    if (!this._tabBar) return;
    const pane = this._editorGroups[0];
    if (!pane) return;
    const tabs = pane.tabs.map(t => ({ id: t.id, title: t.title }));
    const activeId = pane.activeTabId?.id ?? null;
    const dirtyIds = this._openDocuments
      .filter(d => this._documentStateService.isDocumentDirty(d.documentId))
      .map(d => d.tabId);
    this._tabBar.setTabs(tabs, activeId, dirtyIds);
  }

  private async _syncDocumentPanel(): Promise<void> {
    if (!this._documentPanel) return;
    const allDocIds = await this._documentService.listDocuments();
    const focusedDocId = this._getFocusedDocumentId();
    const dirtyIds = this._openDocuments
      .filter(d => this._documentStateService.isDocumentDirty(d.documentId))
      .map(d => d.documentId);

    this._documentPanel.setDocuments(
      allDocIds,
      focusedDocId,
      dirtyIds
    );
  }

  private _syncOutlinePanel(): void {
    if (!this._outlinePanel) return;
    const editor = this.getFocusedEditor();
    const outline: DocumentOutline = editor ? editor.getOutline() : [];
    this._outlinePanel.setDocument(outline);
  }

  // TODO: Use typed custom events instead of relying on the event detail having the expected shape.
  // This will make the code safer and easier to maintain.

  // Tab bar event handlers
  private _handleTabSelect = (event: Event): void => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    void this._selectTab(id);
  }

  private _handleTabClose = (event: Event): void => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    void this.closeTab(id);
  }

  // Document panel event handlers
  private _handleDocumentSelect = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const { id } = event.detail as { id: string };

    if(!DocumentId.isValidFormat(id)){
      throw new Error("id must be a valid DocumentId string");
    }

    const documentId = DocumentId.parse(id); 

    void this.openDocument(documentId);
  }

  private _handleDocumentCreate = async (): Promise<void> => {
    const id = await this.createDocument();
    this._documentPanel?.startRename(id);
  }

  private _handleDocumentRename = (event: Event): void => {
    const { fromId, toFilepath } = (event as CustomEvent<{ fromId: string; toFilepath: string }>).detail;

    if(!DocumentId.isValidFormat(fromId)){
      throw new Error("fromId must be a valid DocumentId string");
    }

    const fromDocumentId = DocumentId.parse(fromId);
    const toDocumentPath = this._documentService.documentPathFromString(toFilepath);

    void this.renameDocument(fromDocumentId, toDocumentPath);
  }

  private _handleDocumentDelete = (event: Event): void => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;

    if(!DocumentId.isValidFormat(id)){
      throw new Error("id must be a valid DocumentId string");
    }

    const documentId = DocumentId.parse(id);

    void this.deleteDocument(documentId);
  }

  private _handleDocumentExport = (event: Event): void => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;

    if(!DocumentId.isValidFormat(id)){
      throw new Error("id must be a valid DocumentId string");
    }

    const documentId = DocumentId.parse(id);

    void this.exportDocument(documentId);
  }

  private _handleDocumentDuplicate = (event: Event): void => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;

    if(!DocumentId.isValidFormat(id)){
      throw new Error("id must be a valid DocumentId string");
    }

    const documentId = DocumentId.parse(id);

    void this.duplicateDocument(documentId);
  }

  // Outline panel event handlers
  private _handleOutlineSelect = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    const editor = this.getFocusedEditor() as any;
    editor?.focusSection(sectionId);
  }

  private _handleOutlineDelete = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    const editor = this.getFocusedEditor() as any;
    editor?.removeSection(sectionId);
    void this._syncUI();
  }

  private _handleOutlineDecreaseLevel = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    const editor = this.getFocusedEditor() as any;
    editor?.decreaseSectionLevel(sectionId);
    void this._syncUI();
  }

  private _handleOutlineIncreaseLevel = (event: Event): void => {
    const { sectionId } = (event as CustomEvent<{ sectionId: string }>).detail;
    const editor = this.getFocusedEditor() as any;
    editor?.increaseSectionLevel(sectionId);
    void this._syncUI();
  }
}