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

  private _provider: PaneActionProvider | null = null;
  private _childObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Capture pre-existing children (e.g. panel components from HTML) before innerHTML clears them.
    const children = Array.from(this.childNodes);

    this.innerHTML = `
<div class="header">
  <button class="twisty" type="button" aria-label="Toggle pane">
    <i class="twisty-icon codicon codicon-chevron-down"></i>
  </button>
  <span class="title"></span>
  <div class="actions" part="actions"></div>
</div>
<div class="body">
  <div class="pane-body-content"></div>
</div>
`;

    // Move captured children into the body content area.
    const bodyContent = this._bodyContent;
    for (const child of children) {
      bodyContent.appendChild(child);
    }

    // Apply title from attribute (attributeChangedCallback may fire before connectedCallback).
    const title = this.getAttribute("title");
    if (title) {
      this._titleEl.textContent = title;
    }

    const twisty = this.querySelector(".twisty") as HTMLButtonElement;
    twisty.addEventListener("click", this._handleTwistyClick);
    this._actionsEl.addEventListener("click", this._handleActionClick);

    this._childObserver = new MutationObserver(this._handleContentChange);
    this._childObserver.observe(bodyContent, { childList: true });

    this._refreshProvider();
    this._renderActions();
  }

  disconnectedCallback(): void {
    const twisty = this.querySelector(".twisty") as HTMLButtonElement;
    twisty?.removeEventListener("click", this._handleTwistyClick);
    this._actionsEl?.removeEventListener("click", this._handleActionClick);
    this._childObserver?.disconnect();
    this._childObserver = null;
    this._detachProviderListener();
  }

  attributeChangedCallback(_name: string, _old: string | null, value: string | null): void {
    switch (_name) {
      case "title":
        // _titleEl may be null if this fires before connectedCallback; title is also applied there.
        if (this._titleEl) this._titleEl.textContent = value ?? "";
        break;
    }
  }

  protected get _bodyContent(): HTMLElement {
    return this.querySelector(".pane-body-content") as HTMLElement;
  }

  protected get _actionsEl(): HTMLElement {
    return this.querySelector(".actions") as HTMLElement;
  }

  protected get _titleEl(): HTMLElement {
    return this.querySelector(".title") as HTMLElement;
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
    this._applyCollapsed(collapsed);
  };

  private _handleContentChange = (): void => {
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
    const children = Array.from(this._bodyContent?.children ?? []);
    const nextProvider = (children[0] ?? null) as PaneActionProvider | null;
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