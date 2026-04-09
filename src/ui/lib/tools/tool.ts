import { ToolSchema } from "./tool-schema.js";


export interface ITool {
  schema: ToolSchema;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}
