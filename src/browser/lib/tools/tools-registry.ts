import { ITool } from "./tool.js";
import { IToolService } from "./tool-service.js";
import { ToolSchema } from "./tool-schema.js";
import { Model } from "../models/model.js";

export function filterToolSchemas(schemas: ToolSchema[], allowedNames: readonly string[]): ToolSchema[] {
  const allowed = new Set(allowedNames);
  return schemas.filter(s => allowed.has(s.function.name));
}

export function filterToolSchemasByModel(schemas: ToolSchema[], model: Model): ToolSchema[] {
  return schemas.filter(s => {
    if (!s.requiredCapability) return true;
    return model.capabilities?.includes(s.requiredCapability) ?? false;
  });
}

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

  addContext(): Record<string, unknown> {
    // Allow each tool to add information to the prompt context, which can then be used by tools when executing.
    // For example, a tool that fetches real-time data could add that data to the prompt context so it can be
    // included in the assistant's response.
    const context: Record<string, unknown> = {};
    for (const tool of this._tools.values()) {
      if (tool.addContext) {
        const toolContext = tool.addContext();
        if (toolContext) {
          Object.assign(context, toolContext);
        }
      }
    }
    return context;
  }
}