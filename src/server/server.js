import http from "http";
import express from "express";
import cors from "cors";

import { staticRoutes } from "./routes/static.js";
import { proxy } from "./routes/proxy.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

export function startServer(){
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Proxy all requests to /api and /v1 to the Ollama API
  const ollama = proxy(OLLAMA_HOST, { streamResponse: true });
  app.use("/api", ollama);
  app.use("/v1", ollama);

  // Static file serving for the web UI
  app.use(staticRoutes(import.meta.url, "../../dist/ui"));

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