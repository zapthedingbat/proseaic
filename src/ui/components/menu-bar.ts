// <menu-bar> WebComponent
export class MenuBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
<link rel="stylesheet" href="/codicon.css" />
<style>
  :host {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
    background-color: var(--menu-bar-bg);
    color: var(--menu-bar-text-color);
    height: 100%;
  }

  ::slotted(button) {
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

  ::slotted(button:hover) {
    background: rgba(255, 255, 255, 0.08);
    opacity: 1;
  }

  ::slotted(button:active) {
    background: rgba(255, 255, 255, 0.14);
  }

  ::slotted(.menu-bar-sep) {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 4px;
  }
</style>
<slot></slot>
`;
  }
}
