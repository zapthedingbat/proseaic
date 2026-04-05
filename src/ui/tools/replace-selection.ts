type ToolCallArgs = {
  text?: string;
  explanation?: string;
};

type ApplyDocumentEdit = (edit: {
  kind: "replace-selection";
  text: string;
  explanation?: string;
  toolName: string;
}) => { ok: boolean; explanation?: string; error?: string };

type ToolContext = {
  editor?: ({ replaceSelection: (text: string) => void } & HTMLElement) | null;
  applyDocumentEdit?: ApplyDocumentEdit;
};

export async function replaceSelectionWithText(
  toolCallArgs: ToolCallArgs,
  context: ToolContext
): Promise<{ ok: boolean; error?: string; explanation?: string }> {
  const { editor, applyDocumentEdit } = context;
  if (typeof applyDocumentEdit === "function") {
    return applyDocumentEdit({
      kind: "replace-selection",
      text: toolCallArgs.text || "",
      explanation: toolCallArgs.explanation,
      toolName: "replace_selection"
    });
  }

  if (!editor) {
    return { ok: false, error: "Editor context is not available." };
  }

  editor.replaceSelection(toolCallArgs.text || "");
  editor.dispatchEvent(new CustomEvent("change", {
    detail: { content: (editor as HTMLElement & { value?: string }).value || "" },
    bubbles: true,
    composed: true
  }));

  return {
    ok: true,
    explanation: toolCallArgs.explanation || "Replaced the selected text."
  };
}
