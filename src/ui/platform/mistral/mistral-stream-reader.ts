
import { SseStreamReader } from "../../lib/sse-stream-reader.js";
import { MistralStreamChunk } from "./mistral-request.js";

export interface IMistralStreamReader {
  read(stream: ReadableStream<Uint8Array>): AsyncIterable<MistralStreamChunk>;
}

export class MistralStreamReader extends SseStreamReader<MistralStreamChunk> implements IMistralStreamReader {
  constructor() {
    super();
  }
}
