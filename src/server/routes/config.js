function normalizeOllamaHost(rawHost) {
  const trimmed = typeof rawHost === "string" ? rawHost.trim() : "";

  if (!trimmed) {
    return "http://127.0.0.1:11434";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(
      `Invalid OLLAMA_HOST value: "${trimmed}". Expected scheme://host:port or full URL, e.g. "http://ollama:11434".`
    );
  }
}

export const OLLAMA_HOST = normalizeOllamaHost(process.env.OLLAMA_HOST);
