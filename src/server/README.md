## Server Backend

This backend is responsible for serving application assets and acting as a proxy for external AI platforms.

**Responsibilities:**
*   Serve static assets.
*   Provide a proxy layer to AI platforms when CORS is not supported by the platforms themselves.

## System Workflow

The server operates by handling incoming requests, serving static files from the asset directory, and routing requests to the appropriate AI platform. If a platform does not support CORS, the server acts as an intermediary, proxying the requests to the external AI service to ensure functionality.