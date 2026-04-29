import path from "path";
import { fileURLToPath } from "url";
import { Router, static as expressStatic } from "express";

export function staticRoutes(moduleUrl, dir){
  const _dirname = path.dirname(fileURLToPath(moduleUrl));
  const router = Router();
  router.use(expressStatic(path.join(_dirname, dir), {
    index: "index.html",
    fallthrough: true,
    setHeaders(res, filePath) {
      if (path.extname(filePath) === ".html") {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  }));
  router.use(expressStatic(path.join(_dirname, dir, "assets"), {
    fallthrough: true,
    setHeaders(res, filePath) {
      if (/^script-.+\.js(\.map)?$/.test(path.basename(filePath))) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }
  }));
  return router;
}