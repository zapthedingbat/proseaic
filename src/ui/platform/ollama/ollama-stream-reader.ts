import { NdJsonStreamReader } from "../../lib/platform/ndjson-stream-reader.js";

export type OllamaStreamChunk = {
  done?: boolean;
  thinking?: string;
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: Array<{
      id?: string;
      function?: {
        name?: string;
        arguments?: Record<string, unknown>;
      };
    }>;
    images?: string[];
  };
};

export interface IOllamaStreamReader {
  read(stream: ReadableStream<Uint8Array>): AsyncIterable<OllamaStreamChunk>;
}

export class OllamaStreamReader extends NdJsonStreamReader<OllamaStreamChunk> implements IOllamaStreamReader {
  constructor() {
    super();
  }
}
