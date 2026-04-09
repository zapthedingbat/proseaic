import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { ITool } from "../lib/tools/tool.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "task_complete",
    description: "Indicates that a task has been completed.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "A summary of the completed task."
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
    this._logger.info(`Task completed: ${summary}`);
    return {
      summary
    };
  };
}
