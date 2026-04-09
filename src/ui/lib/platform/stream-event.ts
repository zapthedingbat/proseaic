import { ToolCall } from "../chat/chat-message.js";


export type StreamEvent = { type: "text_delta"; text: string; } |
{ type: "reasoning_delta"; text: string; } |
{ type: "tool_call"; tool_call: ToolCall; } |
{ type: "done"; } |
{ type: "error"; error: unknown; };
