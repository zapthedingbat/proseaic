import { IEventSource } from "./event-source.js";
import { IEventEmitter } from "./event-emitter.js";

export class EventDispatcher<TEventMap> implements IEventSource<TEventMap>, IEventEmitter<TEventMap> {
  private listeners: {
    [K in keyof TEventMap]?: Array<(e: TEventMap[K]) => void>;
  } = {};

  on<K extends keyof TEventMap>(event: K, cb: (e: TEventMap[K]) => void) {
    (this.listeners[event] ??= []).push(cb);
  }

  off<K extends keyof TEventMap>(event: K, cb: (e: TEventMap[K]) => void) {
    this.listeners[event] =
      this.listeners[event]?.filter(l => l !== cb);
  }

  emit<K extends keyof TEventMap>(event: K, e: TEventMap[K]) {
    this.listeners[event]?.forEach(cb => cb(e));
  }
}
