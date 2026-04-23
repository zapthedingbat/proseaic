export interface IEventSource<TEventMap> {
  on<K extends keyof TEventMap>(
    event: K,
    cb: (e: TEventMap[K]) => void
  ): void;

  off<K extends keyof TEventMap>(
    event: K,
    cb: (e: TEventMap[K]) => void
  ): void;
}
