// import { TextEditor } from "../components/text-editor.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { IEditableText } from "../lib/document/editable-text.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { JSONValue } from "../lib/JSONValue.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "replace_selection",
    description: "Replace the currently selected text in the editor. Use this to apply user-requested edits instead of returning rewrite text for the user to paste.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The full replacement text for the selected region. Provide complete final text, not a diff."
        },
        explanation: {
          type: "string",
          description: "Optional one-line summary of what was changed."
        }
      },
      required: ["text"]
    }
  }
};

export class ReplaceSelectionTool {
  schema = schema;
  private _getEditor: () => IEditableText | null;
  private _logger: Logger;

  constructor(loggerFactory: LoggerFactory, getEditor: () => IEditableText | null) {
    this._logger = loggerFactory("Replace Selection Tool");
    this._getEditor = getEditor;
  }
  
  execute = async (args: Record<string, unknown>): Promise<JSONValue> => {
    this._logger.debug("Executing with args:", args);
    const editor = this._getEditor();
    if (!editor) {
      throw new Error("No focused editor is available.");
    }
    const text = args.text as string;
    editor.replaceSelection(text);
    return {};
  }
}
