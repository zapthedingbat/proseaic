import { DocumentId } from "../lib/document/document-service.js";
import { BaseHtmlElement } from "./base-html-element";
import { PaneAction } from "./pane.js";

type TreeNode = FileNode | FolderNode;

type FileNode = {
  kind: "file";
  id: DocumentId;
  name: string;
};

type FolderNode = {
  kind: "folder";
  name: string;
  path: string;
  children: TreeNode[];
};

// <document-panel> WebComponent
export class DocumentPanel extends BaseHtmlElement {
  private _listEl!: HTMLUListElement;
  private _documents: Array<DocumentId>;
  private _activeId: DocumentId | null;
  private _dirtyIds: Set<string>;
  private _collapsedFolders: Set<string>;

  constructor() {
    super();
    this._documents = [];
    this._activeId = null;
    this._dirtyIds = new Set();
    this._collapsedFolders = new Set();
  }

  connectedCallback(): void {
    if (!this._listEl) {
      this.innerHTML = `
<div class="panel">
  <ul class="document-list list" role="tree"></ul>
  <div class="cover empty" aria-hidden="true">No documents yet.</div>
</div>
`;
      this._listEl = this.querySelector(".list") as HTMLUListElement;
      this._render();
    }
    this._listEl.addEventListener("click", this._handleListClick);
  }

  disconnectedCallback(): void {
    this._listEl.removeEventListener("click", this._handleListClick);
  }

  getPaneActions(): PaneAction[] {
    return [
      { id: "create", title: "New document", icon: "codicon-new-file" }
    ];
  }

  onPaneAction(actionId: string): void {
    if (actionId === "create") {
      this._handleAddClick();
    }
  }

  setDocuments(documents: Array<DocumentId>, activeId: DocumentId | null, dirtyIds: DocumentId[] = []): void {
    this._documents = Array.isArray(documents) ? documents : [];
    this._activeId = activeId || null;
    this._dirtyIds = new Set(dirtyIds.map(id => id.toString()));
    this._render();
    this.dispatchEvent(new CustomEvent("pane-actions-changed", {
      bubbles: false,
      composed: false
    }));
  }

  public startRename(id: DocumentId, errorMessage?: string): void {
    const row = this._listEl.querySelector<HTMLLIElement>(`.list-item[data-doc-id="${CSS.escape(id.toString())}"]`);
    if (!row) {
      return;
    }
    this._startRename(row, errorMessage);
  }

  private _handleListClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT") return;
    const btn = target?.closest("[data-action]") as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.action;
    if (!action) return;

    if (action === "toggle-folder") {
      const folderPath = btn.dataset.folderPath;
      if (!folderPath) return;
      this._toggleFolder(folderPath);
      return;
    }

    const docId = btn.dataset.docId;
    if (!docId) return;

