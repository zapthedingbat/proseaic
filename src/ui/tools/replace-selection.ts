import { TextEditor } from "../components/text-editor.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";

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
  private _editor: TextEditor;
  constructor(editor: TextEditor) {
    this._editor = editor;
  }
  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    const text = args.text as string;
    this._editor.setSelectionMarkdown(text);
    this._editor.dispatchEvent(new CustomEvent("change", {
      detail: { content: this._editor.getDocumentMarkdown() },
      bubbles: true,
      composed: true
    }));

    return {
      explanation: args.explanation || "Replaced the selected text."
    };
  };
}
