import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import fs from "fs/promises";

export function storeRoutes(moduleUrl, storeDir){
  const _dirname = path.dirname(fileURLToPath(moduleUrl));
  const storeRoot = path.resolve(_dirname, storeDir);
  const router = Router();

  // The router will be mounted at /documents, so the full path will be /documents/:filename
  router.param("path", async (req, res, next, filePath) => {
    const rawPath = Array.isArray(filePath)
      ? filePath.join("/")
      : typeof filePath === "string"
        ? filePath
        : "";
    const normalizedPath = rawPath.replace(/^\/+/, "");
    const safePath = path.resolve(storeRoot, normalizedPath);
    const insideStore = safePath === storeRoot || safePath.startsWith(`${storeRoot}${path.sep}`);
    if (!insideStore) {
      return res.status(400).json({ error: "Invalid path" });
    }
    req.safePath = safePath;
    next();
  });

  // Route for handling file operations.
  const route = router.route("/{*path}");
  const rootRoute = router.route("/");

  // Handle CORS preflight request
  // TODO: Limit allowed origins to the editor's frontend URL in production for better security
  // TODO: Enforce authentication on store routes to prevent unauthorized access to the file system
  const optionsHandler = async (req, res) => {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.set("Allow", "GET, PUT, DELETE, MOVE, PROPFIND, OPTIONS");
    res.status(204).send();
  };

  route.options(optionsHandler);
  rootRoute.options(optionsHandler);

  /*
   * Basic WebDAV methods for file operations. Using ETag for optimistic concurrency control to prevent overwriting changes.
   * There is no support for locking, directory listing, or other advanced WebDAV features. This is a minimal implementation to support the editor's needs.
   * Response status codes:
   * 200 OK → file read successfully
   * 201 Created → new file created
   * 204 No Content → file overwritten / deleted successfully
   * 409 Conflict → parent directory doesn’t exist
   * 412 Precondition Failed → ETag mismatch (file has been modified since last read)
   */

  const webDavGetHandler = async (req, res) => {
    if (!req.safePath) {
      return res.status(404).json({ error: "File not found" });
    }

    const filePath = req.safePath;
    const [stats, content] = await Promise.all([
      fs.stat(filePath),
      fs.readFile(filePath, "utf8")
    ]);

    if(filePath.endsWith(".md")){
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    // Set Content-Disposition header to suggest a filename when downloading the file. This allows 'Download' UX with a meaningful filename.
    res.setHeader("Content-disposition", `attachment; filename="${path.basename(filePath)}"`);

    res.setHeader("ETag", `"${stats.mtime.getTime()}"`);
    res.status(200).send(content);
  };

  const webDavPutHandler = async (req, res) => {
    if (!req.safePath) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const filePath = req.safePath;
    const ifMatch = req.header("if-match");

    let existingStats;
    try {
      existingStats = await fs.stat(filePath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    if (ifMatch) {
      const currentVersion = existingStats ? `"${existingStats.mtime.getTime()}"` : undefined;
      if (!currentVersion || currentVersion !== ifMatch.trim()) {
        return res.status(412).json({ error: "Version conflict" });
      }
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    try {
      await fs.writeFile(filePath, body, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(409).json({ error: "Parent directory does not exist" });
      }
      throw err;
    }

    const newStats = await fs.stat(filePath);
    res.setHeader("ETag", `"${newStats.mtime.getTime()}"`);
    res.status(existingStats ? 204 : 201).send();
  };

  const webDavMoveHandler = async (req, res) => {
    if (!req.safePath) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const sourcePath = req.safePath;
    const destinationHeader = req.header("destination");
    if (!destinationHeader) {
      return res.status(400).json({ error: "Missing Destination header" });
    }

    const destinationUrl = new URL(destinationHeader, `${req.protocol}://${req.get("host")}`);
    const expectedPrefix = `${req.baseUrl}/`;
    if (!destinationUrl.pathname.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: "Invalid destination path" });
    }

    const encodedDestination = destinationUrl.pathname.slice(expectedPrefix.length);
    const destinationRelativePath = encodedDestination
      .split("/")
      .filter(Boolean)
      .map(segment => decodeURIComponent(segment))
      .join("/");

    const destinationPath = path.resolve(storeRoot, destinationRelativePath);
    const insideStore = destinationPath === storeRoot || destinationPath.startsWith(`${storeRoot}${path.sep}`);
    if (!insideStore) {
      return res.status(400).json({ error: "Invalid destination path" });
    }

    try {
      await fs.stat(destinationPath);
      return res.status(412).json({ error: "Destination already exists" });
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    try {
      await fs.rename(sourcePath, destinationPath);
      return res.status(204).send();
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      throw err;
    }
  };

  const webDavDeleteHandler = async (req, res) => {
    if (!req.safePath) {
      return res.status(404).json({ error: "File not found" });
    }

    try {
      await fs.unlink(req.safePath);
      res.status(204).send();
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      throw err;
    }
  };

  const webDavPropfindHandler = async (req, res) => {
    const listPath = req.safePath ?? storeRoot;
    let entries;
    try {
      entries = await fs.readdir(listPath, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(200).json([]);
      }
      throw err;
    }

    const files = await Promise.all(entries
      .map(async entry => {
        const absolutePath = path.join(listPath, entry.name);
        const stats = await fs.stat(absolutePath);
        const relativePath = path.relative(storeRoot, absolutePath).replace(/\\/g, "/");
        return {
          filename: relativePath,
          version: `${stats.mtime.getTime()}`
        };
      }));

    res.status(200).json(files);
  };

  const webDavHandlers = {
    "GET": webDavGetHandler,
    "PUT": webDavPutHandler,
    "MOVE": webDavMoveHandler,
    "DELETE": webDavDeleteHandler,
    "PROPFIND": webDavPropfindHandler
  }

  // Handle WebDAV methods with a custom handler since Express doesn't support all WebDAV methods natively
  const webDavRouteHandler = async (req, res, next) => {
    const method = req.method.toUpperCase();
    const handler = webDavHandlers[method];
    if (handler) {
      try {
        return await handler(req, res, next);
      } catch (err) {
        // Return a JSON error responses for easier handling on the client side
        if (err.code === "ENOENT") {
          // Return 404 for missing files instead of 500 to simplify client-side error handling
          res.status(404).json({ error: "File not found" });
          return;
        }
        console.error(`Error handling ${req.method} request:`, err);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }
    }
    next();
  };

  route.all(webDavRouteHandler);
  rootRoute.all(webDavRouteHandler);

  router.use((err, req, res, next) => {
    console.error("Unhandled store route error:", err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: "Internal Server Error" });
  });



  return router;
}