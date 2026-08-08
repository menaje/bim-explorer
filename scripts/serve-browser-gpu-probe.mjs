import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  ensurePublicIfcFixture,
  loadPublicIfcFixtureManifest,
} from "./public-ifc-fixture.mjs";
import {
  syntheticLargeCoordinateIfc,
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(ROOT, "apps", "browser-gpu-probe");
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
  ["/source-session.mjs", {
    file: path.join(APP, "source-session.mjs"),
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
  ["/webgl2-backend.mjs", {
    file: path.join(RENDERER, "webgl2-backend.mjs"),
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
    file: path.join(RENDERER, "point-cloud-webgl2-backend.mjs"),
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
  ["/measurement.mjs", {
    file: path.join(RENDERER, "measurement.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/host-adapter.mjs", {
    file: path.join(RENDERER, "host-adapter.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
]);

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function baseHeaders(type, byteLength) {
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

function rangeHeader(value, byteLength, maximumRequestBytes) {
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
    end - start + 1 > maximumRequestBytes
  ) {
    return null;
  }
  return {
    end,
    length: end - start + 1,
    start,
  };
}

function projectedSnapshot(snapshot) {
  const entities = snapshot.entities
    .map((entity) => ({
      expressId: entity.expressId,
      globalId: entity.globalId,
      renderId: entity.renderId,
      pickId: entity.pickId,
      externalIdentityToken: entity.externalIdentityToken,
      renderable: entity.renderable,
      bounds: entity.bounds,
      primitives: entity.primitives
        .map((primitive) => ({
          geometryExpressId: primitive.geometryExpressId,
          vertexCount: primitive.vertexCount,
          indexCount: primitive.indexCount,
          triangles: primitive.triangles,
          transform: primitive.transform,
          color: primitive.color,
          slice: primitive.slice,
        })),
    }))
    .filter((entity) => entity.primitives.length > 0);
  return {
    protocolVersion: snapshot.protocolVersion,
    sessionId: snapshot.sessionId,
    sourceId: snapshot.sourceId,
    revisionId: snapshot.revisionId,
    snapshotId: snapshot.snapshotId,
    layerId: snapshot.layerId,
    source: {
      fingerprint: snapshot.source.fingerprint,
    },
    coordinateSystem: snapshot.coordinateSystem,
    geometry: {
      bounds: snapshot.geometry.bounds,
    },
    entities,
    layers: snapshot.layers.map((layer) => ({
      layerId: layer.layerId,
      sourceId: layer.sourceId,
      revisionId: layer.revisionId,
      representation: layer.representation,
      rangeHandles: layer.rangeHandles,
    })),
    loadPlan: snapshot.loadPlan,
  };
}

export async function preparePublicBrowserGpuProbe() {
  const manifest = await loadPublicIfcFixtureManifest();
  const fixture = await ensurePublicIfcFixture({ manifest });
  const bytes = await readFile(fixture.input);
  const artifact = await createWebIfcSourceArtifact(bytes, {
    profile: "performance-only-ifc2x3",
  });
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 1024 * 1024,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  let snapshot;
  try {
    snapshot = await session.getSnapshot();
  } finally {
    await session.dispose();
    await source.dispose();
  }
  const projected = projectedSnapshot(snapshot);
  const secondaryBytes = new TextEncoder().encode(
    syntheticMappedIfc(),
  );
  const secondaryArtifact = await createWebIfcSourceArtifact(
    secondaryBytes,
  );
  const secondarySource = createBimModelSource(
    secondaryArtifact,
    {
      maximumRequestBytes: 128,
    },
  );
  const secondarySession = await secondarySource.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  let secondarySnapshot;
  try {
    secondarySnapshot = await secondarySession.getSnapshot();
  } finally {
    await secondarySession.dispose();
    await secondarySource.dispose();
  }
  const secondaryProjected = projectedSnapshot(
    secondarySnapshot,
  );
  const precisionBytes = new TextEncoder().encode(
    syntheticLargeCoordinateIfc(),
  );
  const precisionArtifact = await createWebIfcSourceArtifact(
    precisionBytes,
  );
  const precisionSource = createBimModelSource(
    precisionArtifact,
    {
      maximumRequestBytes: 128,
    },
  );
  const precisionSession = await precisionSource.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  let precisionSnapshot;
  try {
    precisionSnapshot = await precisionSession.getSnapshot();
  } finally {
    await precisionSession.dispose();
    await precisionSource.dispose();
  }
  const precisionProjected = projectedSnapshot(
    precisionSnapshot,
  );
  return {
    input: {
      schema: "bim-explorer-browser-gpu-probe-input/1",
      fixture: {
        id: manifest.fixtureId,
        schema: manifest.ifc.schema,
        profile: "performance-only-ifc2x3",
        byteLength: manifest.entry.byteLength,
        sha256: manifest.entry.sha256,
        artifactCommitted: false,
        profileAdmission: false,
      },
      provenance: {
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        license: manifest.provenance.license,
        rightsVerified:
          manifest.redistribution.rightsVerified,
        bundlingApproved:
          manifest.redistribution.bundlingApproved,
      },
      acquisition: fixture.receipt,
      snapshot: projected,
    },
    ranges: new Map(
      artifact.ranges.map((range) => [
        range.rangeId,
        Buffer.from(
          range.bytes.buffer,
          range.bytes.byteOffset,
          range.bytes.byteLength,
        ),
      ]),
    ),
    secondaryInput: {
      schema: "bim-explorer-browser-gpu-probe-input/1",
      fixture: {
        id: "synthetic-ifc4-mapped",
        schema: "IFC4",
        profile: "synthetic-source-switch",
        byteLength: secondaryBytes.byteLength,
        sha256:
          secondarySnapshot.source.fingerprint.slice(7),
        artifactCommitted: true,
        profileAdmission: false,
      },
      snapshot: secondaryProjected,
    },
    secondaryRanges: new Map(
      secondaryArtifact.ranges.map((range) => [
        range.rangeId,
        Buffer.from(
          range.bytes.buffer,
          range.bytes.byteOffset,
          range.bytes.byteLength,
        ),
      ]),
    ),
    precisionInput: {
      schema: "bim-explorer-browser-gpu-probe-input/1",
      fixture: {
        id: "synthetic-ifc4-large-coordinate",
        schema: "IFC4",
        profile: "synthetic-large-coordinate-precision",
        byteLength: precisionBytes.byteLength,
        sha256:
          precisionSnapshot.source.fingerprint.slice(7),
        artifactCommitted: true,
        profileAdmission: false,
      },
      snapshot: precisionProjected,
    },
    precisionRanges: new Map(
      precisionArtifact.ranges.map((range) => [
        range.rangeId,
        Buffer.from(
          range.bytes.buffer,
          range.bytes.byteOffset,
          range.bytes.byteLength,
        ),
      ]),
    ),
  };
}

function validateProbeInput(inputValue, rangesValue) {
  const input = plainRecord(inputValue, "Browser GPU probe input");
  const snapshot = plainRecord(
    input.snapshot,
    "Browser GPU probe snapshot",
  );
  const layer = snapshot.layers?.find(
    (candidate) => candidate.layerId === snapshot.layerId,
  );
  if (
    input.schema !== "bim-explorer-browser-gpu-probe-input/1" ||
    !Array.isArray(layer?.rangeHandles) ||
    !(rangesValue instanceof Map)
  ) {
    throw new Error("Browser GPU probe input is invalid");
  }
  const handles = new Map();
  for (const handle of layer.rangeHandles) {
    const bytes = rangesValue.get(handle.handleId);
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.byteLength !== handle.byteLength
    ) {
      throw new Error("Browser GPU probe range is invalid");
    }
    handles.set(handle.handleId, handle);
  }
  if (
    handles.size !== rangesValue.size ||
    snapshot.loadPlan?.firstFrameRangeIds?.length !== 1
  ) {
    throw new Error("Browser GPU probe range plan is invalid");
  }
  return {
    handles,
    input,
    ranges: rangesValue,
  };
}

export function createBrowserGpuProbeServer({
  input,
  ranges,
  secondaryInput,
  secondaryRanges,
  precisionInput,
  precisionRanges,
} = {}) {
  const probe = validateProbeInput(input, ranges);
  const secondaryProbe =
    secondaryInput === undefined &&
    secondaryRanges === undefined
      ? null
      : validateProbeInput(secondaryInput, secondaryRanges);
  const precisionProbe =
    precisionInput === undefined &&
    precisionRanges === undefined
      ? null
      : validateProbeInput(precisionInput, precisionRanges);
  const inputBytes = Buffer.from(
    JSON.stringify(probe.input),
    "utf8",
  );
  const secondaryInputBytes = secondaryProbe === null
    ? null
    : Buffer.from(
      JSON.stringify(secondaryProbe.input),
      "utf8",
    );
  const precisionInputBytes = precisionProbe === null
    ? null
    : Buffer.from(
      JSON.stringify(precisionProbe.input),
      "utf8",
    );
  const state = {
    rangeBytes: 0,
    rangeRequests: 0,
    ranges: {},
  };
  if (secondaryProbe !== null) {
    state.secondary = {
      rangeBytes: 0,
      rangeRequests: 0,
      ranges: {},
    };
  }
  if (precisionProbe !== null) {
    state.precision = {
      rangeBytes: 0,
      rangeRequests: 0,
      ranges: {},
    };
  }
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
    if (pathname === "/probe-input.json") {
      response.writeHead(
        200,
        baseHeaders(
          "application/json; charset=utf-8",
          inputBytes.byteLength,
        ),
      );
      response.end(
        request.method === "HEAD" ? undefined : inputBytes,
      );
      return;
    }
    if (
      pathname === "/secondary-probe-input.json" &&
      secondaryInputBytes !== null
    ) {
      response.writeHead(
        200,
        baseHeaders(
          "application/json; charset=utf-8",
          secondaryInputBytes.byteLength,
        ),
      );
      response.end(
        request.method === "HEAD"
          ? undefined
          : secondaryInputBytes,
      );
      return;
    }
    if (
      pathname === "/precision-probe-input.json" &&
      precisionInputBytes !== null
    ) {
      response.writeHead(
        200,
        baseHeaders(
          "application/json; charset=utf-8",
          precisionInputBytes.byteLength,
        ),
      );
      response.end(
        request.method === "HEAD"
          ? undefined
          : precisionInputBytes,
      );
      return;
    }
    if (pathname === "/range-state.json") {
      const body = Buffer.from(JSON.stringify(state), "utf8");
      response.writeHead(
        200,
        baseHeaders(
          "application/json; charset=utf-8",
          body.byteLength,
        ),
      );
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    const secondaryRange =
      pathname.startsWith("/secondary-range/");
    const precisionRange =
      pathname.startsWith("/precision-range/");
    if (
      pathname.startsWith("/range/") ||
      secondaryRange ||
      precisionRange
    ) {
      const selectedProbe = precisionRange
        ? precisionProbe
        : secondaryRange
          ? secondaryProbe
          : probe;
      const selectedState = precisionRange
        ? state.precision
        : secondaryRange
          ? state.secondary
          : state;
      const prefixLength = precisionRange
        ? 17
        : secondaryRange
          ? 17
          : 7;
      if (
        selectedProbe === null ||
        selectedState === undefined
      ) {
        response.writeHead(404, {
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }
      let rangeId;
      try {
        rangeId = decodeURIComponent(
          pathname.slice(prefixLength),
        );
      } catch {
        response.writeHead(400, {
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }
      const handle = selectedProbe.handles.get(rangeId);
      const bytes = selectedProbe.ranges.get(rangeId);
      if (handle === undefined || bytes === undefined) {
        response.writeHead(404, {
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }
      const selected = rangeHeader(
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
        selectedState.rangeRequests += 1;
        selectedState.rangeBytes += body.byteLength;
        const prior = selectedState.ranges[rangeId] ?? {
          bytes: 0,
          requests: 0,
        };
        selectedState.ranges[rangeId] = {
          bytes: prior.bytes + body.byteLength,
          requests: prior.requests + 1,
        };
      }
      response.writeHead(206, {
        ...baseHeaders(
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
        baseHeaders(route.type, body.byteLength),
      );
      response.end(request.method === "HEAD" ? undefined : body);
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
    return 4174;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--port" ||
    !/^[0-9]+$/u.test(values[1])
  ) {
    throw new TypeError(
      "usage: node scripts/serve-browser-gpu-probe.mjs " +
        "[--port 4174]",
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
  process.stdout.write("Preparing public Browser GPU probe…\n");
  const prepared = await preparePublicBrowserGpuProbe();
  const server = createBrowserGpuProbeServer(prepared);
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `Browser GPU probe: http://127.0.0.1:${port}\n`,
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
