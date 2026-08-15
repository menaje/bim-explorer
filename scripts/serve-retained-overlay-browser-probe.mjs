import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import {
  createFederatedBimSurfaceBrowserInput,
} from "./serve-federated-bim-surface-browser-probe.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.join(ROOT, "apps", "retained-overlay-browser-probe");
const BASE_APP = path.join(
  ROOT,
  "apps",
  "federated-bim-surface-browser-probe",
);
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "worker-src 'none'",
  "img-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

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
      Object.entries(value).map(([key, item]) => [key, encodedValue(item)]),
    );
  }
  return value;
}

async function bundle() {
  const result = await build({
    entryPoints: [path.join(APP, "app.mjs")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  if (result.outputFiles.length !== 1) {
    throw new Error("retained overlay Browser bundle is invalid");
  }
  return Buffer.from(result.outputFiles[0].contents);
}

function headers(type, length) {
  return {
    "Cache-Control": "no-store",
    "Content-Length": String(length),
    "Content-Security-Policy": CSP,
    "Content-Type": type,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function createRetainedOverlayBrowserProbeServer() {
  const [html, styles, app, input] = await Promise.all([
    readFile(path.join(BASE_APP, "index.html")),
    readFile(path.join(BASE_APP, "styles.css")),
    bundle(),
    createFederatedBimSurfaceBrowserInput(),
  ]);
  const inputBytes = Buffer.from(
    JSON.stringify(encodedValue(input)),
    "utf8",
  );
  const routes = new Map([
    ["/", { body: html, type: "text/html; charset=utf-8" }],
    ["/app.mjs", { body: app, type: "text/javascript; charset=utf-8" }],
    ["/styles.css", { body: styles, type: "text/css; charset=utf-8" }],
    ["/probe-input.json", { body: inputBytes, type: "application/json; charset=utf-8" }],
  ]);
  return createServer((request, response) => {
    const pathname = new URL(
      request.url ?? "/",
      "http://127.0.0.1",
    ).pathname;
    const route = routes.get(pathname);
    if (request.method !== "GET" || route === undefined) {
      response.writeHead(route === undefined ? 404 : 405);
      response.end();
      return;
    }
    response.writeHead(200, headers(route.type, route.body.byteLength));
    response.end(route.body);
  });
}
