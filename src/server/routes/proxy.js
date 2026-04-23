import fs from "fs";
import { Readable, PassThrough } from "stream";

const LOGGING_TO_FILE = true;
const LOGGING_TO_CONSOLE = true;

function resolveUpstreamUrl(req, upstreamBaseUrl, targetPath) {
  if (typeof targetPath === "string" && targetPath.length > 0) {
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    const url = new URL(targetPath, upstreamBaseUrl);
    url.search = query;
    return url;
  }

  return new URL(req.originalUrl, upstreamBaseUrl);
}

export function proxy(prefix, upstreamBaseUrl, options = {}) {
  const { targetPath = null } = options;

  return async (req, res, next) => {

    if(!req.path.startsWith(prefix)) {
      return next();
    }

    let fileLogStream = null;

    try {
      const upstreamUrl = new URL(req.originalUrl.replace(prefix, ""), upstreamBaseUrl);

      const upstreamHeaders = {
        ...req.headers,
        host: upstreamUrl.host
      };

      if (LOGGING_TO_FILE) {
        await fs.promises.mkdir("./logs", { recursive: true });
        const logFileName = `./logs/${Date.now()}-${upstreamUrl.hostname}.log`;
        fileLogStream = fs.createWriteStream(logFileName);
        fileLogStream.write(`${req.method} ${upstreamUrl.toString()}\n`);
        fileLogStream.write(`${Object.entries(upstreamHeaders)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n")
        }\n\n`);
      }

      if (LOGGING_TO_CONSOLE) {
        process.stdout.write(`${req.method} ${upstreamUrl.toString()}\n`);
        process.stdout.write(`${Object.entries(upstreamHeaders)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n")
        }\n\n`);
      }

      // Pipe req to each log target with { end: false } so the streams stay
      // open for the response. Also pipe to a PassThrough that feeds fetch,
      // letting it end naturally to signal end-of-body to the upstream.
      let fetchBody = null;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const fetchBranch = new PassThrough();
        if (fileLogStream) {
          req.pipe(fileLogStream, { end: false });
        }
        if (LOGGING_TO_CONSOLE) {
          req.pipe(process.stdout, { end: false });
        }
        req.pipe(fetchBranch);
        fetchBody = Readable.toWeb(fetchBranch);
      }

      const upstreamRes = await fetch(upstreamUrl.toString(), {
        method: req.method,
        headers: upstreamHeaders,
        body: fetchBody,
        duplex: "half",
      });

      // Send response
      res.status(upstreamRes.status, upstreamRes.statusText);

      // Filter out encoding headers because fetch will automatically decode the response body, and we don't want to send uncompressed data to the client if it doesn't expect it.
      // A better fix would be to not decode the response body in the first place, but that makes it harder to log and requires using undici.request directly instead of fetch.
      upstreamRes.headers.forEach((value, key) => {
        if (key === "content-encoding") return;
        if (key === "content-length") return;
        res.setHeader(key, value);
      });

      if (fileLogStream) {
        fileLogStream.write(`${upstreamRes.status} ${upstreamRes.statusText}\n`);
        fileLogStream.write(`${Object.entries(upstreamRes.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n")
        }\n`);
        fileLogStream.write("\n");
      }

      if (LOGGING_TO_CONSOLE) {
        process.stdout.write(`${upstreamRes.status} ${upstreamRes.statusText}\n`);
        process.stdout.write(`${Object.entries(upstreamRes.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n")
        }\n`);
        process.stdout.write("\n");
      }

      if (!upstreamRes.body) {
        if (fileLogStream){
          fileLogStream.end();
        }
        res.end();
        return;
      }

      // Stream response body to client and log simultaneously
      const responseReader = upstreamRes.body.getReader();
  
      // Read the response body in chunks and write to the client as they arrive
      while (true) {
        const { value, done } = await responseReader.read();

        if (done){
          break;
        }

        if (value) {
          const buf = Buffer.from(value);
          res.write(buf);
          if(LOGGING_TO_CONSOLE) {
            process.stdout.write(buf);  // stream to console
          }
          if (fileLogStream) {
            fileLogStream.write(buf);  // stream to log file
          }
        }
      }

      if (fileLogStream) {
        fileLogStream.end();
      }
      res.end();
      return;

    } catch (err) {
      console.error("Error proxying request:", err);
      if (fileLogStream){
        fileLogStream.destroy();
      }
      res.status(502).send("Bad Gateway");
    }
  };
}