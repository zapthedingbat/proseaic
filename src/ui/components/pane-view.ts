import { BaseHtmlElement } from "./base-html-element.js";

// <ui-pane-view> WebComponent
//
// A flex column container that stacks ui-pane children vertically.
// Expanding panes share available space; collapsed panes shrink to their header height.
export class UiPaneView extends BaseHtmlElement {
  constructor() {
    super();
    this.shadowRoot!.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    gap: var(--gap, 4px);
    height: 100%;
    min-height: 0;
  }
</style>
<slot></slot>
`;
  }
}

if (!customElements.get("ui-pane-view")) {
  customElements.define("ui-pane-view", UiPaneView);
}
