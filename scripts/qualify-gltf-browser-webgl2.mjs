import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createGltfBrowserProbeServer,
  preparePublicGltfBrowserProbe,
} from "./serve-gltf-browser-probe.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FIXTURE_SHA256 =
  "ed52f7192b8311d700ac0ce80644e385" +
  "2cd01537e4d62241b9acba023da3d54e";

function timeoutError(label) {
  return new DOMException(
    `glTF Browser qualification timed out: ${label}`,
    "TimeoutError",
  );
}

function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(timeoutError(label)),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) =>
      error === undefined ? resolve() : reject(error));
  });
}

async function launchChrome(userDataDirectory) {
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDirectory}`,
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-domain-reliability",
      "--disable-features=MediaRouter,OptimizationHints",
      "--disable-sync",
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--metrics-recording-only",
      "--no-first-run",
      "--no-pings",
      "--use-angle=swiftshader",
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  const browserWebSocket = await withTimeout(
    new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        reject(
          new Error(
            `headless Chrome exited before CDP was ready: ${code}`,
          ),
        );
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        const match = /DevTools listening on (ws:\/\/[^\s]+)/u
          .exec(stderr);
        if (match !== null) {
          resolve(match[1]);
        }
      });
    }),
    15_000,
    "Chrome CDP startup",
  );
  const browserVersion = spawnSync(CHROME, ["--version"], {
    encoding: "utf8",
  }).stdout.trim();
  return {
    child,
    browserVersion,
    browserWebSocket,
  };
}

class CdpClient {
  #nextId = 1;
  #pending = new Map();
  #socket;
  #subscribers = new Map();

  static async connect(url) {
    const socket = new WebSocket(url);
    await withTimeout(
      new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, {
          once: true,
        });
        socket.addEventListener("error", reject, {
          once: true,
        });
      }),
      10_000,
      "CDP WebSocket",
    );
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (Number.isSafeInteger(message.id)) {
        const pending = this.#pending.get(message.id);
        if (pending === undefined) {
          return;
        }
        this.#pending.delete(message.id);
        if (message.error) {
          pending.reject(
            new Error(
              `CDP ${pending.method} failed: ` +
                `${message.error.message}`,
            ),
          );
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      for (
        const subscriber of
          this.#subscribers.get(message.method) ?? []
      ) {
        subscriber(message.params ?? {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        method,
        reject,
        resolve,
      });
      this.#socket.send(JSON.stringify({
        id,
        method,
        params,
      }));
    });
  }

  on(method, listener) {
    const subscribers =
      this.#subscribers.get(method) ?? new Set();
    subscribers.add(listener);
    this.#subscribers.set(method, subscribers);
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails !== undefined) {
      throw new Error(
        "glTF Browser evaluation failed: " +
        response.exceptionDetails.text,
      );
    }
    return response.result?.value;
  }

  close() {
    this.#socket.close();
  }
}

async function poll(client, expression, {
  intervalMs = 100,
  timeoutMs = 30_000,
} = {}) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const value = await client.evaluate(expression);
    if (value !== null && value !== false) {
      return value;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, intervalMs));
  }
  throw timeoutError(expression);
}

function outputArgument(argumentsValue) {
  const index = argumentsValue.indexOf("--out");
  if (index === -1) {
    return null;
  }
  if (
    index + 1 >= argumentsValue.length ||
    argumentsValue[index + 1].startsWith("-")
  ) {
    throw new TypeError("--out requires a path");
  }
  return path.resolve(argumentsValue[index + 1]);
}

function assertions(report, errors, externalOrigins) {
  return Object.freeze({
    actualBrowser:
      report.status === "passed",
    webgl2Context:
      report.renderer.backend === "webgl2" &&
      report.renderer.actualGpu === true &&
      report.renderer.glError === 0,
    rasterizedPixels:
      report.renderer.nonBackgroundPixels > 0,
    boundedRangeReads:
      report.range.clientReads === 3 &&
      report.range.clientBytes === 756 &&
      report.range.serverRequests === 3 &&
      report.range.serverBytes === 756,
    geometryAndInstanceUpload:
      report.renderer.uploadedBytes === 800 &&
      report.renderer.geometryRecords === 1 &&
      report.renderer.instances === 1 &&
      report.renderer.triangles === 12,
    sourceNativePick:
      report.picking.status === "hit" &&
      report.identity.nativeId ===
        report.identity.pickedNativeId &&
      report.identity.globalId === null &&
      report.identity.pickedGlobalId === null,
    selectedHighlight:
      report.renderer.selectedInstances === 1 &&
      report.renderer.highlightPixels > 0,
    transientPickReleased:
      report.picking.actualGpu === true &&
      report.picking.temporaryReleased === true,
    deterministicCleanup:
      report.cleanup.releasedBytes === 800 &&
      report.cleanup.rendererDisposed === true &&
      report.cleanup.sessionDisposed === true &&
      report.cleanup.backendDisposed === true &&
      report.cleanup.activeBackendBytes === 0 &&
      report.cleanup.residentRanges === 0,
    localOnly:
      externalOrigins.length === 0,
    noRuntimeErrors:
      errors.length === 0,
    pathFreeEvidence: true,
    physicalGpuNotClaimed: true,
  });
}

export async function qualifyGltfBrowserWebGl2() {
  const prepared = await preparePublicGltfBrowserProbe();
  const server = createGltfBrowserProbeServer(prepared);
  const origin = await listen(server);
  const userDataDirectory = await mkdtemp(
    path.join(tmpdir(), "bim-explorer-gltf-chrome-"),
  );
  let chrome = null;
  let client = null;
  try {
    chrome = await launchChrome(userDataDirectory);
    const endpoint = new URL(chrome.browserWebSocket);
    const newTarget = new URL(
      `http://${endpoint.host}/json/new`,
    );
    newTarget.search = `?${encodeURIComponent("about:blank")}`;
    const target = await (
      await fetch(newTarget, { method: "PUT" })
    ).json();
    client = await CdpClient.connect(
      target.webSocketDebuggerUrl,
    );
    const errors = [];
    const requestedUrls = [];
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", (event) => {
      errors.push(
        event.exceptionDetails?.text ?? "Browser exception",
      );
    });
    client.on("Network.requestWillBeSent", (event) => {
      requestedUrls.push(event.request?.url ?? "");
    });
    await client.send("Page.navigate", { url: origin });
    const browserReport = await poll(
      client,
      `(() => {
        const report = globalThis.__gltfBrowserProbeReport;
        if (!report || report.status === "running") {
          return null;
        }
        return report;
      })()`,
    );
    if (browserReport.status !== "passed") {
      throw new Error(
        "glTF Browser probe failed: " +
        `${browserReport.error?.message ?? "unknown error"}`,
      );
    }
    const externalOrigins = [
      ...new Set(
        requestedUrls
          .filter((url) => /^https?:/u.test(url))
          .map((url) => new URL(url).origin)
          .filter((requestOrigin) =>
            requestOrigin !== origin),
      ),
    ];
    const gates = assertions(
      browserReport,
      errors,
      externalOrigins,
    );
    if (Object.values(gates).some((value) => value !== true)) {
      throw new Error(
        "glTF Browser qualification gates failed: " +
        JSON.stringify(gates),
      );
    }
    const evidence = {
      schema:
        "bim-explorer-gltf-browser-webgl2-qualification/1",
      asOf: "2026-08-04",
      contract: "bim-explorer-gltf-reference-source/0.1",
      environment: {
        browser: chrome.browserVersion,
        platform: `${process.platform}-${process.arch}`,
        headless: true,
        webgl2: "actual Browser API via SwiftShader",
        physicalGpuClaimed: false,
      },
      fixture: {
        fixtureId: browserReport.fixture.id,
        byteLength: browserReport.fixture.byteLength,
        sha256: browserReport.fixture.sha256,
        license: browserReport.fixture.license,
        artifactTracked: false,
        releaseBundled: false,
      },
      source: browserReport.source,
      identity: browserReport.identity,
      renderer: browserReport.renderer,
      picking: browserReport.picking,
      range: browserReport.range,
      cleanup: browserReport.cleanup,
      network: {
        externalOrigins,
        requestCount: requestedUrls.length,
        runtimeErrors: errors,
      },
      assertions: gates,
      limitations: [
        "SwiftShader proves the Browser WebGL2 API path, not physical GPU hardware",
        "the public Box GLB is not product-scale geometry",
        "Browser and VS Code product file-open surfaces remain separate gates",
        "write, round-trip and BIM semantic authority remain blocked"
      ],
    };
    if (
      evidence.fixture.sha256 !== FIXTURE_SHA256 ||
      evidence.source.format !== "glb" ||
      evidence.source.semanticAuthority !== false ||
      JSON.stringify(evidence).includes("/Users/") ||
      JSON.stringify(evidence).includes("/Volumes/") ||
      JSON.stringify(evidence).includes("\\\\")
    ) {
      throw new Error(
        "glTF Browser qualification evidence is invalid",
      );
    }
    return Object.freeze(evidence);
  } finally {
    client?.close();
    if (chrome?.child.exitCode === null) {
      const exited = new Promise((resolve) => {
        chrome.child.once("exit", resolve);
      });
      chrome.child.kill("SIGTERM");
      await withTimeout(
        exited,
        10_000,
        "Chrome shutdown",
      ).catch(() => {
        chrome.child.kill("SIGKILL");
      });
    }
    await closeServer(server);
    await rm(userDataDirectory, {
      recursive: true,
      force: true,
    });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await qualifyGltfBrowserWebGl2();
  const output = outputArgument(process.argv.slice(2));
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === null) {
    process.stdout.write(serialized);
  } else {
    await writeFile(output, serialized);
    console.log(`Wrote ${path.relative(ROOT, output)}`);
  }
}
