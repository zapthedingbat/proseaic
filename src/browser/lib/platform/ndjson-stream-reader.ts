
export class NdJsonStreamReader<T> {
  async *read(stream: ReadableStream<Uint8Array>): AsyncIterable<T> {
    const reader = stream.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any buffered decoder state and parse a final unterminated NDJSON line.
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            const data = JSON.parse(line);
            yield data as T;
          }
        }
      }

      if (buffer.trim()) {
        const data = JSON.parse(buffer);
        yield data as T;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
