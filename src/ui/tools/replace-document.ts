type ToolCallArgs = {
  text?: string;
  explanation?: string;
};

type ApplyDocumentEdit = (edit: {
  kind: "replace-document";
  text: string;
  explanation?: string;
  toolName: string;
}) => { ok: boolean; explanation?: string; error?: string };

type ToolContext = {
  editor?: HTMLElement & { value?: string } | null;
  applyDocumentEdit?: ApplyDocumentEdit;
};

export async function replaceDocument(
  toolCallArgs: ToolCallArgs,
  context: ToolContext
): Promise<{ ok: boolean; error?: string; explanation?: string }> {
  const { editor, applyDocumentEdit } = context;
  if (typeof applyDocumentEdit === "function") {
    return applyDocumentEdit({
      kind: "replace-document",
      text: toolCallArgs.text || "",
      explanation: toolCallArgs.explanation,
      toolName: "replace_document"
    });
  }

  if (!editor || typeof editor.value !== "string") {
    return { ok: false, error: "Editor context is not available." };
  }

  editor.value = toolCallArgs.text || "";
  editor.dispatchEvent(new CustomEvent("change", {
    detail: { content: editor.value },
    bubbles: true,
    composed: true
  }));

  return {
    ok: true,
    explanation: toolCallArgs.explanation || "Replaced the full document."
  };
}
