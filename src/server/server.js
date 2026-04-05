import express from "express";
import cors from "cors";
import { OLLAMA_HOST } from "./routes/config.js";

import { staticRoutes } from "./routes/static.js";
import { proxy } from "./routes/proxy.js";

const app = express();

app.use(cors());
app.use(express.json());

// Proxy all requests to /api and /v1 to the Ollama API
const ollama = proxy(OLLAMA_HOST, { streamResponse: true });
app.use("/api", ollama);
app.use("/v1", ollama);

// Static file serving for the web UI
app.use(staticRoutes(import.meta.url, "../../dist/ui"));

app.listen(3001, () => {
  console.log("AI server running on http://localhost:3001");
});