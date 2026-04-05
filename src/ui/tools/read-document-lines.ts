type ToolCallArgs = {
  startLine?: number;
  endLine?: number;
};

type ToolContext = {
  document?: string | null;
};

export async function readDocumentLines(
  toolCallArgs: ToolCallArgs,
  context: ToolContext
): Promise<{ ok: boolean; startLine: number; endLine: number; content: string }> {
  const lines = (context.document || "").split(/\r?\n/);
  const safeStart = Math.max(1, Number(toolCallArgs.startLine) || 1);
  const safeEnd = Math.max(safeStart, Number(toolCallArgs.endLine) || safeStart);
  const excerpt = lines
    .slice(safeStart - 1, safeEnd)
    .map((line, index) => `${safeStart + index}: ${line}`)
    .join("\n");

  return {
    ok: true,
    startLine: safeStart,
    endLine: safeEnd,
    content: excerpt
  };
}
