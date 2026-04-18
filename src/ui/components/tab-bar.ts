import { BaseHtmlElement } from "./base-html-element";

type TabState = {
  id: string;
  title: string;
};

// <ui-tab-bar> WebComponent
export class UiTabBar extends BaseHtmlElement {
  private _tabs: TabState[];
  private _activeId: string | null;
  private _dirtyId: string | null;

  constructor() {
    super();
    this._tabs = [];
    this._activeId = null;
    this._dirtyId = null;

    this.shadowRoot!.innerHTML = `<div class="tabs" role="tablist"></div>`;
  }
  
  connectedCallback(): void {
    this.shadowRoot!.addEventListener("click", this._onTabClick);
    this.shadowRoot!.addEventListener("click", this._onTabCloseClick);
    this.shadowRoot!.addEventListener("auxclick", this._onTabAuxClick);
    this.shadowRoot!.addEventListener("keydown", this._onTabKeyDown);
    this._render();
  }

  disconnectedCallback(): void {
    this.shadowRoot!.removeEventListener("click", this._onTabClick);
    this.shadowRoot!.removeEventListener("click", this._onTabCloseClick);
    this.shadowRoot!.removeEventListener("auxclick", this._onTabAuxClick);
    this.shadowRoot!.removeEventListener("keydown", this._onTabKeyDown);
  }

  setTabs(tabs: TabState[], activeId: string | null, dirtyId: string | null = null): void {
    this._tabs = Array.isArray(tabs) ? tabs : [];
    this._activeId = activeId;
    this._dirtyId = dirtyId;
    this._render();
  }

  private _onTabClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-tab-close-id]")) {
      return;
    }
    const tabEl = target.closest<HTMLElement>("[data-tab-id]");
    if (tabEl) {
      this.dispatchEvent(new CustomEvent("select", {
        detail: { id: tabEl.dataset.tabId },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private _onTabCloseClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const closeButton = target.closest<HTMLElement>("[data-tab-close-id]");
    if (!closeButton) {
      return;
    }

    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("close", {
      detail: { id: closeButton.dataset.tabCloseId },
      bubbles: true,
      composed: true,
    }));
  }

  private _onTabAuxClick = (event: MouseEvent): void => {
    if (event.button !== 1) {
      return;
    }

    const target = event.target as HTMLElement;
    const closeTarget = target.closest<HTMLElement>("[data-tab-close-id]");
    if (closeTarget) {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent("close", {
        detail: { id: closeTarget.dataset.tabCloseId },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    const tabEl = target.closest<HTMLElement>("[data-tab-id]");
    if (!tabEl) {
      return;
    }

    event.preventDefault();
    this.dispatchEvent(new CustomEvent("close", {
      detail: { id: tabEl.dataset.tabId },
      bubbles: true,
      composed: true,
    }));
  }

  private _onTabKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    const tabEl = target.closest<HTMLElement>("[data-tab-id]");
    if (!tabEl) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent("select", {
        detail: { id: tabEl.dataset.tabId },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent("close", {
        detail: { id: tabEl.dataset.tabId },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private _render(): void {
    const tabsRoot = this.shadowRoot!.querySelector(".tabs") as HTMLDivElement;
    tabsRoot.textContent = "";

    for (const tab of this._tabs) {
      const isActive = tab.id === this._activeId;
      const isDirty = tab.id === this._dirtyId;
      const tabElement = document.createElement("div");
      tabElement.className = `tab${isActive ? " active" : ""}`;
      tabElement.dataset.tabId = tab.id;
      tabElement.dataset.dirty = isDirty ? "true" : "false";
      tabElement.role = "tab";
      tabElement.ariaSelected = isActive ? "true" : "false";
      tabElement.tabIndex = 0;
      tabElement.title = tab.title;
      
      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.title;

      const dirtyIndicator = document.createElement("span");
      dirtyIndicator.className = "dirty-indicator icon codicon codicon-circle-filled";
      dirtyIndicator.ariaHidden = "true";

      const closeButton = document.createElement("span");
      closeButton.className = "action-item icon close codicon codicon-close";
      closeButton.dataset.tabCloseId = tab.id;
      closeButton.title = `Close ${tab.title}`;
      closeButton.role = "button";
      closeButton.tabIndex = -1;

      tabElement.append(title, dirtyIndicator, closeButton);

      tabsRoot.appendChild(tabElement);
    }
  }

}
