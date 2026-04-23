import { JSONValue } from "../JSONValue.js";
import { ToolSchema } from "./tool-schema.js";
import { ITool } from "./tool.js";

export interface IToolService {
  findTool(name: string): ITool | undefined;
  listToolNames(): string[];
  listToolSchemas(): ToolSchema[];
  addContext(): Record<string, JSONValue>;
}
