import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syntheticIfc } from "./generate-synthetic-ifc.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(ROOT, "apps", "browser-worker-probe");
const ROUTES = new Map([
  ["/", {
    file: path.join(APP, "index.html"),
    type: "text/html; charset=utf-8",
  }],
  ["/app.mjs", {
    file: path.join(APP, "app.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/worker-client.mjs", {
    file: path.join(APP, "worker-client.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/source-session.mjs", {
    file: path.join(APP, "source-session.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/ifc-worker.mjs", {
    file: path.join(APP, "ifc-worker.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/styles.css", {
    file: path.join(APP, "styles.css"),
    type: "text/css; charset=utf-8",
  }],
  ["/vendor/web-ifc-api.js", {
    file: path.join(ROOT, "node_modules", "web-ifc", "web-ifc-api.js"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/vendor/web-ifc.wasm", {
    file: path.join(ROOT, "node_modules", "web-ifc", "web-ifc.wasm"),
    type: "application/wasm",
  }],
]);
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "img-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function headers(type, byteLength) {
  return {
    "Cache-Control": "no-store",
    "Content-Length": String(byteLength),
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Content-Type": type,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

async function responseFor(pathname) {
  if (pathname === "/fixture/synthetic-small.ifc") {
    return {
      body: Buffer.from(syntheticIfc(), "utf8"),
      type: "model/vnd.ifc",
    };
  }
  const route = ROUTES.get(pathname);
  if (!route) {
    return null;
  }
  return {
    body: await readFile(route.file),
    type: route.type,
  };
}

export function createBrowserWorkerProbeServer() {
  return createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(405, {
        Allow: "GET, HEAD",
        "Cache-Control": "no-store",
      });
      response.end();
      return;
    }
    let pathname;
    try {
      pathname = new URL(
        request.url ?? "/",
        "http://127.0.0.1",
      ).pathname;
    } catch {
      response.writeHead(400, {
        "Cache-Control": "no-store",
      });
      response.end();
      return;
    }
    try {
      const representation = await responseFor(pathname);
      if (representation === null) {
        response.writeHead(404, {
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }
      response.writeHead(
        200,
        headers(representation.type, representation.body.byteLength),
      );
      response.end(
        request.method === "HEAD" ? undefined : representation.body,
      );
    } catch {
      response.writeHead(500, {
        "Cache-Control": "no-store",
      });
      response.end();
    }
  });
}

function parsePort(values) {
  if (values.length === 0) {
    return 4173;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--port" ||
    !/^[0-9]+$/u.test(values[1])
  ) {
    throw new TypeError(
      "usage: node scripts/serve-browser-worker-probe.mjs [--port 4173]",
    );
  }
  const port = Number(values[1]);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new TypeError("port must be between 1 and 65535");
  }
  return port;
}

async function main() {
  const port = parsePort(process.argv.slice(2));
  const server = createBrowserWorkerProbeServer();
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `Browser Worker probe: http://127.0.0.1:${port}\n`,
    );
  });
  const close = () => {
    server.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
