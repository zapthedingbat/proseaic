import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { ITool } from "../lib/tools/tool.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "task_complete",
    description: "Signal that all requested tool work is finished and the assistant is ready to provide the final user-facing response.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Optional short summary of completed actions."
        },
      },
      required: []
    }
  }
};

export class TaskCompleteTool implements ITool {
  schema = schema;
  private _logger: Logger;
  constructor(loggerFactory: LoggerFactory) {
    this._logger = loggerFactory("Task complete tool");
  }
  
  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    const summary = args.summary as string;
    return {
      summary
    };
  };
}
