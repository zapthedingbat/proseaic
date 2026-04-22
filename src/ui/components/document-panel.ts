import { DocumentId } from "../lib/document/document-service.js";
import { BaseHtmlElement } from "./base-html-element";
import { PaneAction } from "./pane.js";

// <document-panel> WebComponent
export class DocumentPanel extends BaseHtmlElement {
  private _listEl!: HTMLUListElement;
  private _documents: Array<DocumentId>;
  private _activeId: DocumentId | null;
  private _dirtyIds: Set<string>;

  constructor() {
    super();
    this._documents = [];
    this._activeId = null;
    this._dirtyIds = new Set();
  }

  connectedCallback(): void {
    if (!this._listEl) {
      this.innerHTML = `
<div class="panel">
  <ul class="document-list list" role="list"></ul>
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

  public startRename(id: DocumentId): void {
    const row = this._listEl.querySelector<HTMLLIElement>(`.list-item[data-doc-id="${CSS.escape(id.toString())}"]`);
    if (!row) {
      return;
    }
    this._startRename(row);
  }

  private _handleListClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT") return;
    const btn = target?.closest("[data-action]") as HTMLElement | null;
    if (!btn) return;
    const docId = btn.dataset.docId;
    const action = btn.dataset.action;
    if (!docId || !action) return;

    switch (action) {
      case "select":
        this.dispatchEvent(new CustomEvent("select", {
          detail: { id: docId },
          bubbles: true,
          composed: true,
        }));
        break;
      case "rename":
        const row = btn.closest(".list-item") as HTMLLIElement | null;
        if (row) this._startRename(row);
        break;
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

  private _startRename(row: HTMLLIElement): void {
    const docId = row.dataset.docId!;
    const titleBtn = row.querySelector(".list-item-title") as HTMLButtonElement;
    const actions = row.querySelector(".list-item-actions") as HTMLDivElement;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.value = titleBtn.textContent?.trim() ?? "";

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
      input.replaceWith(titleBtn);

      // TODO: Use typed custom events instead of relying on the event detail having the expected shape.
      this.dispatchEvent(new CustomEvent("rename", {
        detail: { fromId: docId, toFilepath: newTitle },
        bubbles: true,
        composed: true,
      }));
    };

    const cancel = () => {
      cleanup();
      input.replaceWith(titleBtn);
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };

    const onBlur = () => commit();

    input.addEventListener("keydown", onKeydown);
    input.addEventListener("blur", onBlur);

    actions.style.display = "none";
    titleBtn.replaceWith(input);
    input.select();
  }

  private _makeItemRow(documentId: DocumentId): HTMLLIElement {
    const row = document.createElement("li");
    const isActive = this._activeId ? documentId.equals(this._activeId) : false;
    const isDirty = this._dirtyIds.has(documentId.toString());
    row.className = `action-item list-item${isActive ? " active" : ""}${isDirty ? " dirty" : ""}`;
    row.dataset.docId = documentId.toString();

    const titleBtn = document.createElement("div");
    titleBtn.className = "list-item-title";
    titleBtn.classList.toggle("highlight", isDirty);
    titleBtn.dataset.docId = documentId.toString();
    titleBtn.dataset.action = "select";
    titleBtn.title = documentId.path.filename;
    titleBtn.textContent = documentId.path.filename;

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

  private _render(): void {
    while (this._listEl.firstChild){
      this._listEl.removeChild(this._listEl.firstChild);
    }

    const empty = this.querySelector(".empty") as HTMLDivElement;
    if (this._documents.length === 0) {
      empty.style.display = "";
      this._listEl.style.display = "none";
    } else {
      empty.style.display = "none";
      this._listEl.style.display = "";
      for (const doc of this._documents) {
        this._listEl.appendChild(this._makeItemRow(doc));
      }
    }
  }
}
