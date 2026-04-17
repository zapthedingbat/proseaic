import { Logger } from "../lib/logging/logger.js";
import { LoggerInjected } from "../lib/logging/logger-injected.js";
// @ts-ignore: esbuild bundles CSS imports as raw text.
import componentStyles from "../assets/components.css";
// @ts-ignore: esbuild bundles CSS imports as raw text.
import codiconStyles from "@vscode/codicons/dist/codicon.css";

function createConstructableStylesheet(cssText: string): CSSStyleSheet | null {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    return sheet;
  } catch {
    return null;
  }
}

const commonStylesheets: CSSStyleSheet[] = [
  createConstructableStylesheet(componentStyles),
  createConstructableStylesheet(codiconStyles)
].filter((s): s is CSSStyleSheet => s !== null);

export abstract class BaseHtmlElement extends HTMLElement implements LoggerInjected {
  protected _logger: Logger;

  constructor() {
    super();
    this._logger = console;
    this.attachShadow({ mode: "open" });
    this.adoptCommonStyles();
  }
  
  override attachShadow(init: ShadowRootInit): ShadowRoot {
    if (this.shadowRoot) {
      return this.shadowRoot;
    }
    return super.attachShadow(init);
  }
  
  set logger(logger: Logger) {
    this._logger = logger;
  }

  protected adoptCommonStyles(): void {
    const shadowRoot = this.shadowRoot;
    if (!shadowRoot) {
      return;
    }

    for (const sheet of commonStylesheets) {
      if (!shadowRoot.adoptedStyleSheets.includes(sheet)) {
        shadowRoot.adoptedStyleSheets.push(sheet);
      }
    }
  }
}

