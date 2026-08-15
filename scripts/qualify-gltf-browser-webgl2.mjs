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
import {
  resolveChromeQualificationExecutable,
} from "./chrome-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

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
  const chromeExecutable =
    await resolveChromeQualificationExecutable();
  const child = spawn(
    chromeExecutable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDirectory}`,
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-dev-shm-usage",
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
  const version = spawnSync(chromeExecutable, ["--version"], {
    encoding: "utf8",
  });
  if (version.status !== 0) {
    throw new Error(
      `Chrome version probe failed: ` +
        `${version.stderr || version.stdout}`,
    );
  }
  const browserVersion = version.stdout.trim();
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

function parseArguments(values) {
  const options = {
    manifestPath: undefined,
    output: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (typeof value !== "string" || value.startsWith("-")) {
      throw new TypeError(`${name} requires a value`);
    }
    if (name === "--out") {
      options.output = path.resolve(value);
    } else if (name === "--manifest") {
      options.manifestPath = path.resolve(value);
    } else {
      throw new TypeError(`unknown argument ${name}`);
    }
  }
  return options;
}

function assertions(
  report,
  errors,
  externalOrigins,
  qualification,
) {
  const expected = qualification.expected;
  const requireCenterPick =
    qualification.requireCenterPick;
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
      report.range.clientReads === expected.sourceReads &&
      report.range.clientBytes === expected.sourceReadBytes &&
      report.range.serverRequests === expected.sourceReads &&
      report.range.serverBytes === expected.sourceReadBytes,
    geometryAndInstanceUpload:
      report.renderer.uploadedBytes === expected.uploadedBytes &&
      report.renderer.geometryRecords ===
        expected.geometryRecords &&
      report.renderer.geometryPayloadBytes ===
        expected.geometryPayloadBytes &&
      report.renderer.instances === expected.instances &&
      report.renderer.triangles ===
        expected.instancedTriangles &&
      report.renderer.uniqueTriangles ===
        expected.uniqueTriangles,
    sourceNativePick:
      report.identity.globalId === null &&
      (
        requireCenterPick
          ? report.picking.status === "hit" &&
            report.identity.nativeId ===
              report.identity.pickedNativeId &&
            report.identity.pickedGlobalId === null
          : report.picking.status === "not-required"
      ),
    selectedHighlight:
      requireCenterPick
        ? report.renderer.selectedInstances === 1 &&
          report.renderer.highlightPixels > 0
        : report.renderer.selectedInstances === 0 &&
          report.renderer.highlightPixels === 0,
    transientPickReleased:
      requireCenterPick
        ? report.picking.actualGpu === true &&
          report.picking.temporaryReleased === true
        : report.picking.actualGpu === null &&
          report.picking.temporaryReleased === null,
    deterministicCleanup:
      report.cleanup.releasedBytes === expected.uploadedBytes &&
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

export async function qualifyGltfBrowserWebGl2({
  manifestPath,
} = {}) {
  const prepared = await preparePublicGltfBrowserProbe({
    manifestPath,
  });
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
    let browserReport;
    try {
      browserReport = await poll(
        client,
        `(() => {
          const report = globalThis.__gltfBrowserProbeReport;
          if (!report || report.status === "running") {
            return null;
          }
          return report;
        })()`,
        {
          timeoutMs:
            prepared.input.qualification.timeoutMs,
        },
      );
    } catch (error) {
      if (errors.length > 0) {
        throw new Error(
          `glTF Browser runtime failed before reporting: ` +
            errors.slice(0, 3).join(" | "),
          { cause: error },
        );
      }
      throw error;
    }
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
      prepared.input.qualification,
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
      asOf:
        prepared.input.qualification.classification ===
          "product-scale-reference"
          ? "2026-08-08"
          : "2026-08-04",
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
        classification:
          prepared.input.qualification.classification,
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
      qualification: {
        expected:
          prepared.input.qualification.expected,
        rendererLimits:
          prepared.input.qualification.rendererLimits,
        requireCenterPick:
          prepared.input.qualification.requireCenterPick,
      },
      assertions: gates,
      limitations:
        prepared.input.qualification.classification ===
          "product-scale-reference"
          ? [
              "SwiftShader proves the Browser WebGL2 API path, not physical GPU hardware",
              "the public GLB is reference geometry and not a BIM semantic model",
              "Browser and VS Code product file-open surfaces remain separate gates",
              "write, round-trip and BIM semantic authority remain blocked",
            ]
          : [
              "SwiftShader proves the Browser WebGL2 API path, not physical GPU hardware",
              "the public Box GLB is not product-scale geometry",
              "Browser and VS Code product file-open surfaces remain separate gates",
              "write, round-trip and BIM semantic authority remain blocked",
            ],
    };
    if (
      evidence.fixture.sha256 !==
        prepared.input.fixture.sha256 ||
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
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 100,
    });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyGltfBrowserWebGl2({
    manifestPath: options.manifestPath,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output === null) {
    process.stdout.write(serialized);
  } else {
    await writeFile(options.output, serialized);
    console.log(`Wrote ${path.relative(ROOT, options.output)}`);
  }
}
