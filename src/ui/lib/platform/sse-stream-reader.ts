
export class SseStreamReader<T> {
  async *read(stream: ReadableStream<Uint8Array>): AsyncIterable<T> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data && data !== "[DONE]") {
              const parsed = JSON.parse(data);
              yield parsed as T;
            }
          }
        }
      }

      // Flush any remaining buffered line
      if (buffer.startsWith("data: ")) {
        const data = buffer.slice(6).trim();
        if (data && data !== "[DONE]") {
          const parsed = JSON.parse(data);
          yield parsed as T;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
