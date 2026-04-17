import { BaseHtmlElement } from "./base-html-element.js";

// <ui-pane> WebComponent
//
// A collapsible pane with a header bar containing a twisty toggle, title text,
// and an optional "actions" slot. The body slot holds the pane content.
//
// Collapsed state priority: localStorage > `collapsed` attribute.
// State is persisted to localStorage keyed on the `title` attribute.
export class UiPane extends BaseHtmlElement {
  static observedAttributes = ["title"];

  private _twisty: HTMLButtonElement;
  private _titleEl: HTMLElement;

  constructor() {
    super();
    this.shadowRoot!.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }
  :host([collapsed]) {
    flex: 0 0 auto;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
    height: 28px;
    flex-shrink: 0;
    user-select: none;
  }
  .twisty {
    border: none;
    background: transparent;
    color: var(--text-color, inherit);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    flex-shrink: 0;
    border-radius: var(--ui-border-radius);
  }
  .twisty:hover { opacity: 1; background: rgba(255,255,255,0.08); }

  .twisty-icon {
    transition: transform 0.2s ease;
  }
  
  :host([collapsed]) .twisty-icon {
    transform: rotate(-90deg);
  }

  .title {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  :host([collapsed]) .body {
    display: none;
  }
</style>
<div class="header">
  <button class="twisty" type="button" aria-label="Toggle pane">
    <i class="twisty-icon codicon codicon-chevron-down"></i>
  </button>
  <span class="title"></span>
  <div class="actions">
    <slot name="actions"></slot>
  </div>
</div>
<div class="body">
  <slot></slot>
</div>
`;
    this._twisty = this.shadowRoot!.querySelector(".twisty")!;
    this._titleEl = this.shadowRoot!.querySelector(".title")!;
  }

  connectedCallback(): void {
    this._twisty.addEventListener("click", this._handleTwistyClick);
    this._applyCollapsed(this._loadCollapsed());
    this._titleEl.textContent = this.getAttribute("title") ?? "";
  }

  disconnectedCallback(): void {
    this._twisty.removeEventListener("click", this._handleTwistyClick);
  }

  attributeChangedCallback(_name: string, _old: string | null, value: string | null): void {
    this._titleEl.textContent = value ?? "";
  }

  private get _storageKey(): string {
    return `ui-pane:${this.getAttribute("title") ?? ""}:collapsed`;
  }

  private _loadCollapsed(): boolean {
    const saved = localStorage.getItem(this._storageKey);
    if (saved !== null) return saved === "true";
    return this.hasAttribute("collapsed");
  }

  private _applyCollapsed(collapsed: boolean): void {
    if (collapsed) {
      this.setAttribute("collapsed", "");
    } else {
      this.removeAttribute("collapsed");
    }
  }

  private _handleTwistyClick = (): void => {
    const collapsed = !this.hasAttribute("collapsed");
    localStorage.setItem(this._storageKey, String(collapsed));
    this._applyCollapsed(collapsed);
  };
}
