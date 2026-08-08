import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(ROOT, "apps", "las-laz-worker-probe");
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self'",
  "img-src 'none'",
  "style-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
const STATIC_ROUTES = new Map([
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
  ["/laz-worker.js", {
    file: path.join(APP, "laz-worker.js"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/vendor/laz-perf.js", {
    file: path.join(
      ROOT,
      "node_modules",
      "laz-perf",
      "lib",
      "worker",
      "laz-perf.js",
    ),
    type: "text/javascript; charset=utf-8",
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

export async function prepareLasLazWorkerProbe() {
  const fixture = await acquirePublicLasLazFixture();
  const lazBytes = Buffer.from(fixture.bytes.laz);
  const truncatedBytes = Buffer.from(
    fixture.bytes.laz.subarray(
      0,
      fixture.bytes.laz.byteLength - 128,
    ),
  );
  fixture.bytes.las.fill(0);
  fixture.bytes.laz.fill(0);
  const expected = fixture.manifest.expected;
  return {
    acquisition: fixture.receipt,
    input: {
      schema: "bim-explorer-laz-worker-probe-input/0.1",
      fixture: {
        id: fixture.manifest.fixtureId,
        byteLength: fixture.manifest.entries.laz.byteLength,
        sha256: fixture.manifest.entries.laz.sha256,
        artifactTracked: false,
        releaseBundled: false,
        sampleRedistributed: false,
        testOnly: true,
      },
      expected: {
        pointRecords: expected.pointRecords,
        decodedPointBytes:
          expected.pointRecords * expected.pointRecordLength,
        decodedBounds: expected.decodedBounds,
        firstPosition: expected.firstPosition,
        lastPosition: expected.lastPosition,
        colorRange: expected.colorRange,
        pointRecordSha256: expected.pointRecordSha256,
      },
      budget: {
        maxInitializationMs: 5_000,
        maxDecodeMs: 5_000,
        maxTotalMs: 8_000,
        maxWallClockMs: 10_000,
        maxWasmHeapCapacityBytes: 64 * 1024 * 1024,
        timeoutMs: 10_000,
        cancellationGraceMs: 250,
        inCallCancellationGraceMs: 25,
        stallTimeoutMs: 500,
      },
      qualification: {
        inCallDecodePasses: 256,
        malformedMutation: "truncate-128-trailing-bytes",
        productRuntime: false,
      },
    },
    lazBytes,
    truncatedBytes,
  };
}

export function createLasLazWorkerProbeServer(prepared) {
  if (
    prepared?.input?.schema !==
      "bim-explorer-laz-worker-probe-input/0.1" ||
    !Buffer.isBuffer(prepared.lazBytes) ||
    !Buffer.isBuffer(prepared.truncatedBytes) ||
    prepared.lazBytes.byteLength !==
      prepared.input.fixture.byteLength ||
    prepared.truncatedBytes.byteLength !==
      prepared.lazBytes.byteLength - 128
  ) {
    throw new TypeError("LAS/LAZ Worker probe input is invalid");
  }
  const inputBytes = Buffer.from(
    JSON.stringify(prepared.input),
    "utf8",
  );
  const state = {
    buffersCleared: false,
    fixtureRequests: 0,
    fixtureBytes: 0,
  };
  const server = createServer(async (request, response) => {
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
      response.writeHead(400, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    let body;
    let type;
    if (pathname === "/probe-input.json") {
      body = inputBytes;
      type = "application/json; charset=utf-8";
    } else if (pathname === "/fixture/public.laz") {
      body = prepared.lazBytes;
      type = "application/octet-stream";
    } else if (pathname === "/fixture/truncated.laz") {
      body = prepared.truncatedBytes;
      type = "application/octet-stream";
    } else {
      const route = STATIC_ROUTES.get(pathname);
      if (route === undefined) {
        response.writeHead(404, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      try {
        body = await readFile(route.file);
        type = route.type;
      } catch {
        response.writeHead(500, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
    }
    if (
      request.method === "GET" &&
      pathname.startsWith("/fixture/")
    ) {
      state.fixtureRequests += 1;
      state.fixtureBytes += body.byteLength;
    }
    response.writeHead(200, headers(type, body.byteLength));
    response.end(request.method === "HEAD" ? undefined : body);
  });
  server.once("close", () => {
    prepared.lazBytes.fill(0);
    prepared.truncatedBytes.fill(0);
    inputBytes.fill(0);
    state.buffersCleared =
      prepared.lazBytes.every((value) => value === 0) &&
      prepared.truncatedBytes.every((value) => value === 0) &&
      inputBytes.every((value) => value === 0);
  });
  Object.defineProperty(server, "probeState", {
    enumerable: true,
    value: state,
  });
  return server;
}

function parsePort(values) {
  if (values.length === 0) {
    return 4175;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--port" ||
    !/^[0-9]+$/u.test(values[1])
  ) {
    throw new TypeError(
      "usage: node scripts/serve-las-laz-worker-probe.mjs " +
        "[--port 4175]",
    );
  }
  const port = Number(values[1]);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new RangeError("port must be between 1 and 65535");
  }
  return port;
}

async function main() {
  const prepared = await prepareLasLazWorkerProbe();
  const server = createLasLazWorkerProbeServer(prepared);
  const port = parsePort(process.argv.slice(2));
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `LAS/LAZ Worker probe: http://127.0.0.1:${port}\n`,
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
