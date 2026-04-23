import { ToolSchema } from "../tools/tool-schema.js";

export interface Agent {
  readonly id: string;
  readonly requiredCapability?: string;
  buildSystemPrompt(tools: ToolSchema[]): string;
  filterTools(tools: ToolSchema[]): ToolSchema[];
  // Optional: when the model produces a text-only response (no tool calls), the loop
  // injects this prompt and continues. If absent or null, a text-only turn ends the loop.
  buildContinuationPrompt?(): string | null;
}
