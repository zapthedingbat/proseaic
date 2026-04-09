import { ITool } from "./tool.js";
import { IToolService } from "./tool-service.js";
import { ToolSchema } from "./tool-schema.js";

export interface IToolRegistry {
  registerTool(tool: ITool): this;
}

export class ToolRegistry implements IToolRegistry, IToolService {
  private _tools: Map<string, ITool> = new Map();

  registerTool(tool: ITool): this {
    this._tools.set(tool.schema.function.name, tool);
    return this;
  }
  
  registerMany(tools: ITool[]): this {
    for (const tool of tools) {
      this.registerTool(tool);
    }
    return this;
  }
  
  findTool(name: string): ITool | undefined {
    return this._tools.get(name);
  }

  listToolNames(): string[] {
    return [...this._tools.values()].map(tool => tool.schema.function.name);
  }

  listToolSchemas(): ToolSchema[] {
    return [...this._tools.values()]
      .map(tool => tool.schema)
      .filter((schema): schema is ToolSchema => Boolean(schema));
  }
}