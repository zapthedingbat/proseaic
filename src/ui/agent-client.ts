export type StreamEvent = Record<string, unknown>;
export type StreamEventHandler = (event: StreamEvent) => void | Promise<void>;

export class AgentClient {
  private _isStreamingResponse: boolean;

  constructor() {
    this._isStreamingResponse = false;
  }

  async loadModels(): Promise<unknown[]> {
    const res = await fetch("/api/tags");
    if (!res.ok) {
      throw new Error(`Failed to load models (${res.status})`);
    }

    const data = await res.json();
    return Array.isArray(data?.models) ? data.models : [];
  }

  get isStreamingResponse(): boolean {
    return this._isStreamingResponse;
  }

  async streamChat(payload: Record<string, unknown>, onEvent: StreamEventHandler): Promise<void> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    if (!res.body) {
      throw new Error("No response body");
    }

    this._isStreamingResponse = true;

    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const records = buffer.split(/\r?\n/);
        buffer = records.pop() || "";

        for (const record of records) {
          if (!record.trim()) {
            continue;
          }

          try {
            await onEvent(JSON.parse(record));
          } catch (error) {
            console.warn("Skipping invalid NDJSON record:", error, record);
          }
        }
      }

      const trailing = `${buffer}${decoder.decode()}`.trim();
      if (trailing) {
        try {
          await onEvent(JSON.parse(trailing));
        } catch (error) {
          console.warn("Skipping trailing NDJSON record:", error, trailing);
        }
      }
    } finally {
      this._isStreamingResponse = false;
    }
  }
}
