import { describe, expect, it } from "vitest";
import { OllamaStreamReader } from "../../../../src/browser/platform/ollama/ollama-stream-reader.ts";

function createStreamFromTextParts(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    }
  });
}

describe("OllamaStreamReader", () => {
  it("parses ndjson chunks and preserves tool_calls", async () => {
    const reader = new OllamaStreamReader();

    const toolCallLine = JSON.stringify({
      message: {
        tool_calls: [
          {
            id: "call_abc123",
            function: {
              name: "replace_selection",
              arguments: { text: "Updated text" }
            }
          }
        ]
      }
    });

    const doneLine = JSON.stringify({ done: true });

    // Split line content across chunks to verify streaming decode behavior.
    const stream = createStreamFromTextParts([
      toolCallLine.slice(0, 30),
      toolCallLine.slice(30) + "\n",
      doneLine + "\n"
    ]);

    const chunks = [];
    for await (const chunk of reader.read(stream)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        message: {
          tool_calls: [
            {
              id: "call_abc123",
              function: {
                name: "replace_selection",
                arguments: { text: "Updated text" }
              }
            }
          ]
        }
      },
      { done: true }
    ]);
  });
});