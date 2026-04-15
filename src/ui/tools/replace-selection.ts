// import { TextEditor } from "../components/text-editor.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IEditableText } from "../lib/editable-text.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "replace_selection",
    description: "Replace the current selection.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The full replacement text for the selected region."
        },
        explanation: {
          type: "string",
          description: "A short explanation of the change."
        }
      },
      required: ["text"]
    }
  }
};

export class ReplaceSelectionTool {
  schema = schema;
  private _editor: IEditableText;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, editor: IEditableText) {
    this._logger = loggerFactory("Replace Selection Tool");
    this._editor = editor;
  }
  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    this._logger.debug("Executing with args:", args);
    const text = args.text as string;
    this._editor.replaceSelection(text);
    return {
      explanation: args.explanation || "Replaced the selected text."
    };
  };
}
