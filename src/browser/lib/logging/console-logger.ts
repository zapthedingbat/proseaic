import { Logger } from "./logger.js";
import { LogLevels } from "./LogLevels.js";


export class ConsoleLogger implements Logger {
  private _name: string;
  private _console: Console;
  constructor(name: string, console: Console = globalThis.console) {
    this._name = name;
    this._console = console;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  trace(...data: any[]): void {
    return this._log("trace", ...data);
  }
  info(...data: any[]): void {
    return this._log("info", ...data);
  }
  debug(...data: any[]): void {
    return this._log("debug", ...data);
  }
  error(...data: any[]): void {
    return this._log("error", ...data);
  }
  warn(...data: any[]): void {
    return this._log("warn", ...data);
  }
  private _log(level: LogLevels, ...data: any[]): void {
    this._console[level](`[${this._name}]`, ...data);
    this._console.groupCollapsed("trace");
    this._console.trace();
    this._console.groupEnd();
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