    switch (action) {
      case "select":
        this.dispatchEvent(new CustomEvent("select", {
          detail: { id: docId },
          bubbles: true,
          composed: true,
        }));
        break;
      case "rename": {
        const row = btn.closest(".list-item") as HTMLLIElement | null;
        if (row) this._startRename(row);
        break;
      }
      case "delete":
        this.dispatchEvent(new CustomEvent("delete", {
          detail: { id: docId },
          bubbles: true,
          composed: true,
        }));
        break;
      case "export":
        this.dispatchEvent(new CustomEvent("export", {
          detail: { id: docId },
          bubbles: true,
          composed: true,
        }));
        break;
      case "duplicate":
        this.dispatchEvent(new CustomEvent("duplicate", {
          detail: { id: docId },
          bubbles: true,
          composed: true,
        }));
        break;
    }
  };

  private _handleAddClick = (): void => {
    this.dispatchEvent(new CustomEvent("create", {
      bubbles: true,
      composed: true
    }));
  };

  private _toggleFolder(folderPath: string): void {
    if (this._collapsedFolders.has(folderPath)) {
      this._collapsedFolders.delete(folderPath);
    } else {
      this._collapsedFolders.add(folderPath);
    }
    this._render();
  }

  private _startRename(row: HTMLLIElement, errorMessage?: string): void {
    const docId = row.dataset.docId!;
    const titleBtn = row.querySelector(".list-item-title") as HTMLButtonElement;
    const actions = row.querySelector(".list-item-actions") as HTMLDivElement;
    const initialValue = row.dataset.docPath ?? titleBtn.textContent?.trim() ?? "";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.value = initialValue;

    let wrapper: HTMLDivElement | null = null;

    if (errorMessage) {
      wrapper = document.createElement("div");
      wrapper.style.flexGrow = "1";
      const errorSpan = document.createElement("span");
      errorSpan.className = "input-error";
      errorSpan.textContent = errorMessage;
      wrapper.append(input, errorSpan);
    }

    const cleanup = () => {
      input.removeEventListener("keydown", onKeydown);
      input.removeEventListener("blur", onBlur);
      actions.style.display = "";
    };

    const commit = () => {
      cleanup();
      const newTitle = input.value.trim() || "Untitled";
      titleBtn.textContent = newTitle;
      titleBtn.title = newTitle;
      if (wrapper) {
        wrapper.replaceWith(titleBtn);
      } else {
        input.replaceWith(titleBtn);
      }

      // TODO: Use typed custom events instead of relying on the event detail having the expected shape.
      this.dispatchEvent(new CustomEvent("rename", {
        detail: { fromId: docId, toFilepath: newTitle },
        bubbles: true,
        composed: true,
      }));
    };

    const cancel = () => {
      cleanup();
      if (wrapper) {
        wrapper.replaceWith(titleBtn);
      } else {
        input.replaceWith(titleBtn);
      }
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };

    const onBlur = () => commit();

    input.addEventListener("keydown", onKeydown);
    input.addEventListener("blur", onBlur);

    actions.style.display = "none";
    if (wrapper) {
      titleBtn.replaceWith(wrapper);
    } else {
      titleBtn.replaceWith(input);
    }
    input.select();
  }

  private _buildTree(documents: DocumentId[]): TreeNode[] {
    const root: FolderNode = { kind: "folder", name: "", path: "", children: [] };

    for (const doc of documents) {
      const segments = doc.path.toString().split("/").filter(Boolean);
      const filename = segments.pop() ?? doc.path.filename;
      let current = root;
      let accumulatedPath = "";
      for (const segment of segments) {
        accumulatedPath = `${accumulatedPath}/${segment}`;
        let next = current.children.find(
          child => child.kind === "folder" && child.name === segment
        ) as FolderNode | undefined;
        if (!next) {
          next = { kind: "folder", name: segment, path: accumulatedPath, children: [] };
          current.children.push(next);
        }
        current = next;
      }
      current.children.push({ kind: "file", id: doc, name: filename });
    }

    this._sortTree(root);
    return root.children;
  }

  private _sortTree(folder: FolderNode): void {
    folder.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of folder.children) {
      if (child.kind === "folder") this._sortTree(child);
    }
  }

  private _makeFolderRow(folder: FolderNode, depth: number): HTMLLIElement {
    const isCollapsed = this._collapsedFolders.has(folder.path);
    const row = document.createElement("li");
    row.className = "action-item list-item list-folder";
    row.dataset.folderPath = folder.path;
    row.style.setProperty("--depth", String(depth));
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-expanded", isCollapsed ? "false" : "true");

    const titleBtn = document.createElement("div");
    titleBtn.className = "list-item-title list-folder-title";
    titleBtn.dataset.folderPath = folder.path;
    titleBtn.dataset.action = "toggle-folder";
    titleBtn.title = folder.name;
    const chevronClass = isCollapsed ? "codicon-chevron-right" : "codicon-chevron-down";
    titleBtn.innerHTML = `<i class="codicon ${chevronClass}"></i><span>${folder.name}</span>`;

    row.append(titleBtn);
    return row;
  }

  private _makeItemRow(node: FileNode, depth: number): HTMLLIElement {
    const documentId = node.id;
    const row = document.createElement("li");
    const isActive = this._activeId ? documentId.equals(this._activeId) : false;
    const isDirty = this._dirtyIds.has(documentId.toString());
    row.className = `action-item list-item${isActive ? " active" : ""}${isDirty ? " dirty" : ""}`;
    row.dataset.docId = documentId.toString();
    // Strip leading slash so users editing the rename input see a path they can simply edit.
    row.dataset.docPath = documentId.path.toString().replace(/^\//, "");
    row.style.setProperty("--depth", String(depth));
    row.setAttribute("role", "treeitem");

    const titleBtn = document.createElement("div");
    titleBtn.className = "list-item-title";
    titleBtn.classList.toggle("highlight", isDirty);
    titleBtn.dataset.docId = documentId.toString();
    titleBtn.dataset.action = "select";
    titleBtn.title = node.name;
    titleBtn.textContent = node.name;

    const actions = document.createElement("div");
    actions.className = "list-item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "action-item";
    renameBtn.dataset.docId = documentId.toString();
    renameBtn.dataset.action = "rename";
    renameBtn.title = "Rename";
    renameBtn.innerHTML = `<i class="codicon codicon-rename"></i>`;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-item";
    deleteBtn.dataset.docId = documentId.toString();
    deleteBtn.dataset.action = "delete";
    deleteBtn.title = "Delete";
    deleteBtn.innerHTML = `<i class="codicon codicon-trash"></i>`;

    actions.append(renameBtn, deleteBtn);
    row.append(titleBtn, actions);
    return row;
  }

  private _appendNodes(nodes: TreeNode[], depth: number): void {
    for (const node of nodes) {
      if (node.kind === "folder") {
        this._listEl.appendChild(this._makeFolderRow(node, depth));
        if (!this._collapsedFolders.has(node.path)) {
          this._appendNodes(node.children, depth + 1);
        }
      } else {
        this._listEl.appendChild(this._makeItemRow(node, depth));
      }
    }
  }

  private _render(): void {
    while (this._listEl.firstChild){
      this._listEl.removeChild(this._listEl.firstChild);
    }

    const empty = this.querySelector(".empty") as HTMLDivElement;
    if (this._documents.length === 0) {
      empty.style.display = "";
      this._listEl.style.display = "none";
      return;
    }

    empty.style.display = "none";
    this._listEl.style.display = "";
    const tree = this._buildTree(this._documents);
    this._appendNodes(tree, 0);
  }
}
