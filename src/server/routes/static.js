import path from "path";
import { fileURLToPath } from "url";
import { Router, static as expressStatic } from "express";

export function staticRoutes(moduleUrl, dir){
  const _dirname = path.dirname(fileURLToPath(moduleUrl));
  const router = Router();
  router.use(expressStatic(path.join(_dirname, dir), {
    index: "index.html",
    fallthrough: true
  }));
  return router;
}