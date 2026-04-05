// <menu-bar> WebComponent
export class MenuBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--gap);
          background-color: var(--menu-bar-bg);
          color: var(--menu-bar-text-color);
        }
      </style>
      <slot></slot>
    `;
  }
}
