export type ModelCapabilities = {
  enableTools: boolean;
  think: boolean;
  raw: string[];
};

type ChatToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

type SelectionPayload = {
  text?: string;
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
} | null | undefined;

type PromptPayload = {
  prompt?: string;
  model?: string;
  document?: string;
  selection?: SelectionPayload;
};

const ASSISTANT_ROLES: Record<string, string> = {
  technicalArchitect:
    "You are a highly skilled technical architect with expertise in designing scalable and efficient software systems. You have a deep understanding of various architectural patterns, cloud technologies, and best practices for building robust applications. Your role is to provide guidance and recommendations on software architecture, system design, and technology choices to ensure the successful development and deployment of software projects.",
  technicalWriter:
    "You are a meticulous technical writer with a talent for translating complex technical concepts into clear, concise, and engaging documentation. You have experience creating user manuals, API documentation, and technical guides that cater to both technical and non-technical audiences. Your role is to produce high-quality documentation that enhances user understanding and promotes the effective use of software products.",
  codeReviewer:
    "You are a detail-oriented code reviewer with a keen eye for identifying potential issues, improving code quality, and ensuring adherence to coding standards. You have experience reviewing code across various programming languages and frameworks, providing constructive feedback to developers to enhance the maintainability, readability, and performance of the codebase. Your role is to conduct thorough code reviews that contribute to the overall quality and success of software projects.",
  leader:
    "You are an inspiring and visionary leader with a proven track record of successfully leading teams to achieve ambitious goals. You possess exceptional communication skills, strategic thinking, and the ability to motivate and empower team members to perform at their best. Your role is to provide clear direction, foster a collaborative and inclusive team culture, and drive the execution of projects to deliver outstanding results."
};

const EDITING_GUIDANCE = `
When the user asks you to change the selected text or the document, do not paste a rewritten version into chat.
Use the available editing tools instead.
- Use replace_selection when only the selected text should change.
- Use replace_document only when the whole document should be replaced.
- Use read_document_lines if you need more local context before editing.
If tool calling is unavailable, respond with JSON only and no prose.
The JSON fallback format is either:
{"edits":[{"function":"replace_selection","text":"new text","explanation":"what changed"}]}
or
{"edits":[{"function":"replace_document","text":"full document text","explanation":"what changed"}]}
When setting the text field for an edit, preserve literal line breaks in the document content and do not spell them as escaped \\n sequences.
After using a tool, briefly confirm what changed without repeating the full document.
If the user is only asking a question and not requesting an edit, respond normally in chat.
`;

export const TOOL_SCHEMAS: ChatToolSchema[] = [
  {
    type: "function",
    function: {
      name: "read_document_lines",
      description: "Read the current document by line range.",
      parameters: {
        type: "object",
        properties: {
          startLine: {
            type: "number",
            description: "The line number to start reading from, 1-based."
          },
          endLine: {
            type: "number",
            description: "The inclusive line number to end reading at, 1-based."
          }
        },
        required: ["startLine", "endLine"]
      }
    }
  },
  {
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
  },
  {
    type: "function",
    function: {
      name: "replace_document",
      description: "Replace the entire document.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The full new document content."
          },
          explanation: {
            type: "string",
            description: "A short explanation of the change."
          }
        },
        required: ["text"]
      }
    }
  }
];

export const TOOL_NAMES = TOOL_SCHEMAS.map(schema => schema.function.name);

function normalizeSelection(selection: SelectionPayload) {
  if (!selection) {
    return null;
  }

  return {
    text: selection.text || "",
    start: selection.start,
    end: selection.end,
    startLine: selection.startLine,
    startColumn: selection.startColumn,
    endLine: selection.endLine,
    endColumn: selection.endColumn
  };
}

function parseCapabilities(data: unknown): ModelCapabilities {
  const raw = Array.isArray((data as { capabilities?: unknown[] })?.capabilities)
    ? ((data as { capabilities?: string[] }).capabilities || [])
    : [];

  return {
    enableTools: raw.includes("tools"),
    think: raw.includes("thinking"),
    raw
  };
}

export async function loadModelCapabilities(model: string): Promise<ModelCapabilities> {
  const response = await fetch("/api/show", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model })
  });

  if (!response.ok) {
    throw new Error(`/api/show returned ${response.status} for model \"${model}\"`);
  }

  const data = await response.json();
  return parseCapabilities(data);
}

export function buildSystemMessage(role: string | undefined): string {
  const persona = ASSISTANT_ROLES[role || ""] || "You are a helpful assistant.";
  return `${persona}\n\n${EDITING_GUIDANCE}`;
}

export function buildPrompt(body: PromptPayload, availableToolNames: string[] = [], capabilities: ModelCapabilities | null = null): string {
  const payload = {
    userRequest: body.prompt || "",
    model: body.model || "",
    capabilities,
    context: {
      hasDocument: typeof body.document === "string",
      document: typeof body.document === "string" ? body.document : null,
      selection: normalizeSelection(body.selection)
    },
    responseGuidance: {
      preferToolCallsForEdits: true,
      availableTools: availableToolNames,
      nonEditQuestionsCanUseChatResponse: true
    }
  };

  return `<requestContext>\n${JSON.stringify(payload, null, 2)}\n</requestContext>`;
}

export function buildOllamaChatRequest({
  model,
  messages,
  options,
  capabilities
}: {
  model: string;
  messages: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
  capabilities: ModelCapabilities | null;
}) {
  const request: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    think: Boolean(capabilities?.think)
  };

  if (capabilities?.enableTools && TOOL_SCHEMAS.length > 0) {
    request.tools = TOOL_SCHEMAS;
  }

  if (options && typeof options === "object") {
    request.options = options;
  }

  return request;
}
