// @vitest-environment node
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebDavDocumentStore } from "../../../../src/browser/lib/document/stores/webdav-document-store.js";
import { DocumentPath } from "../../../../src/browser/lib/document/document-service.js";
import { DocumentConcurrencyError, DocumentIdConflictError } from "../../../../src/browser/lib/document/errors.js";

function path(str: string): DocumentPath {
  return DocumentPath.parse(str);
}

function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
  json?: unknown;
  etag?: string;
}): Response {
  const { ok = true, status = 200, statusText = "OK", text = "", json, etag } = opts;
  const headers = new Headers();
  if (etag) headers.set("ETag", etag);
  return {
    ok,
    status,
    statusText,
    headers,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(json),
  } as unknown as Response;
}

describe("WebDavDocumentStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("read", () => {
    it("returns content and strips quotes from ETag to form version", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        makeResponse({ text: "# Doc", etag: '"abc123"' })
      ));
      const store = new WebDavDocumentStore("https://example.com");
      const { content, version } = await store.read(path("/doc.md"));
      expect(content).toBe("# Doc");
      expect(version).toBe("abc123");
    });

    it("throws for 404", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        makeResponse({ ok: false, status: 404, statusText: "Not Found" })
      ));
      const store = new WebDavDocumentStore("https://example.com");
      await expect(store.read(path("/missing.md"))).rejects.toThrow("File not found");
    });

    it("throws on non-404 server error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        makeResponse({ ok: false, status: 500, statusText: "Server Error" })
      ));
      const store = new WebDavDocumentStore("https://example.com");
      await expect(store.read(path("/doc.md"))).rejects.toThrow("Failed to read file");
    });
  });

  describe("write", () => {
    it("sends PUT and returns version stripped from ETag", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeResponse({ etag: '"v2"' }));
      vi.stubGlobal("fetch", mockFetch);
      const store = new WebDavDocumentStore("https://example.com");
      const version = await store.write(path("/doc.md"), "content");
      expect(version).toBe("v2");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/doc.md"),
        expect.objectContaining({ method: "PUT" })
      );
    });

    it("sends If-Match header when expectedVersion is provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeResponse({ etag: '"v2"' }));
      vi.stubGlobal("fetch", mockFetch);
      const store = new WebDavDocumentStore("https://example.com");
      await store.write(path("/doc.md"), "content", "v1");
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.headers).toMatchObject({ "If-Match": '"v1"' });
    });

    it("throws DocumentConcurrencyError on 412", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        makeResponse({ ok: false, status: 412 })
      ));
      const store = new WebDavDocumentStore("https://example.com");
      await expect(store.write(path("/doc.md"), "x", "stale"))
        .rejects.toBeInstanceOf(DocumentConcurrencyError);
    });
  });

  describe("mv", () => {
    it("sends a MOVE request", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeResponse({}));
      vi.stubGlobal("fetch", mockFetch);
      const store = new WebDavDocumentStore("https://example.com");
      await store.mv(path("/old.md"), path("/new.md"));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/old.md"),
        expect.objectContaining({ method: "MOVE" })
      );
    });

    it("is a no-op when source and destination are the same", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);
      const store = new WebDavDocumentStore("https://example.com");
      await store.mv(path("/doc.md"), path("/doc.md"));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws DocumentIdConflictError on 412", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        makeResponse({ ok: false, status: 412 })
      ));
      const store = new WebDavDocumentStore("https://example.com");
      await expect(store.mv(path("/a.md"), path("/b.md")))
        .rejects.toBeInstanceOf(DocumentIdConflictError);
    });
  });

  describe("rm", () => {
    it("sends a DELETE request", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeResponse({}));
      vi.stubGlobal("fetch", mockFetch);
      const store = new WebDavDocumentStore("https://example.com");
      await store.rm(path("/doc.md"));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/doc.md"),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("throws for 404", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        makeResponse({ ok: false, status: 404 })
      ));
      const store = new WebDavDocumentStore("https://example.com");
      await expect(store.rm(path("/doc.md"))).rejects.toThrow("File not found");
    });
  });

  describe("ls", () => {
    it("returns parsed file entries with versions stripped from ETags", async () => {
      const files = [
        { filename: "/a.md", version: '"v1"' },
        { filename: "/b.md", version: '"v2"' },
      ];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ json: files })));
      const store = new WebDavDocumentStore("https://example.com");
      const entries = await store.ls();
      const sorted = [...entries].sort((a, b) => a.filepath.toString().localeCompare(b.filepath.toString()));
      expect(sorted.map(e => e.filepath.toString())).toEqual(["/a.md", "/b.md"]);
      expect(sorted[0].version).toBe("v1");
      expect(sorted[1].version).toBe("v2");
    });

    it("throws when response is not an array", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ json: { error: "bad" } })));
      const store = new WebDavDocumentStore("https://example.com");
      await expect(store.ls()).rejects.toThrow("Invalid response format");
    });

    it("strips trailing slash from base URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue(makeResponse({ json: [] }));
      vi.stubGlobal("fetch", mockFetch);
      const store = new WebDavDocumentStore("https://example.com/");
      await store.ls();
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).not.toMatch(/\/\/documents/);
    });
  });
});
