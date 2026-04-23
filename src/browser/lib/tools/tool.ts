import { JSONValue } from "../JSONValue.js";
import { ToolSchema } from "./tool-schema.js";

export interface ITool {
  schema: ToolSchema;
  execute: (args: Record<string, unknown>) => Promise<JSONValue>;
  addContext?: () => Record<string, unknown>;
}
