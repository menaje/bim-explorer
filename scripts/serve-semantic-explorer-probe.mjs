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
  syntheticSemanticIfc,
} from "./generate-synthetic-ifc.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(
  ROOT,
  "apps",
  "semantic-explorer-probe",
);
const RENDERER = path.join(
  ROOT,
  "packages",
  "bim-renderer-3d",
  "src",
);
const SEMANTIC_EXPLORER = path.join(
  ROOT,
  "packages",
  "bim-semantic-explorer",
  "src",
);
const MODEL_SOURCE = path.join(
  ROOT,
  "packages",
  "bim-model-source",
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
  "form-action 'self'",
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
  ["/bim-semantic-explorer.mjs", {
    file: path.join(SEMANTIC_EXPLORER, "index.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/semantic-index.mjs", {
    file: path.join(MODEL_SOURCE, "semantic-index.mjs"),
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
  ["/measurement.mjs", {
    file: path.join(RENDERER, "measurement.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
  ["/host-adapter.mjs", {
    file: path.join(RENDERER, "host-adapter.mjs"),
    type: "text/javascript; charset=utf-8",
  }],
]);

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
  const match =
    /^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/u.exec(
      value ?? "",
    );
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

export async function prepareSemanticExplorerProbe() {
  const bytes = new TextEncoder().encode(
    syntheticSemanticIfc(),
  );
  const artifact = await createWebIfcSourceArtifact(bytes, {
    profile: "ReferenceView_V1.2",
  });
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
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
  return {
    input: {
      schema:
        "bim-explorer-semantic-explorer-probe-input/1",
      fixture: {
        id: "synthetic-semantic-ifc4",
        byteLength: bytes.byteLength,
        ifcSchema: snapshot.source.ifcSchema,
        profile: snapshot.source.profile,
        artifactCommitted: false,
      },
      snapshot,
    },
    ranges: new Map(
      [
        ...artifact.ranges,
        ...artifact.detailRanges,
      ].map((range) => [
        range.rangeId,
        Buffer.from(range.bytes),
      ]),
    ),
  };
}

export function createSemanticExplorerProbeServer({
  input,
  ranges,
}) {
  const inputBytes = Buffer.from(
    JSON.stringify(input),
    "utf8",
  );
  const handles = new Map([
    ...input.snapshot.layers
      .flatMap((layer) => layer.rangeHandles),
    ...input.snapshot.details.rangeHandles,
  ].map((handle) => [handle.handleId, handle]));
  const state = {
    rangeBytes: 0,
    rangeRequests: 0,
    ranges: {},
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
    if (pathname === "/range-state.json") {
      const body = Buffer.from(
        JSON.stringify(state),
        "utf8",
      );
      response.writeHead(
        200,
        baseHeaders(
          "application/json; charset=utf-8",
          body.byteLength,
        ),
      );
      response.end(
        request.method === "HEAD" ? undefined : body,
      );
      return;
    }
    if (pathname.startsWith("/range/")) {
      let rangeId;
      try {
        rangeId = decodeURIComponent(pathname.slice(7));
      } catch {
        response.writeHead(400, {
          "Cache-Control": "no-store",
        });
        response.end();
        return;
      }
      const handle = handles.get(rangeId);
      const bytes = ranges.get(rangeId);
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
        state.rangeRequests += 1;
        state.rangeBytes += body.byteLength;
        const prior = state.ranges[rangeId] ?? {
          bytes: 0,
          requests: 0,
        };
        state.ranges[rangeId] = {
          bytes: prior.bytes + body.byteLength,
          requests: prior.requests + 1,
        };
      }
      response.writeHead(206, {
        ...baseHeaders(
          handle.mediaType,
          body.byteLength,
        ),
        "Accept-Ranges": "bytes",
        "Content-Range":
          `bytes ${selected.start}-${selected.end}/` +
          `${bytes.byteLength}`,
      });
      response.end(
        request.method === "HEAD" ? undefined : body,
      );
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
      "usage: node scripts/serve-semantic-explorer-probe.mjs " +
        "[--port 4176]",
    );
  }
  const port = Number(values[1]);
  if (
    !Number.isSafeInteger(port) ||
    port <= 0 ||
    port > 65_535
  ) {
    throw new TypeError(
      "port must be between 1 and 65535",
    );
  }
  return port;
}

async function main() {
  const port = parsePort(process.argv.slice(2));
  process.stdout.write(
    "Preparing semantic explorer Browser probe…\n",
  );
  const prepared = await prepareSemanticExplorerProbe();
  const server = createSemanticExplorerProbeServer(prepared);
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `Semantic explorer probe: http://127.0.0.1:${port}\n`,
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
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  await main();
}
