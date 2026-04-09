import { ToolSchema } from "../lib/tools/tool-schema.js";
import { ITool } from "../lib/tools/tool.js";

const schema: ToolSchema = {
  type: "function",
  function: {
    name: "count_letters",
    description: "Count the number of letters in a given text.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to count letters in."
        },
        letter: {
          type: "string",
          description: "The letter to count in the text."
        }
      },
      required: ["text", "letter"]
    }
  }
};

export class CountLettersTool implements ITool {
  schema = schema;
  constructor() {}
  
  execute = async (args: Record<string, unknown>): Promise<unknown> => {
    const text = args.text as string;
    const letter = args.letter as string;
    const count = text.split("").filter(char => char === letter).length;

    return {
      count
    };
  };
}
