import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createGltfReferenceSource,
} from "../packages/gltf-reference-source/src/index.mjs";
import {
  acquirePublicGltfFixture,
} from "./public-gltf-fixture.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(ROOT, "apps", "gltf-browser-probe");
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
  ["/source-session.mjs", {
    file: path.join(
      ROOT,
      "apps",
      "browser-gpu-probe",
      "source-session.mjs",
    ),
    type: "text/javascript; charset=utf-8",
  }],
  ["/bim-renderer-3d.mjs", {
    file: path.join(RENDERER, "index.mjs"),
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

function projectedSnapshot(snapshot) {
  return structuredClone({
    protocolVersion: snapshot.protocolVersion,
    sessionId: snapshot.sessionId,
    sourceId: snapshot.sourceId,
    revisionId: snapshot.revisionId,
    snapshotId: snapshot.snapshotId,
    layerId: snapshot.layerId,
    source: snapshot.source,
    coordinateSystem: snapshot.coordinateSystem,
    geometry: snapshot.geometry,
    entities: snapshot.entities.map((entity) => ({
      expressId: entity.expressId,
      localNumericId: entity.localNumericId,
      nativeId: entity.nativeId,
      globalId: entity.globalId,
      renderId: entity.renderId,
      pickId: entity.pickId,
      externalIdentityToken:
        entity.externalIdentityToken,
      renderable: entity.renderable,
      bounds: entity.bounds,
      primitives: entity.primitives,
    })),
    layers: snapshot.layers,
    loadPlan: snapshot.loadPlan,
  });
}

export async function prepareGltfBrowserProbe({
  bytes,
  fixture,
}) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("glTF Browser fixture must be bytes");
  }
  const source = await createGltfReferenceSource(
    bytes,
    { maximumRequestBytes: 256 },
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  try {
    const snapshot = await session.getSnapshot();
    const ranges = new Map();
    for (const handle of snapshot.layers[0].rangeHandles) {
      const range = new Uint8Array(handle.byteLength);
      for (
        let offset = 0;
        offset < handle.byteLength;
        offset += handle.maximumRequestBytes
      ) {
        const chunk = await session.readRange(
          handle,
          offset,
          Math.min(
            handle.maximumRequestBytes,
            handle.byteLength - offset,
          ),
        );
        range.set(chunk, offset);
        chunk.fill(0);
      }
      ranges.set(handle.handleId, Buffer.from(range));
      range.fill(0);
    }
    return {
      input: {
        schema: "bim-explorer-gltf-browser-probe-input/1",
        fixture: structuredClone(fixture),
        snapshot: projectedSnapshot(snapshot),
      },
      ranges,
    };
  } finally {
    await session.dispose();
    await source.dispose();
  }
}

export async function preparePublicGltfBrowserProbe() {
  const acquired = await acquirePublicGltfFixture();
  try {
    return await prepareGltfBrowserProbe({
      bytes: acquired.bytes,
      fixture: {
        id: acquired.manifest.fixtureId,
        byteLength: acquired.manifest.entry.byteLength,
        sha256: acquired.manifest.entry.sha256,
        license: acquired.manifest.license.spdx,
        artifactTracked: false,
        releaseBundled: false,
      },
    });
  } finally {
    acquired.bytes.fill(0);
  }
}

function selectedRange(value, byteLength, maximumBytes) {
  const match = /^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/u
    .exec(value ?? "");
  if (match === null) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    end >= byteLength ||
    end - start + 1 > maximumBytes
  ) {
    return null;
  }
  return { start, end };
}

export function createGltfBrowserProbeServer({
  input,
  ranges,
}) {
  if (
    input?.schema !==
      "bim-explorer-gltf-browser-probe-input/1" ||
    !(ranges instanceof Map)
  ) {
    throw new TypeError("glTF Browser probe input is invalid");
  }
  const layer = input.snapshot.layers.find(
    (candidate) =>
      candidate.layerId === input.snapshot.layerId,
  );
  const handles = new Map(
    layer.rangeHandles.map((handle) => [
      handle.handleId,
      handle,
    ]),
  );
  if (
    handles.size !== ranges.size ||
    [...handles].some(([rangeId, handle]) =>
      ranges.get(rangeId)?.byteLength !== handle.byteLength)
  ) {
    throw new Error("glTF Browser ranges are invalid");
  }
  const inputBytes = Buffer.from(
    JSON.stringify(input),
    "utf8",
  );
  const state = {
    rangeRequests: 0,
    rangeBytes: 0,
  };
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
      response.writeHead(400);
      response.end();
      return;
    }
    if (pathname === "/probe-input.json") {
      response.writeHead(
        200,
        headers(
          "application/json; charset=utf-8",
          inputBytes.byteLength,
        ),
      );
      response.end(
        request.method === "HEAD" ? undefined : inputBytes,
      );
      return;
    }
    if (pathname === "/range-state.json") {
      const body = Buffer.from(JSON.stringify(state), "utf8");
      response.writeHead(
        200,
        headers(
          "application/json; charset=utf-8",
          body.byteLength,
        ),
      );
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    if (pathname.startsWith("/range/")) {
      let rangeId;
      try {
        rangeId = decodeURIComponent(pathname.slice(7));
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }
      const handle = handles.get(rangeId);
      const bytes = ranges.get(rangeId);
      if (handle === undefined || bytes === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      const selected = selectedRange(
        request.headers.range,
        bytes.byteLength,
        handle.maximumRequestBytes,
      );
      if (selected === null) {
        response.writeHead(416, {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Range": `bytes */${bytes.byteLength}`,
        });
        response.end();
        return;
      }
      const body = bytes.subarray(
        selected.start,
        selected.end + 1,
      );
      if (request.method === "GET") {
        state.rangeRequests += 1;
        state.rangeBytes += body.byteLength;
      }
      response.writeHead(206, {
        ...headers(
          "application/vnd.bim-explorer.geometry-range.v1",
          body.byteLength,
        ),
        "Accept-Ranges": "bytes",
        "Content-Range":
          `bytes ${selected.start}-${selected.end}/${bytes.byteLength}`,
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    const route = STATIC_ROUTES.get(pathname);
    if (route === undefined) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
      });
      response.end();
      return;
    }
    try {
      const body = await readFile(route.file);
      response.writeHead(
        200,
        headers(route.type, body.byteLength),
      );
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
}

function portArgument(values) {
  if (values.length === 0) {
    return 4176;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--port" ||
    !/^[0-9]+$/u.test(values[1])
  ) {
    throw new TypeError(
      "usage: node scripts/serve-gltf-browser-probe.mjs " +
      "[--port 4176]",
    );
  }
  const port = Number(values[1]);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new RangeError("glTF Browser probe port is invalid");
  }
  return port;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const prepared = await preparePublicGltfBrowserProbe();
  const server = createGltfBrowserProbeServer(prepared);
  const port = portArgument(process.argv.slice(2));
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `glTF Browser probe: http://127.0.0.1:${port}`,
    );
  });
  const close = () => server.close();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
