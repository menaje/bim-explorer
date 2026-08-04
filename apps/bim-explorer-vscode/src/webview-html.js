"use strict";

const HOST_KIND = "vscode-webview";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) {
    throw new Error(`BIM Explorer webview template is missing ${label}`);
  }
  if (source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`BIM Explorer webview template repeats ${label}`);
  }
  return source.slice(0, index) +
    replacement +
    source.slice(index + search.length);
}

function ensurePathFree(value, sourceUriText) {
  if (
    typeof sourceUriText === "string" &&
    sourceUriText.length > 0 &&
    value.includes(sourceUriText)
  ) {
    throw new Error(
      "BIM Explorer webview HTML exposed the source URI",
    );
  }
}

function renderBimExplorerWebviewHtml(template, {
  appUri,
  cspSource,
  profile,
  sourceUriText = "",
  stylesUri,
  wasmUri,
  webIfcModuleUri,
  workerModuleUri,
}) {
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
        `BIM Explorer webview ${label} is invalid`,
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
    '<meta name="bim-host-kind" content="browser">',
    `<meta name="bim-host-kind" content="${HOST_KIND}">`,
    "host kind",
  );
  html = replaceOnce(
    html,
    'content="/vendor/web-ifc-api.js"',
    `content="${escapeAttribute(webIfcModuleUri)}"`,
    "web-ifc module",
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
    'content="./source-worker.mjs"',
    `content="${escapeAttribute(workerModuleUri)}"`,
    "Worker module",
  );
  html = replaceOnce(
    html,
    '<meta name="bim-profile" content="ReferenceView_V1.2">',
    `<meta name="bim-profile" ` +
      `content="${escapeAttribute(profile)}">`,
    "IFC profile",
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
  ensurePathFree(html, sourceUriText);
  return html;
}

module.exports = {
  renderBimExplorerWebviewHtml,
};
