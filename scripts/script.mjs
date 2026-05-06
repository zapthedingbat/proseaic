import { build, context } from "esbuild";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { startServer } from "../src/server/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const sourceStaticAssetsDir = path.join(root, "src", "browser", "assets");
const destStaticAssetsDir = path.join(root, "dist", "browser", "assets");
const staticAssetsExtensions = new Set([".html", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webmanifest"]);
const sourceFileExtensions = new Set([".ts", ".css"]);

function isStaticAssetFile (fileName) {
  return staticAssetsExtensions.has(path.extname(fileName));
}

async function copyAllFiles(signal, srcDir, destDir, filter = () => true) {
  // Ensure the destination directory exists
  // Recursively copy files from srcDir to destDir, applying the filter to determine which files to copy
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (signal.aborted) {
      return;
    }
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyAllFiles(signal, srcPath, destPath, filter);
    } else if (entry.isFile() && filter(entry.name)) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function getBuildOptions() {
  const demoMode = process.env["DEMO_MODE"] === "true";
  return {
    absWorkingDir: root,
    entryPoints: ["src/browser/script.ts"],
    bundle: true,
    loader: {
      ".css": "text"
    },
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outdir: "dist/browser/assets",
    entryNames: "[name]-[hash]",
    sourcemap: true,
    metafile: true,
    logLevel: "info",
    define: {
      "DEMO_MODE": demoMode ? "true" : "false",
      "BUILD_SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN || ""),
    },
  };
}

async function processBuildResult(result) {
  if(result.errors.length > 0) {
    console.error("Build failed with errors:");
    for(const error of result.errors) {
      console.error(error.text);
    }
    return;
  }

  if(result.warnings.length > 0) {
    console.warn("Build completed with warnings:");
    for(const warning of result.warnings) {
      console.warn(warning.text);
    }
  }

  const scriptOutput = Object.keys(result.metafile.outputs).find(k => !k.endsWith('.map') && k.endsWith('.js'));
  const scriptName = path.basename(scriptOutput);

  // Remove stale hashed script files from previous builds
  const assetsDir = path.join(root, "dist", "browser", "assets");
  const existing = await fs.readdir(assetsDir).catch(() => []);
  await Promise.all(
    existing
      .filter(f => /^script-.+\.js(\.map)?$/.test(f) && f !== scriptName && f !== `${scriptName}.map`)
      .map(f => fs.unlink(path.join(assetsDir, f)))
  );

  // Write index.html with the hashed script filename and SRI integrity attribute
  const scriptContent = await fs.readFile(path.join(assetsDir, scriptName));
  const sri = `sha384-${createHash("sha384").update(scriptContent).digest("base64")}`;
  const html = await fs.readFile(path.join(root, "src", "browser", "index.html"), "utf8");
  let updated = html.replace(/(<script\b[^>]+\bsrc=")[^"]*\.js(")/, `$1assets/${scriptName}$2`);
  updated = updated.replace(/(<script\b[^>]*\bsrc="[^"]*")([^>]*>)/, `$1 integrity="${sri}" crossorigin="anonymous"$2`);
  await fs.mkdir(path.join(root, "dist", "browser"), { recursive: true });
  await fs.writeFile(path.join(root, "dist", "browser", "index.html"), updated);
}

async function copyCodiconAssets(signal, destPath) {
  signal.throwIfAborted();
  const codiconSrc = path.join(root, "node_modules", "@vscode", "codicons", "dist");
  await fs.mkdir(destPath, { recursive: true });
  for (const file of ["codicon.css", "codicon.ttf"]) {
    await fs.copyFile(path.join(codiconSrc, file), path.join(destPath, file));
  }
}

async function runBuild(signal) {
  signal.throwIfAborted();

  // Build the project and copy static assets, ensuring that we have the latest build output and assets in place.
  const [,,result] = await Promise.all([
    copyAllFiles(signal, sourceStaticAssetsDir, destStaticAssetsDir, isStaticAssetFile),
    copyCodiconAssets(signal, destStaticAssetsDir),
    build(getBuildOptions())
  ]);
  await processBuildResult(result);
}

async function runStart(signal) {
  signal.throwIfAborted();

  // Build the project and copy static assets before starting the server, so that we have everything in place before we start serving requests.
  const [,,result] = await Promise.all([
    copyAllFiles(signal, sourceStaticAssetsDir, destStaticAssetsDir, isStaticAssetFile),
    copyCodiconAssets(signal, destStaticAssetsDir),
    build(getBuildOptions())
  ]);
  await processBuildResult(result);

  // Start the server after the initial build and asset copying is complete, so that we can serve the latest build immediately.
  const server = startServer();
  signal.onabort = () => {
    console.log("Shutting down server...");
    server.close(() => {
      console.log("Server closed.");
    });
  };
} 

async function rebuildContext(ctx) {
  const result = await ctx.rebuild();
  await processBuildResult(result);
}

async function runWatch(signal) {
  signal.throwIfAborted();

  // Start the server before watching for file changes, so that we can serve the latest build immediately.  
  const server = startServer();

  // Create a build context that we can use to trigger rebuilds on file changes.
  const ctx = await context(getBuildOptions());

  // Clear the destination directory and copy all static assets before starting to watch for changes, so that we have a clean slate to work with.
  await fs.rm(destStaticAssetsDir, { recursive: true, force: true });

  // Function to perform a full rebuild of the project and copy all static assets, which we can call both initially and whenever we want to trigger a full rebuild (e.g. on demand or when certain files change).
  const rebuildAll = async () => {
    console.log("Building all assets and source files...");
    // Copy all static assets initially, so that we have them in place before the first build completes.
    // We can be selective about which files to copy based on their extensions, since we only want to copy static assets and not source files or other non-asset files.
    await copyAllFiles(signal, sourceStaticAssetsDir, destStaticAssetsDir, isStaticAssetFile);
    await copyCodiconAssets(signal, destStaticAssetsDir);

    // Perform the initial build after copying static assets, so that we have the first build output ready to serve.
    await rebuildContext(ctx);

    console.log("Build and asset copying complete.");
  }
  await rebuildAll();

  // Watch the source directory for changes and trigger a rebuild when files change.
  const watchRoot = path.join(root, "src", "browser");
  try {
    console.log(`Watching for file changes in: ${watchRoot}`);
    const watcher = fs.watch(watchRoot,  { recursive: true, signal });
    for await (const {eventType, filename} of watcher) {
      console.log(`File changed: ${filename} (${eventType})`);
      if(isStaticAssetFile(filename)) {
        console.log(`Copying changed static asset: ${filename}`);
        const srcPath = path.join(sourceStaticAssetsDir, filename);
        const destPath = path.join(destStaticAssetsDir, filename);
        await fs.copyFile(srcPath, destPath);
      } else if (sourceFileExtensions.has(path.extname(filename))) {
        console.log(`Source file changed: ${filename}, triggering rebuild...`);
        await rebuildContext(ctx);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError'){
      console.log("Watch mode aborted.");
      return;
    }
    throw err;
  }

  // Press 'R' key to trigger a restart in watch mode
  process.stdin.on("data", async (data) => {
    const key = data.toString();
    if (key.toLowerCase() === "r") {
      rebuildAll();
    }
  });

  // Clean up resources when the signal is aborted, ensuring that we shut down the server and dispose of the build context properly to free up resources and avoid potential memory leaks or dangling processes.
  await new Promise((resolve, reject) => {
    // Clean up resources when the signal is aborted
    signal.onabort = () => {
      console.log("Shutting down server...");
      Promise.allSettled([
        new Promise((res) => server.close(() => {
          console.log("Server closed.");
          res();
        })),
        ctx.dispose()
      ]).then(() => {
        console.log("Clean up complete, exiting.");
        resolve();
      }).catch(err => {
        console.error("Error during clean up:", err);
        reject(err);
      });
    }
  });
}

const scripts = {
  build: runBuild,
  start: runStart,
  watch: runWatch
};

// Simple command-line interface to run different scripts based on the first argument
const mode = process.env["npm_lifecycle_event"] || process.argv[2];
let script;
if (!mode || !(script = scripts[mode])) {
  console.error(`Error: No mode specified or invalid mode. '${mode}' is not a valid mode.`);
  console.error(`Usage: ${process.argv[1]} <mode>`);
  console.error(`Available modes: ${Object.keys(scripts).join(", ")}`);
  process.exit(1);
}

const abortController = new AbortController();

// Ctrl+C handler to gracefully shut down watch mode
process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  abortController.abort();
  process.exit(0);
});

// SIGTERM handler to gracefully shut down watch mode
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  abortController.abort();
  process.exit(0);
});

// Run the selected script function with the provided arguments and handle the result if it's a promise.
console.log(`Running script for mode: ${mode}`);
const args = process.argv.slice(3);
const result = script.apply(null, [abortController.signal, ...args]);
if (result instanceof Promise) {
  result.then(() => {
    console.log(`Script for mode '${mode}' completed successfully.`);
    if (mode === "build") {
      process.exit(0);
    }
  })
  .catch(err => {
    console.error(`Error running script for mode '${mode}':`, err);
    process.exit(1);
  });
}

