import { BaseHtmlElement } from "./base-html-element";

const PLATFORM_KEYS: Array<{ label: string; storageKey: string; placeholder: string }> = [
  { label: "Anthropic",  storageKey: "anthropic_api_key", placeholder: "sk-ant-…"  },
  { label: "OpenAI",     storageKey: "openai_api_key",    placeholder: "sk-…"       },
  { label: "Gemini",     storageKey: "gemini_api_key",    placeholder: "AIza…"      },
  { label: "Mistral",    storageKey: "mistral_api_key",   placeholder: ""            },
];

const css = `
ui-settings-panel {
  background: #252526;
  border: 1px solid #555;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  color: #ccc;
  font-family: var(--font-family, system-ui, sans-serif);
  font-size: 13px;
  padding: 0;
  width: 400px;
  max-width: calc(100vw - 32px);
  margin: auto;
}

ui-settings-panel::backdrop {
  background: rgba(0, 0, 0, 0.45);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #3a3a3a;
}

.panel-title {
  font-size: 0.95rem;
  font-weight: 600;
  opacity: 0.9;
}

.close-btn {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
}

.close-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #ccc;
}

.panel-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field label {
  font-size: 0.8rem;
  opacity: 0.7;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.input-row {
  display: flex;
  gap: 4px;
}

.field input[type="password"],
.field input[type="text"] {
  flex: 1;
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  font-family: monospace;
  font-size: 0.85rem;
  min-width: 0;
  padding: 5px 8px;
}

.field input:focus {
  border-color: #08f;
  outline: none;
}

.field input.saved {
  border-color: #4a4;
  transition: border-color 0.15s;
}

.show-btn {
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 5px 8px;
  white-space: nowrap;
}

.show-btn:hover {
  background: #3a3a3a;
  color: #ccc;
}
`;

export class SettingsPanel extends BaseHtmlElement {
  constructor() {
    super();
  }

  connectedCallback(): void {
    if (!this.querySelector(".panel-header")) {
      this._render();
    }
    // Reload values from storage each time the popover is shown
    this.addEventListener("toggle", (e: Event) => {
      if ((e as ToggleEvent).newState === "open") {
        this._loadFromStorage();
      }
    });

    this.querySelector(".close-btn")!.addEventListener("click", () => {
      (this as HTMLElement & { hidePopover(): void }).hidePopover();
    });
  }

  private _render(): void {
    const fields = PLATFORM_KEYS.map(({ label, storageKey, placeholder }) => `
      <div class="field" data-key="${storageKey}">
        <label>${label}</label>
        <div class="input-row">
          <input type="password" autocomplete="off" spellcheck="false"
                 placeholder="${placeholder}"
                 data-storage-key="${storageKey}" />
          <button type="button" class="show-btn" data-storage-key="${storageKey}">Show</button>
        </div>
      </div>
    `).join("");

    this.innerHTML = `
      <style>${css}</style>
      <div class="panel-header">
        <span class="panel-title">Settings</span>
        <button class="close-btn" type="button" title="Close">✕</button>
      </div>
      <div class="panel-body">
        ${fields}
      </div>
    `;

    // Wire up inputs and show/hide toggles
    this.querySelectorAll<HTMLInputElement>("input[data-storage-key]").forEach(input => {
      input.addEventListener("change", () => this._save(input));
    });

    this.querySelectorAll<HTMLButtonElement>(".show-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.storageKey!;
        const input = this.querySelector<HTMLInputElement>(`input[data-storage-key="${key}"]`)!;
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        btn.textContent = isHidden ? "Hide" : "Show";
      });
    });
  }

  private _loadFromStorage(): void {
    this.querySelectorAll<HTMLInputElement>("input[data-storage-key]").forEach(input => {
      input.value = localStorage.getItem(input.dataset.storageKey!) ?? "";
      input.classList.remove("saved");
    });
  }

  private _save(input: HTMLInputElement): void {
    const key = input.dataset.storageKey!;
    const value = input.value.trim();

    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }

    // Brief visual confirmation
    input.classList.add("saved");
    setTimeout(() => input.classList.remove("saved"), 1200);

    this.dispatchEvent(new CustomEvent("settings-changed", {
      bubbles: true,
      composed: true,
      detail: { key, value },
    }));
  }
}
