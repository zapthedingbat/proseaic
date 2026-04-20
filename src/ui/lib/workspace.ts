import { DocumentConflictError as DocumentIdConflictError, IDocumentService } from "./document/document-service";
import { IDocumentStateService } from "./document/document-state-service";
import { IEditableText } from "./document/editable-text";

export type WorkspaceDocument = {
  id: DocumentId;
  isOpen?: boolean;
};

export type DocumentId = string;

export type TabId = string;

export interface IWorkspace {
  
  
  //?
  //handleEditorChange();
  //?
  
  //selectDocument(id: DocumentId): Promise<void>;
  renameDocument(fromId: DocumentId, toId: DocumentId): Promise<void>;
  deleteDocument(id: DocumentId): Promise<void>;
  createDocument(): Promise<DocumentId>;
  
  openDocument(documentId: DocumentId): Promise<void>;
  closeDocument(documentId: DocumentId): Promise<void>;
  
  closeFocusedTab(): Promise<void>;

  saveFocusedDocument(): Promise<void>; //'workspace.save'
  saveFocusedDocumentAs(): Promise<void>; //'workspace.save-as'
  //handleDocumentUpdateConflict(); 

}

type UserInterface = {
  alert(message: string): Promise<void>;
  confirm(message: string): Promise<boolean>;
  prompt(message: string, defaultValue?: string): Promise<string | null>;
}


type Tab = {
  id: TabId;
  title: string;
}

type Pane = {
  tabs: Array<Tab>;
  activeTabId: Tab | null;
}

interface IEditorComponent {
  setContent(content: string): void;
  getContent(): string;
  onChange(callback: (content: string) => void): void;
}

type EditorComponentFactory = (format: string) => Promise<IEditorComponent>;

// Coordinates tabs, instances of editors, document state, and persistence.
// The workspace is the main API for the app to interact with documents and the UI.

export class Workspace implements IWorkspace {

  private _documentService: IDocumentService;
  private _documentStateService: IDocumentStateService;

  private _openDocuments: Array<{documentId: DocumentId; tabId: TabId}> = [];
  private _editors: WeakMap<Pane, IEditorComponent> = new WeakMap();
  private _ui: UserInterface;
  private _focusedTab: TabId | null = null;

  private _panes: Array<Pane> = [];
  private _editorComponentFactory: EditorComponentFactory;

  constructor(ui: UserInterface, documentService: IDocumentService, documentStateService: IDocumentStateService, editorComponentFactory: EditorComponentFactory) {
    this._ui = ui;
    this._documentService = documentService;
    this._documentStateService = documentStateService;
    this._editorComponentFactory = editorComponentFactory;
    this._openDocuments = [];
    this._panes = [{
      tabs: [],
      activeTabId: null,
    }];
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
      // Optionally, you could set a new focused tab here if needed.
    }

    // Find the pane that contains the tab with the given tabId
    const pane = this._panes.find(pane => pane.tabs.some(tab => tab.id === tabId));
    if (!pane) {
      console.warn(`Tab with id ${tabId} not found in any pane.`);
      return;
    }

    // If the closed tab was active, we should set a new active tab (for simplicity, just pick the first one if it exists)
    if (pane.activeTabId?.id === tabId) {
      const nextTab = pane.tabs.length > 0 ? pane.tabs[0] : null;
      if(nextTab){
        this._selectTab(nextTab.id);
      }
    }

    // Remove the tab from the pane
    pane.tabs = pane.tabs.filter(tab => tab.id !== tabId);

