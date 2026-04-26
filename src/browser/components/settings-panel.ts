import { BaseHtmlElement } from "./base-html-element";
import { Model } from "../lib/models/model";
import { Configuration } from "../lib/configuration/configuration-service";

type PlatformConfig = {
  label: string;
  endpointKey: keyof Configuration;
  endpointPlaceholder: string;
  apiKeyKey: keyof Configuration;
  apiKeyPlaceholder: string;
  apiKeyOptional?: boolean;
};

const PLATFORMS: PlatformConfig[] = [
  { label: "Ollama",    endpointKey: "ai.platform.ollama.endpoint",    endpointPlaceholder: "http://localhost:11434",                  apiKeyKey: "ai.platform.ollama.api_key",    apiKeyPlaceholder: "",        apiKeyOptional: true },
  { label: "Anthropic", endpointKey: "ai.platform.anthropic.endpoint", endpointPlaceholder: "https://api.anthropic.com",               apiKeyKey: "ai.platform.anthropic.api_key", apiKeyPlaceholder: "sk-ant-…" },
  { label: "OpenAI",    endpointKey: "ai.platform.openai.endpoint",    endpointPlaceholder: "https://api.openai.com",                  apiKeyKey: "ai.platform.openai.api_key",    apiKeyPlaceholder: "sk-…" },
  { label: "Gemini",    endpointKey: "ai.platform.gemini.endpoint",    endpointPlaceholder: "https://generativelanguage.googleapis.com", apiKeyKey: "ai.platform.gemini.api_key",   apiKeyPlaceholder: "AIza…" },
  { label: "Mistral",   endpointKey: "ai.platform.mistral.endpoint",   endpointPlaceholder: "https://api.mistral.ai",                  apiKeyKey: "ai.platform.mistral.api_key",   apiKeyPlaceholder: "" },
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
  max-height: calc(100vh - 64px);
  margin: auto;
  display: flex;
  flex-direction: column;
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
  overflow-y: auto;
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

.field select {
  flex: 1;
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  font-family: var(--font-family, system-ui, sans-serif);
  font-size: 0.85rem;
  padding: 5px 8px;
}

.field select:focus {
  border-color: #08f;
  outline: none;
}

.section-divider {
  border: none;
  border-top: 1px solid #3a3a3a;
  margin: 2px 0;
}

.platform-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.platform-label {
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0.5;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.field label .optional {
  font-weight: 400;
  opacity: 0.6;
}
`;

export class SettingsPanel extends BaseHtmlElement {
  private _models: Model[] = [];
  private _completionModel = "";

  constructor() {
    super();
  }

  setModels(models: Model[]): void {
    this._models = models;
    this._renderCompletionModelSelect();
  }

  load(config: Partial<Configuration>): void {
    this.querySelectorAll<HTMLInputElement>("input[data-storage-key]").forEach(input => {
      input.value = config[input.dataset.storageKey as keyof Configuration] ?? "";
      input.classList.remove("saved");
    });
    this._completionModel = config["ai.completion.model"] ?? "";
    this._renderCompletionModelSelect();
  }

  connectedCallback(): void {
    if (!this.querySelector(".panel-header")) {
      this._render();
    }
    this.querySelector(".close-btn")!.addEventListener("click", () => {
      (this as HTMLElement & { hidePopover(): void }).hidePopover();
    });
  }

  private _render(): void {
    const sections = PLATFORMS.map(({ label, endpointKey, endpointPlaceholder, apiKeyKey, apiKeyPlaceholder, apiKeyOptional }) => `
      <div class="platform-section">
        <span class="platform-label">${label}</span>
        <div class="field">
          <label>Endpoint</label>
          <input type="text" autocomplete="off" spellcheck="false"
                 placeholder="${endpointPlaceholder}"
                 data-storage-key="${endpointKey}" />
        </div>
        <div class="field">
          <label>API key${apiKeyOptional ? ' <span class="optional">(optional)</span>' : ''}</label>
          <div class="input-row">
            <input type="password" autocomplete="off" spellcheck="false"
                   placeholder="${apiKeyPlaceholder}"
                   data-storage-key="${apiKeyKey}" />
            <button type="button" class="show-btn" data-storage-key="${apiKeyKey}">Show</button>
          </div>
        </div>
      </div>
    `).join('<hr class="section-divider">');

    this.innerHTML = `
      <style>${css}</style>
      <div class="panel-header">
        <span class="panel-title">Settings</span>
        <button class="close-btn" type="button" title="Close">✕</button>
      </div>
      <div class="panel-body">
        ${sections}
        <hr class="section-divider">
        <div class="field" id="completion-model-field">
          <label>Completion model</label>
          <select id="completion-model-select">
            <option value="">— same as chat —</option>
          </select>
        </div>
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

    this.querySelector<HTMLSelectElement>("#completion-model-select")
      ?.addEventListener("change", e => {
        const value = (e.target as HTMLSelectElement).value;
        this._completionModel = value;
        this.dispatchEvent(new CustomEvent("settings-changed", {
          bubbles: true,
          composed: true,
          detail: { key: "ai.completion.model", value },
        }));
      });
  }

  private _renderCompletionModelSelect(): void {
    const select = this.querySelector<HTMLSelectElement>("#completion-model-select");
    if (!select) return;
    select.innerHTML = `<option value="">— same as chat —</option>` +
      this._models.map(m =>
        `<option value="${m.name}"${m.name === this._completionModel ? " selected" : ""}>${m.name} (${m.platform})</option>`
      ).join("");
  }

  private _save(input: HTMLInputElement): void {
    const key = input.dataset.storageKey!;
    const value = input.value.trim();

    input.classList.add("saved");
    setTimeout(() => input.classList.remove("saved"), 1200);

    this.dispatchEvent(new CustomEvent("settings-changed", {
      bubbles: true,
      composed: true,
      detail: { key, value },
    }));
  }
}
