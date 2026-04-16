import { BaseHtmlElement } from "../../components/base-html-element.js";
import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";

export class ComponentInstanceResolver {

  private _loggerFactory: LoggerFactory;
  private _logger: Logger;
  private _document: Document;
  private _customElements: CustomElementRegistry;

  constructor(document: Document, customElements: CustomElementRegistry, loggerFactory: LoggerFactory) {
    this._document = document;
    this._customElements = customElements;
    this._loggerFactory = loggerFactory;
    this._logger = this._loggerFactory("ComponentInstanceResolver");
  }

  public resolve<T extends CustomElementConstructor>(ctor: T, tagName: string): InstanceType<T> {
    if (!this._customElements.get(tagName)) {
      this._customElements.define(tagName, ctor);
    }

    // The DOM is managing the lifecycle of components, (acting as an IoC container),
    const component = this._document.querySelector(tagName) as InstanceType<T> | null;
    if (!component) {
      this._logger.error(`Element with tag name ${tagName} not found in the document`);
      throw new Error(`Element with tag name ${tagName} not found in the document`);
    }

    // Attempt to inject logger with property injection if the component supports it.
    const htmlElement:BaseHtmlElement = component as BaseHtmlElement;
    if('logger' in htmlElement) {
      htmlElement.logger = this._loggerFactory(tagName);
    } else {
      this._logger.warn(`Component ${tagName} does not have a 'logger' property. Skipping logger injection.`);
    } 

    return component;
  }
}