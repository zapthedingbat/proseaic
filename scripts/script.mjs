import { build, context } from "esbuild";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { startServer } from "../src/server/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const sourceStaticAssetsDir = path.join(root, "src", "ui");
const destStaticAssetsDir = path.join(root, "dist", "ui");
const staticAssetsExtensions = new Set([".html", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg"]);

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
  return {
    absWorkingDir: root,
    entryPoints: ["src/ui/script.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outfile: "dist/ui/script.js",
    sourcemap: true,
    logLevel: "info"
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

  if(result.outputFiles) {
    for(const outputFile of result.outputFiles) {
      const outputPath = path.join(root, outputFile.path);
      console.log(`Output written to: ${outputPath}`);
    }
  }
}

async function copyCodiconAssets(signal) {
  signal.throwIfAborted();
  const codiconSrc = path.join(root, "node_modules", "@vscode", "codicons", "dist");
  await fs.mkdir(destStaticAssetsDir, { recursive: true });
  for (const file of ["codicon.css", "codicon.ttf"]) {
    await fs.copyFile(path.join(codiconSrc, file), path.join(destStaticAssetsDir, file));
  }
}

async function runBuild(signal) {
  signal.throwIfAborted();

  // Build the project and copy static assets, ensuring that we have the latest build output and assets in place.
  await Promise.all([
    copyAllFiles(signal, sourceStaticAssetsDir, destStaticAssetsDir, isStaticAssetFile),
    copyCodiconAssets(signal),
    build(getBuildOptions())
  ]);
}

async function runStart(signal) {
  signal.throwIfAborted();

  // Build the project and copy static assets before starting the server, so that we have everything in place before we start serving requests.
  await Promise.all([
    copyAllFiles(signal, sourceStaticAssetsDir, destStaticAssetsDir, isStaticAssetFile),
    copyCodiconAssets(signal),
    build(getBuildOptions())
  ]);

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
    await copyCodiconAssets(signal);

    // Perform the initial build after copying static assets, so that we have the first build output ready to serve.
    await rebuildContext(ctx);

    console.log("Build and asset copying complete.");
  }
  await rebuildAll();

  // Watch the source directory for changes and trigger a rebuild when files change.
  const watchRoot = path.join(root, "src", "ui");
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
      } else if (path.extname(filename) === ".ts") {
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
    process.exit(0);
  })
  .catch(err => {
    console.error(`Error running script for mode '${mode}':`, err);
    process.exit(1);
  });
}

