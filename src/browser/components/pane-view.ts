import { BaseHtmlElement } from "./base-html-element.js";

// <ui-pane-view> WebComponent
//
// A flex column container that stacks ui-pane children vertically.
// Expanding panes share available space; collapsed panes shrink to their header height.
// Layout is provided by the .pane-view class in app.css and ui-pane styles in app.css.
export class UiPaneView extends BaseHtmlElement {}

if (!customElements.get("ui-pane-view")) {
  customElements.define("ui-pane-view", UiPaneView);
}
