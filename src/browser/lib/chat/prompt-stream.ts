import { ChatMessage } from "./chat-message.js";
import { ChatMessageEvent, StreamTokenEvent } from "../events.js";
import { StreamEvent } from "../platform/stream-event.js";

export class PromptStream extends EventTarget {
  readonly completed: Promise<void>;

  private _resolve!: () => void;
  private _reject!: (reason: unknown) => void;

  constructor() {
    super();
    this.completed = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  _notify(message: ChatMessage): void {
    this.dispatchEvent(new ChatMessageEvent(message));
  }

  _forwardStreamEvent(event: StreamEvent): void {
    this.dispatchEvent(new StreamTokenEvent(event));
  }

  _complete(): void {
    this._resolve();
  }

  _fail(reason: unknown): void {
    this._reject(reason);
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.completed.then(onfulfilled, onrejected);
  }
}
