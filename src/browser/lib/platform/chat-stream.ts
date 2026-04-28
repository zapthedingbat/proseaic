import { IEventSource } from "../events/event-source";
import { ChatStreamEventMap } from "./chat-stream-event-map";


// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IChatStream extends IEventSource<ChatStreamEventMap> {}
