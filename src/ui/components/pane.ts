import { BaseHtmlElement } from "./base-html-element.js";

export type PaneAction = {
  id: string;
  title: string;
  icon?: string;
  className?: string;
};

type PaneActionProvider = Element & {
  getPaneActions?: () => PaneAction[];
  onPaneAction?: (actionId: string) => void;
};

// <ui-pane> WebComponent
//
// A collapsible pane shell with a standard header and slotted body content.
// Slotted body components can provide actions by implementing:
// - getPaneActions(): PaneAction[]
// - onPaneAction(actionId: string)
// and can request a refresh by dispatching "pane-actions-changed".
export class UiPane extends BaseHtmlElement {
  static observedAttributes = ["title"];

  private _twisty: HTMLButtonElement;
  private _titleEl: HTMLElement;
  private _actionsEl: HTMLElement;
  private _contentSlot: HTMLSlotElement;
  private _provider: PaneActionProvider | null = null;

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
  .twisty:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.08);
  }
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
  .actions .action-item {
    opacity: 0.7;
  }
  .actions .action-item:hover {
    opacity: 1;
  }
  .body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  #content-slot {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  #content-slot::slotted(*) {
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    overflow: hidden;
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
  <div class="actions" part="actions"></div>
</div>
<div class="body">
  <slot id="content-slot"></slot>
</div>
`;
    this._twisty = this.shadowRoot!.querySelector(".twisty") as HTMLButtonElement;
    this._titleEl = this.shadowRoot!.querySelector(".title") as HTMLElement;
    this._actionsEl = this.shadowRoot!.querySelector(".actions") as HTMLElement;
    this._contentSlot = this.shadowRoot!.querySelector("#content-slot") as HTMLSlotElement;
  }

  connectedCallback(): void {
    this._twisty.addEventListener("click", this._handleTwistyClick);
    this._contentSlot.addEventListener("slotchange", this._handleContentSlotChange);
    this._actionsEl.addEventListener("click", this._handleActionClick);
    this._applyCollapsed(this._loadCollapsed());
    this._titleEl.textContent = this.getAttribute("title") ?? "";
    this._refreshProvider();
    this._renderActions();
  }

  disconnectedCallback(): void {
    this._twisty.removeEventListener("click", this._handleTwistyClick);
    this._contentSlot.removeEventListener("slotchange", this._handleContentSlotChange);
    this._actionsEl.removeEventListener("click", this._handleActionClick);
    this._detachProviderListener();
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

  private _handleContentSlotChange = (): void => {
    this._refreshProvider();
    this._renderActions();
  };

  private _handleProviderActionsChanged = (): void => {
    this._renderActions();
  };

  private _detachProviderListener(): void {
    if (!this._provider) {
      return;
    }
    this._provider.removeEventListener("pane-actions-changed", this._handleProviderActionsChanged as EventListener);
  }

  private _refreshProvider(): void {
    const assigned = this._contentSlot.assignedElements({ flatten: true });
    const nextProvider = (assigned[0] ?? null) as PaneActionProvider | null;
    if (nextProvider === this._provider) {
      return;
    }
    this._detachProviderListener();
    this._provider = nextProvider;
    if (this._provider) {
      this._provider.addEventListener("pane-actions-changed", this._handleProviderActionsChanged as EventListener);
      const providerTag = this._provider.localName;
      customElements.whenDefined(providerTag).then(() => {
        // Re-render after upgrade so prototype methods like getPaneActions are available.
        if (this._provider?.localName === providerTag) {
          this._renderActions();
        }
      });
    }
  }

  private _renderActions(): void {
    this._actionsEl.innerHTML = "";
    const actions = this._provider?.getPaneActions?.() ?? [];
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = `action-item ${action.className ?? ""}`.trim();
      button.type = "button";
      button.title = action.title;
      button.dataset.actionId = action.id;
      button.innerHTML = action.icon ? `<i class="codicon ${action.icon}"></i>` : action.title;
      this._actionsEl.appendChild(button);
    }
  }

  private _handleActionClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button[data-action-id]") as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const actionId = button.dataset.actionId;
    if (!actionId) {
      return;
    }
    if (this._provider?.onPaneAction) {
      this._provider.onPaneAction(actionId);
      return;
    }
    this.dispatchEvent(new CustomEvent("pane-action", {
      detail: { actionId },
      bubbles: true,
      composed: true
    }));
  };
}

if (!customElements.get("ui-pane")) {
  customElements.define("ui-pane", UiPane);
}
