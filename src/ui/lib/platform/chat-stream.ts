import { IEventSource } from "../events/event-source";
import { ChatStreamEventMap } from "./chat-stream-event-map";


export interface IChatStream extends IEventSource<ChatStreamEventMap> { }
