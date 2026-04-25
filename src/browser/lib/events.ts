import { ChatMessage } from "./chat/chat-message";
import { StreamEvent } from "./platform/stream-event";

export class SubmitPromptEvent extends CustomEvent<{ promptText: string }> implements Event {
  constructor(promptText: string) {
    super("submit-prompt", {
      detail: { promptText },
      bubbles: true,
      composed: true
    });
  }
}

export class SelectCheckpointEvent extends CustomEvent<{ checkpoint: string }> implements Event {
  constructor(checkpoint: string) {
    super("select-checkpoint", {
      detail: { checkpoint },
      bubbles: true,
      composed: true
    });
  }
}

export class ClearHistoryEvent extends CustomEvent<void> implements Event {
  constructor() {
    super("clear-history", {
      bubbles: true,
      composed: true
    });
  }
}

export class InsertContentEvent extends CustomEvent<{ content: string }> implements Event {
  constructor(content: string) {
    super("insert-content", {
      detail: { content },
      bubbles: true,
      composed: true
    });
  }
}

export class NewDocumentEvent extends CustomEvent<{ content: string }> implements Event {
  constructor(content: string) {
    super("new-document", {
      detail: { content },
      bubbles: true,
      composed: true
    });
  }
}

export class ChatMessageEvent extends CustomEvent<{message: ChatMessage}> implements Event {
  constructor(message: ChatMessage) {
    super("message", {
      detail: { message },
      bubbles: true,
      composed: true
    });
  }
}

export class StreamTokenEvent extends CustomEvent<StreamEvent> implements Event {
  constructor(event: StreamEvent) {
    super("token", { detail: event });
  }
}