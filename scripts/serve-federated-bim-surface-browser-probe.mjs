import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  syntheticGlbBytes,
} from "./generate-synthetic-gltf.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(
  ROOT,
  "apps",
  "federated-bim-surface-browser-probe",
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

function encodedValue(value) {
  if (value instanceof Uint8Array) {
    return {
      $bytes: Buffer.from(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      ).toString("base64"),
    };
  }
  if (Array.isArray(value)) {
    return value.map(encodedValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        encodedValue(item),
      ]),
    );
  }
  return value;
}

export async function createFederatedBimSurfaceBrowserInput() {
  const ifcArtifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  return {
    schema:
      "bim-explorer-federated-bim-surface-browser-input/1",
    fixtures: {
      source: "generated-test-only",
      artifactTracked: false,
      releaseBundled: false,
    },
    ifcArtifact,
    referenceGlb: syntheticGlbBytes({ secondNodeX: 3 }),
    overlayGlb: syntheticGlbBytes({ secondNodeX: 6 }),
  };
}

async function browserBundle() {
  const result = await build({
    entryPoints: [path.join(APP, "app.mjs")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(
      "federated BIM Surface Browser bundle is invalid",
    );
  }
  return Buffer.from(result.outputFiles[0].contents);
}

export async function createFederatedBimSurfaceBrowserProbeServer({
  input = null,
} = {}) {
  const probeInput = input ??
    await createFederatedBimSurfaceBrowserInput();
  if (
    probeInput?.schema !==
      "bim-explorer-federated-bim-surface-browser-input/1"
  ) {
    throw new TypeError(
      "federated BIM Surface Browser input is invalid",
    );
  }
  const [html, styles, bundle] = await Promise.all([
    readFile(path.join(APP, "index.html")),
    readFile(path.join(APP, "styles.css")),
    browserBundle(),
  ]);
  const inputBytes = Buffer.from(
    JSON.stringify(encodedValue(probeInput)),
    "utf8",
  );
  const routes = new Map([
    ["/", {
      body: html,
      type: "text/html; charset=utf-8",
    }],
    ["/app.mjs", {
      body: bundle,
      type: "text/javascript; charset=utf-8",
    }],
    ["/styles.css", {
      body: styles,
      type: "text/css; charset=utf-8",
    }],
    ["/probe-input.json", {
      body: inputBytes,
      type: "application/json; charset=utf-8",
    }],
  ]);
  return createServer((request, response) => {
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
    const route = routes.get(pathname);
    if (route === undefined) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
      });
      response.end();
      return;
    }
    response.writeHead(
      200,
      headers(route.type, route.body.byteLength),
    );
    response.end(
      request.method === "HEAD" ? undefined : route.body,
    );
  });
}

async function main() {
  const argument = process.argv[2] ?? "4173";
  if (!/^(?:0|[1-9][0-9]{0,4})$/u.test(argument)) {
    throw new TypeError(
      "usage: node scripts/serve-federated-bim-surface-browser-probe.mjs [port]",
    );
  }
  const port = Number(argument);
  if (port > 65_535) {
    throw new RangeError("Browser probe port is out of range");
  }
  const server =
    await createFederatedBimSurfaceBrowserProbeServer();
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    process.stdout.write(
      `Federated BIM Surface Browser probe: ` +
        `http://127.0.0.1:${address.port}\n`,
    );
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
