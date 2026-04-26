import http from "http";
import express from "express";
import cors from "cors";

import { staticRoutes } from "./routes/static.js";
import { proxy } from "./routes/proxy.js";
import { storeRoutes } from "./routes/store.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const ANTHROPIC_HOST = process.env.ANTHROPIC_HOST || "https://api.anthropic.com";
const OPENAI_HOST = process.env.OPENAI_HOST || "https://api.openai.com";
const GEMINI_HOST = process.env.GEMINI_HOST || "https://generativelanguage.googleapis.com";
const MISTRAL_HOST = process.env.MISTRAL_HOST || "https://api.mistral.ai";

export function startServer(){
  const app = express();

  app.use(cors());
  //app.use(express.json());
  
  // Proxy requests to the appropriate upstream host based on the path prefix
  app.use(proxy("/ollama", OLLAMA_HOST, { streamResponse: true }));
  app.use(proxy("/anthropic", ANTHROPIC_HOST, { streamResponse: true }));
  app.use(proxy("/openai", OPENAI_HOST, { streamResponse: true }));
  app.use(proxy("/gemini", GEMINI_HOST, { streamResponse: true }));
  app.use(proxy("/mistral", MISTRAL_HOST, { streamResponse: true }));

  // Exposes server-side platform endpoint config to the browser.
  // By default platforms are accessed directly (CORS). Set [PLATFORM]_PROXY=true to route through the server proxy instead.
  app.get("/config", (_req, res) => {
    res.json({
      platforms: {
        ollama:    process.env.OLLAMA_PROXY    === "true" ? "/ollama"    : OLLAMA_HOST,
        anthropic: process.env.ANTHROPIC_PROXY === "true" ? "/anthropic" : "https://api.anthropic.com",
        openai:    process.env.OPENAI_PROXY    === "true" ? "/openai"    : "https://api.openai.com",
        gemini:    process.env.GEMINI_PROXY    === "true" ? "/gemini"    : "https://generativelanguage.googleapis.com",
        mistral:   process.env.MISTRAL_PROXY   === "true" ? "/mistral"   : "https://api.mistral.ai",
      },
    });
  });

  // Document store endpoints (WebDAV-like interface)
  const storeDir = process.env.STORE_DIR || "../../store";
  app.use("/store", storeRoutes(import.meta.url, storeDir));

  // Static file serving for the web UI
  app.use(staticRoutes(import.meta.url, "../../dist/browser"));

  const server = http.createServer(app, { });
  server.listen(3001, () => {
    const address = server.address();
    const port = typeof address === "string" ? address : address.port;
    const host = typeof address === "string" ? "localhost" : address.address;
    console.log(`Server running on http://${host}:${port}`);
  });

  return server;
}

// If this module is run directly, start the server.
// This allows us to import server.js in other scripts without starting the server immediately.
if (import.meta.url === process.argv[1]) {
  console.log("Starting server...");
  const server = startServer();
  const shutdown = () => {
    console.log("Shutting down server...");
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}