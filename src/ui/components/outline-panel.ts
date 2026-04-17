// <outline-panel> WebComponent
import { DocumentOutline } from "../lib/document/document-outline";
import { BaseHtmlElement } from "./base-html-element";

export class DocumentOutlinePanel extends BaseHtmlElement {

  private _outlineElement: HTMLDivElement;
  private _outline: DocumentOutline | undefined;

  constructor() {
    super();
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

  .outline {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding-right: 2px;
  }

  .item {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--output-text-color);
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--font-family);
    font-size: 0.85rem;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.85;
  }

  .item:hover {
    background: rgba(255, 255, 255, 0.06);
    opacity: 1;
  }

  .action-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--output-text-color);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    opacity: 0.6;
  }

  .action-item:hover {
    opacity: 1;
  }

  .empty {
    font-size: 0.85rem;
    opacity: 0.5;
    padding: 4px 8px;
  }
</style>
<div class="header">
  <div class="title">Outline</div>
</div>
<div class="outline" role="list"></div>
    `;
    this._outlineElement = this.shadowRoot!.querySelector(".outline") as HTMLDivElement;
  }

  connectedCallback(): void {
    this._outlineElement.addEventListener("click", this._handleClick);
  }

  disconnectedCallback(): void {
    this._outlineElement.removeEventListener("click", this._handleClick);
  }

  setDocument(outline: DocumentOutline): void {
    this._outline = outline;
    this._render();
  }

  private _handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest("button[data-section]") as HTMLButtonElement | null;
    if (!btn) return;
  };

  private _render(): void {
    if (!this._outline || this._outline.length === 0) {
      this._outlineElement.innerHTML = `<div class="empty">No headings.</div>`;
      return;
    }
    this._outlineElement.innerHTML = "";

    for (const section of this._outline) {

      const sectionItem = document.createElement("div");
      
      const btn = document.createElement("button");
      btn.className = "item";
      btn.style.paddingLeft = `${section.sectionLevel * 14 + 8}px`;
      btn.setAttribute("data-level", String(section.sectionLevel));
      btn.setAttribute("data-section", section.sectionTitleId);
      btn.setAttribute("role", "listitem");
      btn.title = section.sectionTitle;
      btn.textContent = section.sectionTitle;
      sectionItem.appendChild(btn);

      // Add delete button.
      const delBtn = document.createElement("button");
      delBtn.className = "action-item";
      delBtn.style.opacity = "0.6";
      delBtn.setAttribute("data-level", String(section.sectionLevel));
      delBtn.setAttribute("data-delete", section.sectionTitleId);
      delBtn.setAttribute("role", "listitem");
      delBtn.title = `Delete section "${section.sectionTitle}"`;
      delBtn.innerHTML = `<span class="codicon codicon-trash"></span>`;
      sectionItem.appendChild(delBtn);

      // Add decrease and increase button.
      const reduceLevelBtn = document.createElement("button");
      reduceLevelBtn.className = "action-item";
      reduceLevelBtn.style.opacity = "0.6";
      reduceLevelBtn.setAttribute("data-level", String(section.sectionLevel));
      reduceLevelBtn.setAttribute("data-reduce", section.sectionTitleId);
      reduceLevelBtn.setAttribute("role", "listitem");
      reduceLevelBtn.title = `Reduce level of section "${section.sectionTitle}"`;
      reduceLevelBtn.innerHTML = `<span class="codicon codicon-arrow-left"></span>`;
      sectionItem.appendChild(reduceLevelBtn);

      const increaseLevelBtn = document.createElement("button");
      increaseLevelBtn.className = "action-item";
      increaseLevelBtn.style.opacity = "0.6";
      increaseLevelBtn.setAttribute("data-level", String(section.sectionLevel));
      increaseLevelBtn.setAttribute("data-increase", section.sectionTitleId);
      increaseLevelBtn.setAttribute("role", "listitem");
      increaseLevelBtn.title = `Increase level of section "${section.sectionTitle}"`;
      increaseLevelBtn.innerHTML = `<span class="codicon codicon-arrow-right"></span>`;
      sectionItem.appendChild(increaseLevelBtn);

      // TODO: Support dragging sections up and down to re-order them.

      this._outlineElement.appendChild(sectionItem);

    }
  }
}
