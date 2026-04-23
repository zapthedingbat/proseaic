import { Logger } from "./logger.js";


export type LoggerFactory = (name: string) => Logger;
