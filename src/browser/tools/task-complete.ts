import { JSONValue } from "../lib/JSONValue.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { ITool } from "../lib/tools/tool.js";

export const schema: ToolSchema = {
  type: "function",
  instructions: "Call this as the LAST tool after all edits are done. Signals completion.",
  function: {
    name: "task_complete",
    description: "Call after completing all document edits to signal the task is done. This is the final step — call it only after insert/replace/remove/move tools have succeeded.",
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
  
  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    const summary = args.summary as string;
    return {
      summary
    };
  };
}

