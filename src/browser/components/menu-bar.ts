import { BaseHtmlElement } from "./base-html-element";

// <menu-bar> WebComponent
export class MenuBar extends BaseHtmlElement {
  constructor() {
    super();
  }

  connectedCallback(): void {
    if (this.querySelector(".menu-bar")) {
      return;
    }

    this.innerHTML = `
<style>
  ui-menu-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
    background-color: var(--menu-bar-bg);
    color: var(--menu-bar-text-color);
    height: 100%;
  }

  ui-menu-bar .action-items {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  ui-menu-bar .action-items > button {
    background: transparent;
    border: none;
    color: var(--menu-bar-text-color);
    cursor: pointer;
    font-family: var(--font-family);
    font-size: 0.85rem;
    padding: 3px 10px;
    border-radius: var(--input-radius);
    opacity: 0.75;
    white-space: nowrap;
  }

  ui-menu-bar .action-items > button:hover {
    background: rgba(255, 255, 255, 0.08);
    opacity: 1;
  }

  ui-menu-bar .action-items > button:active {
    background: rgba(255, 255, 255, 0.14);
  }

  ui-menu-bar .action-items > button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  ui-menu-bar .action-items > .menu-bar-sep {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 4px;
  }

  ui-menu-bar .action-items > .app-icon {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    opacity: 0.95;
  }
</style>
<div class="menu-bar">
  <div class="action-items"></div>
</div>
`;
  }
}
