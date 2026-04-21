import { BaseHtmlElement } from "./base-html-element";
import { PaneAction } from "./pane.js";

// <document-panel> WebComponent
export class DocumentPanel extends BaseHtmlElement {
  private _listEl!: HTMLUListElement;
  private _documents: Array<{ id: string; title?: string }>;
  private _activeId: string | null;
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

  setDocuments(documents: Array<{ id: string; title?: string }>, activeId: string | null, dirtyIds: string[] = []): void {
    this._documents = Array.isArray(documents) ? documents : [];
    this._activeId = activeId || null;
    this._dirtyIds = new Set(dirtyIds);
    this._render();
    this.dispatchEvent(new CustomEvent("pane-actions-changed", {
      bubbles: false,
      composed: false
    }));
  }

  public startRename(id: string): void {
    const row = this._listEl.querySelector<HTMLLIElement>(`.list-item[data-doc-id="${CSS.escape(id)}"]`);
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

    if (action === "select") {
      this.dispatchEvent(new CustomEvent("select", {
        detail: { id: docId },
        bubbles: true,
        composed: true,
      }));
    } else if (action === "rename") {
      const row = btn.closest(".list-item") as HTMLLIElement | null;
      if (row) this._startRename(row);
    } else if (action === "delete") {
      this.dispatchEvent(new CustomEvent("delete", {
        detail: { id: docId },
        bubbles: true,
        composed: true,
      }));
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
      const doc = this._documents.find(d => d.id === docId);
      if (doc) doc.title = newTitle;
      titleBtn.textContent = newTitle;
      titleBtn.title = newTitle;
      input.replaceWith(titleBtn);
      this.dispatchEvent(new CustomEvent("rename", {
        detail: { fromId: docId, toId: newTitle },
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

  private _makeItemRow(docId: string, title: string): HTMLLIElement {
    const row = document.createElement("li");
    const isActive = docId === this._activeId;
    const isDirty = this._dirtyIds.has(docId);
    row.className = `action-item list-item${isActive ? " active" : ""}${isDirty ? " dirty" : ""}`;
    row.dataset.docId = docId;

    const titleBtn = document.createElement("div");
    titleBtn.className = "list-item-title";
    titleBtn.dataset.docId = docId;
    titleBtn.dataset.action = "select";
    titleBtn.title = isDirty ? `${title} (unsaved)` : title;
    titleBtn.textContent = isDirty ? `${title} *` : title;

    const actions = document.createElement("div");
    actions.className = "list-item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "action-item";
    renameBtn.dataset.docId = docId;
    renameBtn.dataset.action = "rename";
    renameBtn.title = "Rename";
    renameBtn.innerHTML = `<i class="codicon codicon-rename"></i>`;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-item";
    deleteBtn.dataset.docId = docId;
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
        this._listEl.appendChild(this._makeItemRow(doc.id, doc.title || "Untitled"));
      }
    }
  }
}
