import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLasPointRange } from "./las-point-range.mjs";
import {
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(
  ROOT,
  "apps",
  "las-laz-point-renderer-probe",
);
const RENDERER = path.join(
  ROOT,
  "packages",
  "bim-renderer-3d",
  "src",
);
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "worker-src 'none'",
  "img-src 'none'",
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
  ["/styles.css", {
    file: path.join(APP, "styles.css"),
    type: "text/css; charset=utf-8",
  }],
  ["/bim-renderer-3d.mjs", {
    file: path.join(RENDERER, "index.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/point-cloud.mjs", {
    file: path.join(RENDERER, "point-cloud.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/point-cloud-lod.mjs", {
    file: path.join(RENDERER, "point-cloud-lod.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/point-cloud-webgl2-backend.mjs", {
    file: path.join(
      RENDERER,
      "point-cloud-webgl2-backend.mjs",
    ),
    type: "text/javascript; charset=utf-8",
  }],
  ["/webgl2-backend.mjs", {
    file: path.join(RENDERER, "webgl2-backend.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/camera.mjs", {
    file: path.join(RENDERER, "camera.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/camera-controls.mjs", {
    file: path.join(RENDERER, "camera-controls.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/host-adapter.mjs", {
    file: path.join(RENDERER, "host-adapter.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/measurement.mjs", {
    file: path.join(RENDERER, "measurement.mjs"),
    type: "text/javascript; charset=utf-8",
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

export async function prepareLasLazPointRendererProbe() {
  const fixture = await acquirePublicLasLazFixture();
  let derived;
  try {
    derived = createLasPointRange(fixture.bytes.las);
    const expected = fixture.manifest.expected;
    if (
      derived.profile.source.pointRecords !== expected.pointRecords ||
      derived.profile.source.pointRecordSha256 !==
        expected.pointRecordSha256 ||
      JSON.stringify(
        derived.profile.coordinateProjection.rawBounds,
      ) !== JSON.stringify(expected.decodedBounds) ||
      derived.profile.coordinateProjection.crsAuthority !== false
    ) {
      throw new Error(
        "LAS point renderer derivation differs from its fixture",
      );
    }
    const rangeBytes = Buffer.from(derived.bytes);
    const input = {
      schema: "bim-explorer-las-laz-point-renderer-probe-input/1",
      fixture: {
        id: fixture.manifest.fixtureId,
        las: {
          byteLength: fixture.manifest.entries.las.byteLength,
          sha256: fixture.manifest.entries.las.sha256,
        },
        laz: {
          byteLength: fixture.manifest.entries.laz.byteLength,
          sha256: fixture.manifest.entries.laz.sha256,
        },
        artifactTracked: false,
        releaseBundled: false,
        sampleRedistributed: false,
        testOnly: true,
      },
      provenance: {
        pointRecordSha256: expected.pointRecordSha256,
        exactLasLazPointRecordParity: true,
        derivationInput:
          "cache-only LAS records previously proven equal to LAZ decode",
      },
      source: {
        coordinateReferenceStatus: "unqualified",
        fingerprint:
          `sha256:${fixture.manifest.entries.laz.sha256}`,
        format: "las-laz-paired-points",
        revisionId:
          `sha256:${fixture.manifest.entries.laz.sha256}`,
        semanticAuthority: false,
      },
      range: {
        handleId: "point-range:loaders-gl-ripple:0",
        mediaType: derived.profile.mediaType,
        sha256: derived.profile.range.sha256,
        byteLength: derived.profile.range.byteLength,
      },
      profile: derived.profile,
      qualification: {
        canvas: { height: 480, width: 640 },
        pointSize: 3,
        limits: {
          maximumCpuStagingBytes: 8 * 1024 * 1024,
          maximumGpuBytes: 8 * 1024 * 1024,
          maximumPointPayloadBytes: 8 * 1024 * 1024,
          maximumPoints: 500_000,
          maximumRangeBytes: 8 * 1024 * 1024,
          maximumPointSize: 16,
        },
        productRuntime: false,
      },
    };
    return {
      acquisition: fixture.receipt,
      input,
      rangeBytes,
    };
  } finally {
    derived?.bytes.fill(0);
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
}

export function createLasLazPointRendererProbeServer(prepared) {
  if (
    prepared?.input?.schema !==
      "bim-explorer-las-laz-point-renderer-probe-input/1" ||
    !Buffer.isBuffer(prepared.rangeBytes) ||
    prepared.rangeBytes.byteLength !==
      prepared.input.range.byteLength
  ) {
    throw new TypeError("LAS/LAZ point renderer probe input is invalid");
  }
  const inputBytes = Buffer.from(
    JSON.stringify(prepared.input),
    "utf8",
  );
  const stateBytes = () => Buffer.from(JSON.stringify({
    rangeRequests: state.rangeRequests,
    rangeBytes: state.rangeBytes,
  }), "utf8");
  const state = {
    buffersCleared: false,
    rangeBytes: 0,
    rangeRequests: 0,
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
    } else if (pathname === "/point-range.bin") {
      body = prepared.rangeBytes;
      type = prepared.input.range.mediaType;
      if (request.method === "GET") {
        state.rangeRequests += 1;
        state.rangeBytes += body.byteLength;
      }
    } else if (pathname === "/range-state.json") {
      body = stateBytes();
      type = "application/json; charset=utf-8";
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
    response.writeHead(200, headers(type, body.byteLength));
    response.end(request.method === "HEAD" ? undefined : body);
  });
  server.once("close", () => {
    prepared.rangeBytes.fill(0);
    inputBytes.fill(0);
    state.buffersCleared =
      prepared.rangeBytes.every((value) => value === 0) &&
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
    return 4176;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--port" ||
    !/^[0-9]+$/u.test(values[1])
  ) {
    throw new TypeError(
      "usage: node scripts/serve-las-laz-point-renderer-probe.mjs " +
        "[--port 4176]",
    );
  }
  const port = Number(values[1]);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new RangeError("port must be between 1 and 65535");
  }
  return port;
}

async function main() {
  const prepared = await prepareLasLazPointRendererProbe();
  const server = createLasLazPointRendererProbeServer(prepared);
  const port = parsePort(process.argv.slice(2));
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `LAS/LAZ point renderer probe: http://127.0.0.1:${port}\n`,
    );
  });
  const close = () => server.close();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
