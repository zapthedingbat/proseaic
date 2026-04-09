import { ToolSchema } from "./tool-schema.js";
import { ITool } from "./tool.js";


export interface IToolService {
  findTool(name: string): ITool | undefined;
  listToolNames(): string[];
  listToolSchemas(): ToolSchema[];
}
