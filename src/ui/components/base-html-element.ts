import { Logger } from "../lib/logging/logger.js";
import { LoggerInjected } from "../lib/logging/logger-injected.js";

export abstract class BaseHtmlElement extends HTMLElement implements LoggerInjected {
  protected _logger: Logger;
  constructor() {
    super();
    this._logger = console;
  }
  set logger(logger: Logger) {
    this._logger = logger;
  }
}