    // Rerender the UI to reflect the closed tab
  }

  async renameDocument(fromId: DocumentId, toId: DocumentId): Promise<void> {

    try {
      await this._documentService.renameDocument(fromId, toId);
    } catch (err: unknown) {
      if(err instanceof DocumentIdConflictError){
        const newName = await this._ui.prompt(`A document with the name "${toId}" already exists. Please enter a different name:`, toId);
        if(newName){
          return this.renameDocument(fromId, newName);
        }
        return;
      }
      await this._ui.alert(`Failed to rename document: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // If the renamed document is currently open in a tab, we should also update the tab's title to reflect the new document name.
    const openDoc = this._openDocuments.find(doc => doc.documentId === fromId);
    if (openDoc) {
      const pane = this._panes.find(pane => pane.tabs.some(tab => tab.id === openDoc.tabId));
      if (pane) {
        const tab = pane.tabs.find(tab => tab.id === openDoc.tabId);
        if (tab) {
          tab.title = toId;
          // Rerender the UI to reflect the updated tab title
        }
      }
    }
  }

  async deleteDocument(id: DocumentId): Promise<void> {
    // TODO: Depending on the desired UX, you might want to prompt the user to confirm deletion,
    // especially if the document is currently open or has unsaved changes.
    
    // Delete the document from persistence first, because it won't then be marked as dirty and we can skip the confirmation dialog about unsaved changes.
    await this._documentService.deleteDocument(id);
    
    // If it was open in a tab, close that tab.
    const openDoc = this._openDocuments.find(doc => doc.documentId === id);
    if (openDoc) {
      await this.closeTab(openDoc.tabId);
    }
    // Refresh the UI, (document list will need to reflect the deleted document).
  }

  async createDocument(): Promise<DocumentId> {
    const newDocumentId = await this._getUniqueDocumentTitle("Untitled Document");
    const id = await this._documentService.createDocument(newDocumentId);
    await this.openDocument(id);
    return newDocumentId;
    // The UI should now start a rename flow for the new document.
  }

  private async _getUniqueDocumentTitle(baseId: string): Promise<DocumentId> {
    const existingDocumentIds = await this._documentService.listDocuments();
    const existingDocumentIdsSet = new Set(existingDocumentIds);
    let candidate = baseId;
    let index = 1;
    while (existingDocumentIdsSet.has(candidate)) {
      candidate = `${baseId} (${index})`;
      index += 1;
    }
    return candidate;
  }

  async closeDocument(documentId: DocumentId): Promise<void> {
    // This method is for closing a document by its ID, regardless of which tab it's in. It will find the tab that has this document open and close that tab.
    const openDoc = this._openDocuments.find(doc => doc.documentId === documentId);
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
    const pane = this._panes.find(pane => pane.tabs.some(tab => tab.id === this._focusedTab));
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
    throw new Error("Method not implemented.");
  }

  // Create a 'visual' pane for the workspace, which will contain tabs and an editor area.
  private _addWorkspacePane(): void {
    this._panes.push({
      tabs: [],
      activeTabId: null,
    });

    // TODO: Render the new pane in the UI, and set up event listeners for tab selection and closing.
  }

  async openDocument(documentId: DocumentId): Promise<void> {

    // Check if the document is already open in a tab. If so, just focus that tab instead of opening a new one.
    const documentTabId = this._openDocuments.find(doc => doc.documentId === documentId);
    if (documentTabId) {
      // Document is already open, just focus the existing tab.
      this._selectTab(documentTabId.tabId);
      return;
    }

    // Pick a pane to open the document in, for now just use the first one.
    const pane = this._panes[0];

    // Create a new tab for the document.
    const newTabId = `tab-${documentId}`;
    const newTab: Tab = {
      id: newTabId,
      title: `Document ${documentId}`,
    };
    pane.tabs.push(newTab);
    pane.activeTabId = newTab;

    // Track the open document and its associated tab.
    this._openDocuments.push({
      documentId,
      tabId: newTabId,
    });

    // Set the pane to show the editor for the document
    // TODO: If we support different types of documents, we might want to have different editor component factories based on the document type or other metadata.
    // For now, just assume all documents are markdown and use the same editor factory. We can extend this later.
    let editor = await this._getEditorForPane("markdown", pane);
    if(editor){
      // Use the documentService to load the document content, then set it in the editor.
      const content = await this._documentService.readDocument(documentId);
      editor.setContent(content);
      
      // Set up an onChange listener for the editor to track when the document becomes dirty.
      editor.onChange((content) => {this._documentStateService.setDocumentDraft(documentId, content);});
    }
  }

  private async _getEditorForPane(format: string, pane: Pane): Promise<IEditorComponent> {
    // Check to see if there is already a editor associated with this pane, if so, reuse it. If not, create a new one and associate it with the pane.
    let editor = this._editors.get(pane);
    if (!editor) {
      // Create and associate an editor component with the pane if it doesn't exist.
      editor = await this._editorComponentFactory(format);
      // Set up an onChange listener for the editor to track when the document becomes dirty.
      this._editors.set(pane, editor);
    }
    return editor;
  }

  private async _selectTab(tabId: TabId) {

    // Find the pane that has the tab already active, if any. If the tab is already active, we don't need to do anything.
    if(this._panes.some(pane => pane.activeTabId?.id === tabId)){
      return;
    }

    // Find the pane that contains the tab with the given tabId
    const pane = this._panes.find(pane => pane.tabs.some(tab => tab.id === tabId));
    if (!pane) {
      console.warn(`Tab with id ${tabId} not found in any pane.`);
      return;
    }

    // Set the found tab as the active tab in its pane
    const tabToActivate = pane.tabs.find(tab => tab.id === tabId);
    if (tabToActivate) {
      pane.activeTabId = tabToActivate;
    }

    // Reset the pane canvas to show the tab's content.
    
    // If this tab contains a document, load the document content into the editor for pane
    const documentEntry = this._openDocuments.find(doc => doc.tabId === tabId);
    if (documentEntry) {
      const editor = await this._getEditorForPane("markdown", pane);
      if (editor) {
        // Use the documentService to load the document content, then set it in the editor.
        const documentId = documentEntry.documentId;
        const content = await this._documentService.readDocument(documentId);
        editor.setContent(content);
        editor.onChange((content) => {this._documentStateService.setDocumentDraft(documentEntry.documentId, content);});
      }
    }
  }
}