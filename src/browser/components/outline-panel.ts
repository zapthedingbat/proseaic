// <outline-panel> WebComponent
import { DocumentOutline } from "../lib/document/document-outline";
import { BaseHtmlElement } from "./base-html-element";

export class DocumentOutlinePanel extends BaseHtmlElement {

  private _outlineElement!: HTMLUListElement;
  private _outline: DocumentOutline | undefined;

  constructor() {
    super();
  }

  connectedCallback(): void {
    if (!this._outlineElement) {
      this.innerHTML = `
<style>
  .outline-list {
    margin: var(--gap);
  }

  .list-item {
    gap: var(--gap);
  }

  .list-item-title {
    flex: 1;
    min-width: 0;
    padding-left: var(--outline-indent, 8px);
    cursor: pointer;
  }

  .list-item-title:hover {
    opacity: 1;
  }

  .cover.empty {
    font-size: 0.85rem;
    opacity: 0.5;
  }

  .list-item-title,
  .list-item-actions {
    white-space: nowrap;
  }
</style>
<div class="panel">
  <ul class="outline-list list" role="list"></ul>
  <div class="cover empty" aria-hidden="true">No headings.</div>
</div>
      `;
      this._outlineElement = this.querySelector(".outline-list") as HTMLUListElement;
      this._render();
    }
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
    const btn = target?.closest("[data-action][data-section]") as HTMLElement | null;
    if (!btn) return;

    const sectionId = btn.dataset.section;
    const action = btn.dataset.action;
    if (!sectionId || !action) return;

    this.dispatchEvent(new CustomEvent(action, {
      detail: { sectionId },
      bubbles: true,
      composed: true,
    }));
  };

  private _render(): void {
    const empty = this.querySelector(".empty") as HTMLDivElement;
    if (!this._outline || this._outline.length === 0) {
      empty.style.display = "";
      this._outlineElement.style.display = "none";
      this._outlineElement.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    this._outlineElement.style.display = "";
    this._outlineElement.innerHTML = "";

    for (const section of this._outline) {

      const sectionItem = document.createElement("li");
      sectionItem.className = "action-item list-item";
      sectionItem.style.setProperty("--outline-indent", `${section.sectionLevel * 14 + 8}px`);

      const title = document.createElement("div");
      title.className = "list-item-title";
      title.setAttribute("data-level", String(section.sectionLevel));
      title.setAttribute("data-section", section.sectionTitleId);
      title.setAttribute("data-action", "select");
      title.title = section.sectionTitle;
      title.textContent = section.sectionTitle;

      const actions = document.createElement("div");
      actions.className = "list-item-actions";

      const delBtn = document.createElement("button");
      delBtn.className = "action-item";
      delBtn.setAttribute("data-level", String(section.sectionLevel));
      delBtn.setAttribute("data-section", section.sectionTitleId);
      delBtn.setAttribute("data-action", "delete");
      delBtn.type = "button";
      delBtn.title = `Delete section "${section.sectionTitle}"`;
      delBtn.innerHTML = `<span class="codicon codicon-trash"></span>`;

      const reduceLevelBtn = document.createElement("button");
      reduceLevelBtn.className = "action-item";
      reduceLevelBtn.setAttribute("data-level", String(section.sectionLevel));
      reduceLevelBtn.setAttribute("data-section", section.sectionTitleId);
      reduceLevelBtn.setAttribute("data-action", "decrease-level");
      reduceLevelBtn.type = "button";
      reduceLevelBtn.title = `Reduce level of section "${section.sectionTitle}"`;
      reduceLevelBtn.innerHTML = `<span class="codicon codicon-arrow-left"></span>`;

      const increaseLevelBtn = document.createElement("button");
      increaseLevelBtn.className = "action-item";
      increaseLevelBtn.setAttribute("data-level", String(section.sectionLevel));
      increaseLevelBtn.setAttribute("data-section", section.sectionTitleId);
      increaseLevelBtn.setAttribute("data-action", "increase-level");
      increaseLevelBtn.type = "button";
      increaseLevelBtn.title = `Increase level of section "${section.sectionTitle}"`;
      increaseLevelBtn.innerHTML = `<span class="codicon codicon-arrow-right"></span>`;

      actions.append(reduceLevelBtn, increaseLevelBtn, delBtn);
      sectionItem.append(title, actions);

      // TODO: Support dragging sections up and down to re-order them.
      this._outlineElement.appendChild(sectionItem);
    }
  }
}
