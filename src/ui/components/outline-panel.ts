// <outline-panel> WebComponent

import { MdSection } from "../lib/markdown/markdown";

export class DocumentOutlinePanel extends HTMLElement {

  private _outlineElement: HTMLDivElement;
  private _rootSection: MdSection | undefined;

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

  .item[data-level="1"] {
    font-weight: 600;
    font-size: 0.9rem;
    opacity: 1;
  }

  .item[data-level="2"] {
    font-weight: 500;
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

  setDocument(rootMarkdownSection: MdSection): void {
    this._rootSection = rootMarkdownSection;
    this._render();
  }

  private _handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest("button[data-title]") as HTMLButtonElement | null;
    if (!btn) return;
    this.dispatchEvent(new CustomEvent("navigate", {
      detail: { title: btn.dataset.title, level: Number(btn.dataset.level) },
      bubbles: true,
      composed: true,
    }));
  };

  private _render(): void {
    if (!this._rootSection || this._rootSection.children.length === 0) {
      this._outlineElement.innerHTML = `<div class="empty">No headings.</div>`;
      return;
    }
    this._outlineElement.innerHTML = "";
    this._renderItems(this._outlineElement, this._rootSection, 0);
  }

  private _renderItems(container: HTMLElement, section: MdSection, depth: number): void {

    const title = section.headingLine?.raw || "Root";
    const level = section.level;
    
    const btn = document.createElement("button");
    btn.className = "item";
    btn.style.paddingLeft = `${depth * 14 + 8}px`;
    btn.setAttribute("data-level", String(level));
    btn.setAttribute("data-title", title);
    btn.setAttribute("role", "listitem");
    btn.title = title;
    btn.textContent = title;
    container.appendChild(btn);

    for (const item of section.children) {
      if (item.children.length > 0) {
        this._renderItems(container, item, depth + 1);
      }
    }
  }
}
