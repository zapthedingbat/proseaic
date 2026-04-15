// <document-panel> WebComponent
export class DocumentPanel extends HTMLElement {
  private list: HTMLDivElement;
  private addButton: HTMLButtonElement;
  private _documents: Array<{ id: string; title?: string }>;
  private _activeId: string | null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
<link rel="stylesheet" href="/codicon.css" />
<style>
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-radius: var(--input-radius);
    border: var(--input-border);
    padding: var(--gap);
    color: var(--output-text-color);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: calc(var(--gap) * 2);
    font-size: 0.95rem;
  }

  .title {
    font-weight: 600;
    opacity: 0.9;
  }

  .header .button {
    border: none;
    background: transparent;
    color: var(--output-text-color);
    cursor: pointer;
    font-size: 1rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    overflow-y: auto;
    padding-right: 2px;
  }

  .item {
    display: flex;
    align-items: center;
    border-radius: 6px;
    overflow: hidden;
  }

  .item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .item.active {
    background: rgba(255, 255, 255, 0.08);
  }

  .item-title {
    flex: 1;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--output-text-color);
    padding: 6px 8px;
    cursor: pointer;
    font-family: var(--font-family);
    font-size: inherit;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0;
    pointer-events: none;
    padding-right: 4px;
    gap: 2px;
  }

  .item:hover .item-actions {
    opacity: 1;
    pointer-events: auto;
  }

  .action-btn {
    border: none;
    background: transparent;
    color: var(--output-text-color);
    cursor: pointer;
    padding: 3px 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    font-size: 0.9rem;
  }

  .action-btn:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
  }

  .action-btn.delete-btn:hover {
    color: #ff8080;
    opacity: 1;
  }

  .rename-input {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.06);
    color: var(--output-text-color);
    font-family: var(--font-family);
    font-size: inherit;
    outline: none;
  }

  .rename-input:focus {
    border-color: rgba(255, 255, 255, 0.5);
  }

  .empty {
    font-size: 0.85rem;
    opacity: 0.7;
    padding: 6px 8px;
  }
</style>
<div class="header">
  <div class="title">Documents</div>
  <button class="button add" type="button" title="New document"><i class="codicon codicon-new-file"></i></button>
</div>
<div class="list" role="list"></div>
    `;

    this.list = this.shadowRoot!.querySelector(".list") as HTMLDivElement;
    this.addButton = this.shadowRoot!.querySelector(".add") as HTMLButtonElement;
    this._documents = [];
    this._activeId = null;
  }

  connectedCallback(): void {
    this.list.addEventListener("click", this._handleListClick);
    this.addButton.addEventListener("click", this._handleAddClick);
  }

  disconnectedCallback(): void {
    this.list.removeEventListener("click", this._handleListClick);
    this.addButton.removeEventListener("click", this._handleAddClick);
  }

  setDocuments(documents: Array<{ id: string; title?: string }>, activeId: string | null): void {
    this._documents = Array.isArray(documents) ? documents : [];
    this._activeId = activeId || null;
    this._render();
  }

  private _handleListClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT") return;
    const btn = target?.closest("button[data-action]") as HTMLButtonElement | null;
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
      const row = btn.closest(".item") as HTMLDivElement | null;
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

  private _startRename(row: HTMLDivElement): void {
    const docId = row.dataset.docId!;
    const titleBtn = row.querySelector(".item-title") as HTMLButtonElement;
    const actions = row.querySelector(".item-actions") as HTMLDivElement;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "rename-input";
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
        detail: { id: docId, title: newTitle },
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

  private _makeItemRow(docId: string, title: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = `item${docId === this._activeId ? " active" : ""}`;
    row.dataset.docId = docId;

    const titleBtn = document.createElement("button");
    titleBtn.className = "item-title";
    titleBtn.dataset.docId = docId;
    titleBtn.dataset.action = "select";
    titleBtn.title = title;
    titleBtn.textContent = title;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "action-btn";
    renameBtn.dataset.docId = docId;
    renameBtn.dataset.action = "rename";
    renameBtn.title = "Rename";
    renameBtn.innerHTML = `<i class="codicon codicon-rename"></i>`;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-btn delete-btn";
    deleteBtn.dataset.docId = docId;
    deleteBtn.dataset.action = "delete";
    deleteBtn.title = "Delete";
    deleteBtn.innerHTML = `<i class="codicon codicon-trash"></i>`;

    actions.append(renameBtn, deleteBtn);
    row.append(titleBtn, actions);
    return row;
  }

  private _render(): void {
    while (this.list.firstChild) this.list.removeChild(this.list.firstChild);

    if (this._documents.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No documents yet.";
      this.list.appendChild(empty);
      return;
    }

    for (const doc of this._documents) {
      this.list.appendChild(this._makeItemRow(doc.id, doc.title || "Untitled"));
    }
  }
}
