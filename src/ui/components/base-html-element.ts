import { Logger } from "../lib/logging/logger.js";
import { LoggerInjected } from "../lib/logging/logger-injected.js";

const constructableStylesheetCache = new WeakMap<CSSStyleSheet, CSSStyleSheet>();

function getConstructableStylesheet(sourceSheet: CSSStyleSheet): CSSStyleSheet | null {
  const cachedSheet = constructableStylesheetCache.get(sourceSheet);
  if (cachedSheet) {
    return cachedSheet;
  }

  try {
    const cssText = Array.from(sourceSheet.cssRules, (rule) => rule.cssText).join("\n");
    const constructableSheet = new CSSStyleSheet();
    constructableSheet.replaceSync(cssText);
    constructableStylesheetCache.set(sourceSheet, constructableSheet);
    return constructableSheet;
  } catch {
    return null;
  }
}

export abstract class BaseHtmlElement extends HTMLElement implements LoggerInjected {
  protected _logger: Logger;
  
  constructor(init: ShadowRootInit = { mode: "open" }) {
    super();
    this._logger = console;
    this.attachShadow(init);
    // Prevent re-attaching shadow root in derived classes
    this.attachShadow = () => { return this.shadowRoot! }; 
    this.adoptCommonStyles();
  }
  
  set logger(logger: Logger) {
    this._logger = logger;
  }

  protected adoptCommonStyles(): void {
    const doc = this.ownerDocument;
    for (const sheet of doc.styleSheets) {
      const sheetNode = sheet.ownerNode;
      if(sheetNode && sheetNode instanceof HTMLLinkElement && sheetNode.rel === "stylesheet" && sheetNode.dataset.adopt !== undefined) {
        const constructableSheet = getConstructableStylesheet(sheet as CSSStyleSheet);
        if (!constructableSheet) {
          this._logger.debug(`Skipped stylesheet: ${sheet.href || "inline style"}`);
          continue;
        }
        if (!this.shadowRoot!.adoptedStyleSheets.includes(constructableSheet)) {
          this.shadowRoot!.adoptedStyleSheets.push(constructableSheet);
        }
      }
    }
  }
}
