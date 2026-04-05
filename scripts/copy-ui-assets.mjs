import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, "..", "src", "ui");
const destRoot = path.resolve(here, "..", "dist", "ui");

const ignoredExtensions = new Set([".ts", ".tsx", ".map"]);

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function shouldCopyFile(fileName) {
  if (fileName.includes(".test.")) {
    return false;
  }
  const extension = path.extname(fileName);
  if (ignoredExtensions.has(extension)) {
    return false;
  }
  return true;
}

async function copyDirectory(sourceDir, targetDir) {
  await ensureDir(targetDir);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!shouldCopyFile(entry.name)) {
      continue;
    }

    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
  }
}

await copyDirectory(sourceRoot, destRoot);
