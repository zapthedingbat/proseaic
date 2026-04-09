import fs from "fs";

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

async function streamResponseToClient(upstreamRes, res) {
  if (!upstreamRes.body) {
    return;
  }

  const reader = upstreamRes.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      res.write(Buffer.from(value));
    }
  }
}

export function proxy(upstreamBaseUrl, options = {}) {
  const { targetPath = null, streamResponse = false } = options;

  return async (req, res, next) => {
    try {
      const url = resolveUpstreamUrl(req, upstreamBaseUrl, targetPath);

      // Log request
      console.log("→ Request");
      console.dir({
        method: req.method,
        url: url.toString(),
        headers: req.headers,
        body: req.body,
      }, { depth: null, colors: true });

      // log request to file for debugging
    
      await fs.promises.mkdir("./logs", { recursive: true });
      const logFileName = `./logs/proxy-${Date.now()}.log`;
      await fs.promises.writeFile(logFileName, JSON.stringify({
        method: req.method,
        url: url.toString(),
        headers: req.headers,
        body: req.body,
      }, null, 2));
      
      // Prepare body for forwarding
      let body;
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (typeof req.body === "object") {
          body = JSON.stringify(req.body);
        } else {
          body = req.body;
        }
      }

      const upstreamRes = await fetch(url, {
        method: req.method,
        headers: {
          ...req.headers,
          host: undefined,
        },
        body,
      });

      // Send response
      res.status(upstreamRes.status);

      upstreamRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (streamResponse) {
        console.log("← Response");
        console.dir({
          status: upstreamRes.status,
          headers: Object.fromEntries(upstreamRes.headers),
          body: "<streamed>",
        }, { depth: null, colors: true });

        await streamResponseToClient(upstreamRes, res);
        res.end();
        return;
      }

      // Read response body fully
      const contentType = upstreamRes.headers.get("content-type") || "";
      let responseBody;

      if (contentType.includes("application/json")) {
        responseBody = await upstreamRes.json();
      } else {
        responseBody = await upstreamRes.text();
      }

      // Log response
      console.log("← Response");
      console.dir({
        status: upstreamRes.status,
        headers: Object.fromEntries(upstreamRes.headers),
        body: responseBody,
      }, { depth: null, colors: true });

      if (typeof responseBody === "object") {
        res.json(responseBody);
      } else {
        res.send(responseBody);
      }

    } catch (err) {
      console.error("Proxy error:", err);
      next(err);
    }
  };
}