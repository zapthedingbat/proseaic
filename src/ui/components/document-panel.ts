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
          text-align: left;
          border: none;
          background: transparent;
          color: var(--output-text-color);
          padding: 6px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-family: var(--font-family);
        }

        .item.active {
          background: rgba(255, 255, 255, 0.08);
        }

        .empty {
          font-size: 0.85rem;
          opacity: 0.7;
          padding: 6px 8px;
        }
      </style>
      <div class="header">
        <div class="title">Documents</div>
        <button class="button add" type="button" title="New document">➕</button>
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
    const button = target?.closest("button[data-doc-id]") as HTMLButtonElement | null;
    if (!button) {
      return;
    }

    const docId = button.dataset.docId;
    if (!docId) {
      return;
    }

    this.dispatchEvent(new CustomEvent("select", {
      detail: { id: docId },
      bubbles: true,
      composed: true
    }));
  };

  private _handleAddClick = (): void => {
    this.dispatchEvent(new CustomEvent("create", {
      bubbles: true,
      composed: true
    }));
  };

  private _render(): void {
    if (!this.list) {
      return;
    }

    if (this._documents.length === 0) {
      this.list.innerHTML = `<div class="empty">No documents yet.</div>`;
      return;
    }

    this.list.innerHTML = this._documents.map(doc => {
      const isActive = doc.id === this._activeId;
      const activeClass = isActive ? "active" : "";
      const title = doc.title || "Untitled";
      return `<button class="item ${activeClass}" data-doc-id="${doc.id}">${title}</button>`;
    }).join("");
  }
}
