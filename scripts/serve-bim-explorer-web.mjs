import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  syntheticSemanticIfc,
} from "./generate-synthetic-ifc.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(ROOT, "apps", "bim-explorer-web");
const VENDOR = path.join(ROOT, "node_modules", "web-ifc");
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "img-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");
const POINT_WORKER_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function route(file, type) {
  return Object.freeze({
    file: path.join(ROOT, file),
    type,
  });
}

const JAVASCRIPT = "text/javascript; charset=utf-8";
const ROUTES = new Map([
  ["/", {
    file: path.join(APP, "index.html"),
    type: "text/html; charset=utf-8",
    transform(body, fixture) {
      if (fixture !== "synthetic") {
        return body;
      }
      return Buffer.from(
        body.toString("utf8").replace(
          'name="bim-fixture-enabled" content="false"',
          'name="bim-fixture-enabled" content="true"',
        ),
        "utf8",
      );
    },
  }],
  ["/app.mjs", {
    file: path.join(APP, "app.mjs"),
    type: JAVASCRIPT,
  }],
  ["/source-worker.mjs", {
    file: path.join(APP, "source-worker.mjs"),
    type: JAVASCRIPT,
  }],
  ["/worker-source-client.mjs", {
    file: path.join(APP, "worker-source-client.mjs"),
    type: JAVASCRIPT,
  }],
  ["/point-source-client.mjs", {
    file: path.join(APP, "point-source-client.mjs"),
    type: JAVASCRIPT,
  }],
  ["/point-source-worker.bundle.js", {
    csp: POINT_WORKER_CONTENT_SECURITY_POLICY,
    file: path.join(APP, "point-source-worker.bundle.js"),
    type: JAVASCRIPT,
  }],
  ["/reference-mesh-explorer.mjs", {
    file: path.join(APP, "reference-mesh-explorer.mjs"),
    type: JAVASCRIPT,
  }],
  ["/styles.css", {
    file: path.join(APP, "styles.css"),
    type: "text/css; charset=utf-8",
  }],
  [
    "/packages/e57-point-source/src/format.mjs",
    route(
      "packages/e57-point-source/src/format.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/e57-point-source/src/index.mjs",
    route(
      "packages/e57-point-source/src/index.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/las-laz-point-source/src/header.mjs",
    route(
      "packages/las-laz-point-source/src/header.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/las-laz-point-source/src/index.mjs",
    route(
      "packages/las-laz-point-source/src/index.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/adapters/web-ifc/src/create-source-artifact.mjs",
    route(
      "adapters/web-ifc/src/create-source-artifact.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-model-source/src/artifact-schema.mjs",
    route(
      "packages/bim-model-source/src/artifact-schema.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-model-source/src/index.mjs",
    route("packages/bim-model-source/src/index.mjs", JAVASCRIPT),
  ],
  [
    "/packages/bim-model-source/src/semantic-index.mjs",
    route(
      "packages/bim-model-source/src/semantic-index.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-model-source/src/sha256.mjs",
    route("packages/bim-model-source/src/sha256.mjs", JAVASCRIPT),
  ],
  [
    "/packages/gltf-reference-source/src/geometry.mjs",
    route(
      "packages/gltf-reference-source/src/geometry.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/gltf-reference-source/src/index.mjs",
    route(
      "packages/gltf-reference-source/src/index.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/gltf-reference-source/src/math.mjs",
    route(
      "packages/gltf-reference-source/src/math.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/gltf-reference-source/src/profile.mjs",
    route(
      "packages/gltf-reference-source/src/profile.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-renderer-3d/src/camera-controls.mjs",
    route(
      "packages/bim-renderer-3d/src/camera-controls.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-renderer-3d/src/camera.mjs",
    route("packages/bim-renderer-3d/src/camera.mjs", JAVASCRIPT),
  ],
  [
    "/packages/bim-renderer-3d/src/host-adapter.mjs",
    route(
      "packages/bim-renderer-3d/src/host-adapter.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-renderer-3d/src/index.mjs",
    route("packages/bim-renderer-3d/src/index.mjs", JAVASCRIPT),
  ],
  [
    "/packages/bim-renderer-3d/src/measurement.mjs",
    route(
      "packages/bim-renderer-3d/src/measurement.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-renderer-3d/src/point-cloud-lod.mjs",
    route(
      "packages/bim-renderer-3d/src/point-cloud-lod.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-renderer-3d/src/point-cloud.mjs",
    route(
      "packages/bim-renderer-3d/src/point-cloud.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-renderer-3d/src/point-cloud-webgl2-backend.mjs",
    route(
      "packages/bim-renderer-3d/src/point-cloud-webgl2-backend.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-renderer-3d/src/webgl2-backend.mjs",
    route(
      "packages/bim-renderer-3d/src/webgl2-backend.mjs",
      JAVASCRIPT,
    ),
  ],
  [
    "/packages/bim-semantic-explorer/src/index.mjs",
    route(
      "packages/bim-semantic-explorer/src/index.mjs",
      JAVASCRIPT,
    ),
  ],
  ["/vendor/web-ifc-api.js", {
    file: path.join(VENDOR, "web-ifc-api.js"),
    type: JAVASCRIPT,
  }],
  ["/vendor/web-ifc.wasm", {
    file: path.join(VENDOR, "web-ifc.wasm"),
    type: "application/wasm",
  }],
  ["/vendor/laz-perf.js", {
    csp: POINT_WORKER_CONTENT_SECURITY_POLICY,
    file: path.join(
      APP,
      "laz-perf-worker-csp.js",
    ),
    type: JAVASCRIPT,
  }],
  ["/vendor/laz-perf.wasm", {
    file: path.join(
      ROOT,
      "node_modules",
      "laz-perf",
      "lib",
      "worker",
      "laz-perf.wasm",
    ),
    type: "application/wasm",
  }],
]);

function headers(
  type,
  byteLength,
  contentSecurityPolicy = CONTENT_SECURITY_POLICY,
) {
  return {
    "Cache-Control": "no-store",
    "Content-Length": String(byteLength),
    "Content-Security-Policy": contentSecurityPolicy,
    "Content-Type": type,
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function validFixture(value) {
  if (value === "none" || value === "synthetic") {
    return value;
  }
  throw new TypeError(
    "BIM Explorer fixture must be none or synthetic",
  );
}

export function createBimExplorerWebServer({
  fixture = "none",
} = {}) {
  const enabledFixture = validFixture(fixture);
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
      if (
        pathname === "/qualification-fixture.ifc" &&
        enabledFixture === "synthetic"
      ) {
        const body = Buffer.from(syntheticSemanticIfc(), "utf8");
        response.writeHead(
          200,
          headers("model/vnd.ifc", body.byteLength),
        );
        response.end(
          request.method === "HEAD" ? undefined : body,
        );
        return;
      }
      const selected = ROUTES.get(pathname);
      if (selected === undefined) {
        response.writeHead(404, {
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }
      let body = await readFile(selected.file);
      body = selected.transform?.(
        body,
        enabledFixture,
      ) ?? body;
      response.writeHead(
        200,
        headers(
          selected.type,
          body.byteLength,
          selected.csp,
        ),
      );
      response.end(
        request.method === "HEAD" ? undefined : body,
      );
    } catch {
      response.writeHead(500, {
        "Cache-Control": "no-store",
      });
      response.end();
    }
  });
}

export function parseBimExplorerWebArguments(values) {
  let fixture = "none";
  let port = 4176;
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (name === "--fixture") {
      fixture = validFixture(value);
    } else if (
      name === "--port" &&
      /^[0-9]+$/u.test(value ?? "")
    ) {
      port = Number(value);
    } else {
      throw new TypeError(
        "usage: node scripts/serve-bim-explorer-web.mjs " +
          "[--port 4176] [--fixture none|synthetic]",
      );
    }
  }
  if (
    !Number.isSafeInteger(port) ||
    port <= 0 ||
    port > 65_535
  ) {
    throw new TypeError("port must be between 1 and 65535");
  }
  return Object.freeze({
    fixture,
    port,
  });
}

async function main() {
  const options = parseBimExplorerWebArguments(
    process.argv.slice(2),
  );
  const server = createBimExplorerWebServer(options);
  server.listen(options.port, "127.0.0.1", () => {
    process.stdout.write(
      `BIM Explorer: http://127.0.0.1:${options.port}\n`,
    );
  });
  const close = () => server.close();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
