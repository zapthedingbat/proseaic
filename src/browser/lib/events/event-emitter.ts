import { IEventSource } from "./event-source.js";

export interface IEventEmitter<TEventMap> extends IEventSource<TEventMap> {
  emit<K extends keyof TEventMap>(
    event: K,
    data: TEventMap[K]
  ): void;
}
