import { Logger } from "./logger";

export interface LoggerInjected {
  set logger(logger: Logger);
}
