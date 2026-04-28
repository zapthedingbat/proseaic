import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";

export interface IComponentFactory<T extends CustomElementConstructor> {
  create(ctor: T): InstanceType<T>;
}

type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? never : K
}[keyof T];

type DependencyMap<T extends CustomElementConstructor> = {
  [K in NonFunctionKeys<InstanceType<T>>]?: InstanceType<T>[K];
};

type DependencyInjector<T extends CustomElementConstructor> = (instance: InstanceType<T>) => void;

export type Dependencies<T extends CustomElementConstructor> = DependencyMap<T> | DependencyInjector<T>;

/**
 * The ComponentFactory class is responsible for creating instances of UI components (which are custom elements) and injecting dependencies into them. It also handles defining custom elements in the DOM as needed.
 * 
 * The factory takes a LoggerFactory for logging, the Document and CustomElementRegistry from the browser environment, and an optional tag prefix for auto-registering components as custom elements.
 *
 * Example usage:
 *
 * componentFactory.create(MyComponent, {
 *   someService
 * });
 *
 * componentFactory.create(MyComponent, (instance) => {
 *   instance.someService = new MyService();
 * });
 *
 * componentFactory.create(MyComponent, (instance) => {
 *   componentFactory.injectDependencies(instance, {
 *     someService: new MyService()
 *   });
 * });
*/

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

  public injectDependencies<T extends CustomElementConstructor>(component: InstanceType<T>, dependencies: Dependencies<T>): void {
    if (this._injectedComponents.has(component)) {
      return;
    }
    this._injectedComponents.add(component);

    // If dependencies is a function, call it with the component instance to allow for custom injection logic.
    if (typeof dependencies === "function") {
      dependencies(component);
      return;
    }

    // Otherwise, treat it as a simple map of property keys to values to be injected.
    for (const [key, value] of Object.entries(dependencies || {})) {
      if (key in component) {
        (component as Record<string, unknown>)[key] = value;
      } else {
        this._logger.warn(`Component ${component.constructor.name} does not have a '${key}' property. Skipping injection of dependency.`);
      }
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

  public create<T extends CustomElementConstructor>(ctor: T, dependencies?: Dependencies<T>): InstanceType<T> {

    const tagName = this._getTagName(ctor);
    if (!this._customElements.get(tagName)) {
      this._customElements.define(tagName, ctor);
      this._logger.info(`Automatically defined custom element '${tagName}' for constructor ${ctor.name}.`);
    }

    const component = this._document.createElement(tagName) as InstanceType<T>;
 
    if(dependencies) {
      this.injectDependencies(component, dependencies);
    }

    return component;
  }
}