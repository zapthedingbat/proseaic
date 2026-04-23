import { ChatMessage } from "../chat/chat-message.js";
import { Model } from "../models/model.js";
import { ToolSchema } from "../tools/tool-schema.js";
import { StreamEvent } from "./stream-event.js";

export interface IPlatformService {
  generate(
    model: Model,
    messages: ChatMessage[],
    tools: ToolSchema[]
  ): AsyncIterable<StreamEvent>;
  getModels(): Promise<Model[]>;
}
