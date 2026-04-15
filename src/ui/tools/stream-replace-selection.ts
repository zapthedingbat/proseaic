// import { TextEditor } from "../components/text-editor.js";
import { LoggerFactory } from "../lib/logging/logger-factory.js";
import { Logger } from "../lib/logging/logger.js";
import { StreamEvent } from "../lib/platform/stream-event.js";
import { ToolSchema } from "../lib/tools/tool-schema.js";
import { ITool } from "../lib/tools/tool.js";
import { IEditableText } from "../lib/editable-text.js";
import { IChatStream } from "../lib/platform/chat-stream.js";

const schema: ToolSchema = {
  type: "function",
  icon: "sync",
  function: {
    name: "stream_to_selection",
    description: `Writes text into the current editor selection in real time, so the user sees the content appear as you generate it. Use this instead of replace_selection when you want a live writing effect.

Follow this exact three-step sequence — do not deviate:
1. Call this tool with enabled: true to begin writing.
2. In your next response write the text content as plain text ONLY — do not call any tools. Every word you write will appear in the selection live as you generate it.
3. After the text response, call this tool again with enabled: false to finish.`,
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true: begin writing to the selection — your next response must be plain text only, do not call any tools. false: finish writing, called after your text response is complete."
        },
      },
      required: ["enabled"]
    }
  }
};

export class StreamReplaceSelectionTool implements ITool {
  schema = schema;

  private _editor: IEditableText;
  private _active: boolean;
  private _logger: Logger;


  constructor(loggerFactory: LoggerFactory, editor: IEditableText, chatStream: IChatStream) {
    this._logger = loggerFactory("Stream Replace Selection Tool");
    this._editor = editor;
    this._active = false;
    chatStream.on("streamEvent", this._handleStreamEvent);
  }

  // TODO: Remove this?
  // onPromptComplete(): void {
  //   if (this._active) {
  //     this._logger.warn("Prompt completed while capture was still active. Stopping capture.");
  //     this._active = false;
  //   }
  // }

  addContext(): Record<string, unknown> {
    const activeInstruction = `${schema.function.name} is active, All output will be written directly into the editor selection. If you want to display text to the user, use the ${schema.function.name} to disable this first`;
    const inactiveInstruction = `${schema.function.name} is not active. If you want to write directly into the editor selection, use the ${schema.function.name} tool.`;
    return {
      [schema.function.name]: this._active ? activeInstruction : inactiveInstruction
    };
  }

  private _handleStreamEvent = (streamEvent: StreamEvent) => {
    if (!this._active) {
      return;
    }
    if ((streamEvent.type === "text_delta") && streamEvent.text) {
      this._editor.replaceSelection(streamEvent.text);
    }
  }

  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    const enabled = args.enabled === true;
    this._logger.debug(args);
    let explanation: string;
    if (enabled) {
      const wasActive = this._active; // check before mutating
      this._active = true;
      if (wasActive) {
        this._logger.warn("Stream was already active. Resetting.");
        explanation = "Streaming reset and restarted. Now write your text response. Everything you write will appear in the selection in real time. Call this tool with enabled: false when you are done.";
      } else {
        this._logger.info("Started streaming to selection");
        explanation = "Streaming started. Now write your text response. Everything you write will appear in the selection in real time. Call this tool with enabled: false when you are done.";
      }
    } else {
      if (!this._active) {
        this._logger.warn("Received enabled: false but streaming was not active. Ignoring.");
        explanation = "Streaming was not active. To start streaming, call this tool with enabled: true.";
        return;
      }
      this._active = false;
      this._logger.info("Stopped streaming to selection");
      explanation = "Streaming finished. The selection has been updated with your text.";
    }

    return {
      icon: this._active ? "sync" : "sync-ignored",
      active: this._active,
      explanation: explanation
    };
  };
}