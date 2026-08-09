"use strict";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0 ||
    source.indexOf(search, index + search.length) >= 0) {
    throw new Error(
      `Federated BIM Surface template has invalid ${label}`,
    );
  }
  return source.slice(0, index) +
    replacement +
    source.slice(index + search.length);
}

function renderFederatedBimSurfaceWebviewHtml(template, {
  appUri,
  cspSource,
  manifestUriText = "",
  profile,
  stylesUri,
  wasmUri,
  webIfcModuleUri,
  workerModuleUri,
} = {}) {
  for (const [label, value] of Object.entries({
    appUri,
    cspSource,
    profile,
    stylesUri,
    wasmUri,
    webIfcModuleUri,
    workerModuleUri,
  })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(
        `Federated BIM Surface Webview ${label} is invalid`,
      );
    }
  }
  const csp = [
    "default-src 'none'",
    `script-src ${cspSource} blob: 'wasm-unsafe-eval'`,
    `style-src ${cspSource}`,
    `connect-src ${cspSource} blob:`,
    `worker-src ${cspSource} blob:`,
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  let html = replaceOnce(
    template,
    '<meta name="bim-profile" content="ReferenceView_V1.2">',
    `<meta name="bim-profile" ` +
      `content="${escapeAttribute(profile)}">`,
    "IFC profile",
  );
  html = replaceOnce(
    html,
    '<meta name="bim-wasm-path" content="/vendor/">',
    `<meta name="bim-wasm-path" ` +
      `content="${escapeAttribute(wasmUri)}">`,
    "web-ifc WASM path",
  );
  html = replaceOnce(
    html,
    '<meta name="bim-web-ifc-module" content="/vendor/web-ifc-api.js">',
    `<meta name="bim-web-ifc-module" ` +
      `content="${escapeAttribute(webIfcModuleUri)}">`,
    "web-ifc module",
  );
  html = replaceOnce(
    html,
    '<meta name="bim-worker-module" content="../bim-explorer-web/source-worker.bundle.mjs">',
    `<meta name="bim-worker-module" ` +
      `content="${escapeAttribute(workerModuleUri)}">`,
    "source Worker",
  );
  html = replaceOnce(
    html,
    '<link rel="stylesheet" href="./styles.css">',
    `<link rel="stylesheet" ` +
      `href="${escapeAttribute(stylesUri)}">`,
    "stylesheet",
  );
  html = replaceOnce(
    html,
    '<script type="module" src="./app.mjs"></script>',
    `<script type="module" ` +
      `src="${escapeAttribute(appUri)}"></script>`,
    "application module",
  );
  html = replaceOnce(
    html,
    "    <meta charset=\"utf-8\">",
    "    <meta charset=\"utf-8\">\n" +
      `    <meta http-equiv="Content-Security-Policy" ` +
      `content="${escapeAttribute(csp)}">`,
    "charset",
  );
  if (
    typeof manifestUriText === "string" &&
    manifestUriText.length > 0 &&
    html.includes(manifestUriText)
  ) {
    throw new Error(
      "Federated BIM Surface Webview exposed the manifest URI",
    );
  }
  return html;
}

module.exports = {
  renderFederatedBimSurfaceWebviewHtml,
};
