import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";

export interface IComponentFactory<T extends CustomElementConstructor> {
  create(ctor: T): InstanceType<T>;
}

export class ComponentFactory {

  private _loggerFactory: LoggerFactory;
  private _logger: Logger;
  private _document: Document;
  private _customElements: CustomElementRegistry;
  private _injectedComponents = new WeakSet<HTMLElement>();
  private _tagPrefix: string | null;

  constructor(
    loggerFactory: LoggerFactory,
    document: Document,
    customElements: CustomElementRegistry,
    tagPrefix?: string
  ) {
    this._document = document;
    this._customElements = customElements;
    this._loggerFactory = loggerFactory;
    this._logger = this._loggerFactory("ComponentInstanceResolver");
    this._tagPrefix = tagPrefix || null;
  }

  private injectDependencies<T extends CustomElementConstructor>(component: InstanceType<T>): void {
    if (this._injectedComponents.has(component)) {
      return;
    }
    this._injectedComponents.add(component);

    if('logger' in component) {
      (component as any).logger = this._loggerFactory(component.constructor.name);
    } else {
      this._logger.warn(`Component ${component.constructor.name} does not have a 'logger' property. Skipping logger injection.`);
    }
  }

  private _getTagName<T extends CustomElementConstructor>(ctor: T): string {
    const registeredTagName = this._customElements.getName(ctor);
    if (registeredTagName) {
      return registeredTagName;
    }

    if (!this._tagPrefix) {
      this._logger.error(`Constructor ${ctor.name} is not registered as a custom element and no tag prefix is configured for auto-registration.`);
      throw new Error(`Constructor ${ctor.name} is not registered as a custom element and no tag prefix is configured for auto-registration.`);
    }

    // Strip leading underscores added by bundlers (e.g. esbuild renames classes
    // with static fields from `MarkdownEditor` to `_MarkdownEditor`), then strip
    // the "Ui" prefix used by our component naming convention.
    const baseName = ctor.name.replace(/^_+/, "").replace(/^Ui(?=[A-Z])/, "");
    const kebabName = baseName
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
      .toLowerCase();

    return `${this._tagPrefix}-${kebabName}`;
  }

  public create<T extends CustomElementConstructor>(ctor: T): InstanceType<T> {

    const tagName = this._getTagName(ctor);
    if (!this._customElements.get(tagName)) {
      this._customElements.define(tagName, ctor);
      this._logger.info(`Automatically defined custom element '${tagName}' for constructor ${ctor.name}.`);
    }

    const component = this._document.createElement(tagName) as InstanceType<T>;
 
    this.injectDependencies(component);

    return component;
  }
}