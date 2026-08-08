import { spawn, spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBimExplorerWebServer,
} from "./serve-bim-explorer-web.mjs";
import {
  ensurePublicIfcFixture,
  loadPublicIfcFixtureManifest,
} from "./public-ifc-fixture.mjs";
import {
  acquirePublicGltfFixture,
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "./public-gltf-fixture.mjs";
import {
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";
import {
  acquirePublicE57Fixture,
} from "./public-e57-fixture.mjs";
import {
  acquirePublicE57SphericalFixture,
} from "./public-e57-spherical-fixture.mjs";
import {
  acquirePublicE57MultipleScanFixture,
} from "./public-e57-multiple-scan-fixture.mjs";
import {
  resolveChromeQualificationExecutable,
} from "./chrome-qualification-runtime.mjs";

function timeoutError(label) {
  return new DOMException(
    `BIM product qualification timed out: ${label}`,
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
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
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
  const endpoint = withTimeout(
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
        const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(
          stderr,
        );
        if (match !== null) {
          resolve(match[1]);
        }
      });
    }),
    15_000,
    "Chrome CDP startup",
  );
  const browserWebSocket = await endpoint;
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
    browserVersion,
    browserWebSocket,
    child,
  };
}

class CdpClient {
  #events = new Map();
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
      const listeners = this.#events.get(message.method) ?? [];
      this.#events.delete(message.method);
      for (const listener of listeners) {
        listener(message.params ?? {});
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

  event(method, milliseconds = 10_000) {
    return withTimeout(
      new Promise((resolve) => {
        const listeners = this.#events.get(method) ?? [];
        listeners.push(resolve);
        this.#events.set(method, listeners);
      }),
      milliseconds,
      method,
    );
  }

  on(method, listener) {
    const subscribers =
      this.#subscribers.get(method) ?? new Set();
    subscribers.add(listener);
    this.#subscribers.set(method, subscribers);
    return () => {
      subscribers.delete(listener);
      if (subscribers.size === 0) {
        this.#subscribers.delete(method);
      }
    };
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails !== undefined) {
      const description =
        response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text;
      throw new Error(
        `Browser evaluation failed: ` +
          `${description}`,
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

function assertions(
  opened,
  interaction,
  cleanup,
  errors,
  fixture,
) {
  const pointCloud = ["e57", "las", "laz"].includes(
    fixture.format,
  );
  const reference = fixture.format !== "ifc" && !pointCloud;
  const selectedReferenceIdentity =
    typeof interaction.selectedNativeId === "string" &&
    /^node:\d+\/mesh:\d+\/primitive:\d+$/u.test(
      interaction.selectedNativeId,
    );
  const selectedPointIdentity =
    typeof interaction.selectedNativeId === "string" &&
    /^point:\d+$/u.test(interaction.selectedNativeId) &&
    Number.isSafeInteger(
      interaction.pointSelection?.identity?.pointIndex,
    ) &&
    interaction.pointSelection.identity.authority ===
      "derived-point-range-order" &&
    interaction.pointSelection.identity.nativeId ===
      interaction.selectedNativeId &&
    interaction.pointSelection.identity.rangeSha256 ===
      opened.pointCloud?.rangeSha256 &&
    interaction.pointSelection.status === "hit" &&
    interaction.pointSelection.coordinates?.origin ===
      "canvas-top-left" &&
    Array.isArray(interaction.pointSelection.worldPosition) &&
    interaction.pointSelection.worldPosition.length === 3 &&
    interaction.pointSelection.worldPosition.every(Number.isFinite);
  return Object.freeze({
    actualBrowserWebGl2:
      opened.renderer.actualGpu === true &&
      opened.renderer.nonBackgroundPixels > 0,
    boundedLocalSource:
      opened.source.byteLength > 0 &&
      opened.source.byteLength <= 64 * 1024 * 1024 &&
      opened.resources.sourceBytes === opened.source.byteLength,
    ...(fixture.rendererLimits === null
      ? {}
      : {
          boundedReferenceRenderer:
            opened.renderer.sourceReadBytes <=
              fixture.rendererLimits
                .maximumSourceReadBytes &&
            opened.renderer.uploadedBytes <=
              fixture.rendererLimits.maximumGpuCacheBytes &&
            opened.model.triangles <=
              fixture.rendererLimits
                .maximumInstancedTriangles,
        }),
    localOnly:
      opened.externalUpload === false &&
      opened.telemetry === false &&
      interaction.externalOrigins.length === 0,
    pathFree:
      interaction.serializedReport.includes(".ifc") === false &&
      interaction.serializedReport.includes(".gltf") === false &&
      interaction.serializedReport.includes(".glb") === false &&
      interaction.serializedReport.includes(".e57") === false &&
      interaction.serializedReport.includes(".las") === false &&
      interaction.serializedReport.includes(".laz") === false &&
      interaction.serializedReport.includes("file:") === false,
    ...(pointCloud
      ? {
          pointCloudAnd3d:
            interaction.pickDisabled === false &&
            interaction.searchDisabled === true &&
            interaction.selectionOrigin === "3d" &&
            selectedPointIdentity &&
            opened.pointCloud?.pointPrimitive === "POINTS" &&
            opened.pointCloud.coordinateReferenceStatus ===
              "unqualified" &&
            opened.renderer.sourceReadBytes ===
              fixture.pointRangeBytes &&
            opened.renderer.uploadedBytes ===
              fixture.pointRangePayloadBytes,
        }
      : reference
      ? {
          referenceAnd3dSync:
            interaction.searchResults > 0 &&
            interaction.selectionOrigin === "3d" &&
            selectedReferenceIdentity &&
            (
              fixture.exactPickNativeId !== true ||
              interaction.selectedNativeId ===
                fixture.nativeId
            ) &&
            opened.reference?.globalId === null &&
            opened.reference?.selectedNativeId ===
              fixture.nativeId,
        }
      : {
          semanticAnd3dSync:
            interaction.searchResults > 0 &&
            interaction.selectionOrigin === "3d" &&
            interaction.selectedExpressId !== null,
        }),
    workerAndGpuCleanup:
      cleanup.status === "disposed" &&
      cleanup.cleanup?.backend?.disposed === true &&
      cleanup.cleanup?.client?.disposed === true &&
      (
        !pointCloud ||
        (
          cleanup.cleanup.rendererDisposed === true &&
          cleanup.cleanup.pointRangeCleared === true &&
          cleanup.cleanup.workerTerminatedAfterTransfer === true
        )
      ),
    noRuntimeErrors: errors.length === 0,
    fixtureIdentity:
      opened.source.byteLength === fixture.sourceBytes &&
      opened.source.fingerprint === fixture.fingerprint &&
      (
        pointCloud
          ? (
              opened.source.format === fixture.format &&
              opened.source.formatVersion ===
                fixture.formatVersion &&
              opened.source.pointFormat === fixture.pointFormat &&
              opened.source.sourceRole ===
                "derived-or-reference-points" &&
              opened.source.semanticAuthority === false &&
              opened.source.coordinateReferenceStatus ===
                "unqualified" &&
              opened.model.points === fixture.points &&
              opened.model.ranges === fixture.ranges &&
              opened.pointCloud.rangeSha256 ===
                fixture.pointRangeSha256 &&
              opened.lifecycle.cpuPointRangeCleared === true &&
              opened.lifecycle.sourceBufferCleared === true &&
              opened.lifecycle.workerTerminatedAfterTransfer === true
            )
          : reference
          ? (
              opened.source.format === fixture.format &&
              opened.source.gltfVersion ===
                fixture.gltfVersion &&
              opened.source.sourceRole ===
                "derived-or-reference-mesh" &&
              opened.source.semanticAuthority === false &&
              opened.model.entities === fixture.entities &&
              opened.model.geometryRecords ===
                fixture.geometryRecords &&
              opened.model.instances === fixture.instances
            )
          : (
              opened.source.ifcSchema === fixture.ifcSchema &&
              opened.model.products === fixture.products &&
              opened.model.treeNodes === fixture.treeNodes
            )
      ) &&
      (
        pointCloud ||
        opened.model.triangles === fixture.triangles
      ) &&
      opened.model.ranges === fixture.ranges,
  });
}

async function qualificationFixture(kind) {
  if (kind === "synthetic") {
    return Object.freeze({
      kind,
      serverFixture: "synthetic",
      input: null,
      id: "synthetic-semantic-ifc4",
      committed: false,
      format: "ifc",
      sourceBytes: 4_030,
      fingerprint:
        "sha256:4a07468afbed86fad1bc107b59b73a5cebbf041bc8a31785fe9d92ab25873999",
      ifcSchema: "IFC4",
      products: 2,
      treeNodes: 7,
      triangles: 24,
      ranges: 1,
      rendererLimits: null,
      searchQuery: "Wall",
      provenance: null,
    });
  }
  if (kind === "public") {
    const manifest = await loadPublicIfcFixtureManifest();
    const fixture = await ensurePublicIfcFixture({ manifest });
    return Object.freeze({
      kind,
      serverFixture: "none",
      input: fixture.input,
      id: manifest.fixtureId,
      committed: false,
      format: "ifc",
      sourceBytes: manifest.entry.byteLength,
      fingerprint: `sha256:${manifest.entry.sha256}`,
      ifcSchema: manifest.ifc.schema,
      products: manifest.expected.geometryProducts,
      treeNodes: 3_578,
      triangles: manifest.expected.triangles,
      ranges: 3,
      rendererLimits: null,
      searchQuery: "Wall",
      provenance: Object.freeze({
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        license: manifest.provenance.license,
        cacheHit: fixture.receipt.cacheHit,
        bundled: false,
      }),
    });
  }
  if (kind === "gltf-public") {
    const acquired = await acquirePublicGltfFixture();
    const { manifest } = acquired;
    acquired.bytes.fill(0);
    return Object.freeze({
      kind,
      serverFixture: "none",
      input: acquired.cachePath,
      id: manifest.fixtureId,
      committed: false,
      format: "glb",
      sourceBytes: manifest.entry.byteLength,
      fingerprint: `sha256:${manifest.entry.sha256}`,
      gltfVersion: "2.0",
      entities: 1,
      geometryRecords: 1,
      instances: 1,
      triangles: 12,
      ranges: 1,
      nativeId: "node:1/mesh:0/primitive:0",
      exactPickNativeId: true,
      rendererLimits: null,
      searchQuery: "primitive",
      provenance: Object.freeze({
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        license: manifest.license.spdx,
        cacheHit: acquired.receipt.cacheHit,
        bundled: false,
      }),
    });
  }
  if (kind === "gltf-product-scale") {
    const acquired = await acquirePublicGltfFixture({
      manifestPath: PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
    });
    const { manifest } = acquired;
    acquired.bytes.fill(0);
    return Object.freeze({
      kind,
      serverFixture: "none",
      input: acquired.cachePath,
      id: manifest.fixtureId,
      committed: false,
      format: "glb",
      sourceBytes: manifest.entry.byteLength,
      fingerprint: `sha256:${manifest.entry.sha256}`,
      gltfVersion: manifest.expected.gltfVersion,
      entities: manifest.expected.instances,
      geometryRecords: manifest.expected.geometryRecords,
      instances: manifest.expected.instances,
      triangles: manifest.expected.triangles,
      ranges: 1,
      nativeId: "node:0/mesh:0/primitive:0",
      exactPickNativeId: false,
      rendererLimits: Object.freeze({
        ...manifest.browserQualification.rendererLimits,
      }),
      searchQuery: "node:0",
      provenance: Object.freeze({
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        license: manifest.license.spdx,
        cacheHit: acquired.receipt.cacheHit,
        bundled: false,
      }),
    });
  }
  if (kind === "e57-public") {
    const acquired = await acquirePublicE57Fixture();
    const { manifest } = acquired;
    acquired.bytes.fill(0);
    return Object.freeze({
      kind,
      serverFixture: "none",
      input: acquired.cachePath,
      id: manifest.fixtureId,
      committed: false,
      format: "e57",
      sourceBytes: manifest.entry.byteLength,
      fingerprint: `sha256:${manifest.entry.sha256}`,
      formatVersion: manifest.expected.formatVersion,
      pointFormat: "cartesian-xyz-rgb",
      points: manifest.expected.pointRecords,
      ranges: 1,
      pointRangeBytes:
        manifest.expected.pointRangeByteLength,
      pointRangePayloadBytes:
        manifest.expected.pointRangePayloadBytes,
      pointRangeSha256:
        manifest.expected.pointRangeSha256,
      rendererLimits: null,
      searchQuery: null,
      provenance: Object.freeze({
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        license: manifest.license.spdx,
        cacheHit: acquired.receipt.cacheHit,
        bundled: false,
        sampleRedistributed: false,
      }),
    });
  }
  if (kind === "e57-spherical-public") {
    const acquired = await acquirePublicE57SphericalFixture();
    const { manifest } = acquired;
    acquired.bytes.fill(0);
    return Object.freeze({
      kind,
      serverFixture: "none",
      input: acquired.cachePath,
      id: manifest.fixtureId,
      committed: false,
      format: "e57",
      sourceBytes: manifest.entry.byteLength,
      fingerprint: `sha256:${manifest.entry.sha256}`,
      formatVersion: manifest.expected.formatVersion,
      pointFormat: "spherical-rae-rgb",
      points: manifest.expected.pointRecords,
      ranges: 1,
      pointRangeBytes:
        manifest.expected.pointRangeByteLength,
      pointRangePayloadBytes:
        manifest.expected.pointRangePayloadBytes,
      pointRangeSha256:
        manifest.expected.pointRangeSha256,
      rendererLimits: null,
      searchQuery: null,
      provenance: Object.freeze({
        repository: manifest.provenance.repository,
        sourcePage: manifest.provenance.sourcePage,
        publishedAt: manifest.provenance.publishedAt,
        license: manifest.license.identifier,
        notice: manifest.license.notice,
        cacheHit: acquired.receipt.cacheHit,
        bundled: false,
        sampleRedistributed: false,
      }),
    });
  }
  if (kind === "e57-multiple-scan-public") {
    const acquired = await acquirePublicE57MultipleScanFixture();
    const { manifest } = acquired;
    acquired.bytes.fill(0);
    const projection = manifest.expected.productProjection;
    return Object.freeze({
      kind,
      serverFixture: "none",
      input: acquired.cachePath,
      id: manifest.fixtureId,
      committed: false,
      format: "e57",
      sourceBytes: manifest.entry.byteLength,
      fingerprint: `sha256:${manifest.entry.sha256}`,
      formatVersion: manifest.expected.formatVersion,
      pointFormat: projection.pointFormat,
      points: manifest.expected.pointRecords,
      ranges: 1,
      pointRangeBytes: projection.pointRangeByteLength,
      pointRangePayloadBytes: projection.pointRangePayloadBytes,
      pointRangeSha256: projection.pointRangeSha256,
      rendererLimits: null,
      searchQuery: null,
      provenance: Object.freeze({
        repository: manifest.provenance.repository,
        sourcePage: manifest.provenance.sourcePage,
        publishedAt: manifest.provenance.publishedAt,
        license: manifest.license.identifier,
        notice: manifest.license.notice,
        cacheHit: acquired.receipt.cacheHit,
        bundled: false,
        sampleRedistributed: false,
      }),
    });
  }
  if (["las-public", "laz-public"].includes(kind)) {
    const acquired = await acquirePublicLasLazFixture();
    const format = kind === "las-public" ? "las" : "laz";
    const entry = acquired.manifest.entries[format];
    const cacheHit = acquired.receipt.entries[format].cacheHit;
    acquired.bytes.las.fill(0);
    acquired.bytes.laz.fill(0);
    return Object.freeze({
      kind,
      serverFixture: "none",
      input: acquired.cachePaths[format],
      id: `${acquired.manifest.fixtureId}-${format}`,
      committed: false,
      format,
      sourceBytes: entry.byteLength,
      fingerprint: `sha256:${entry.sha256}`,
      formatVersion:
        acquired.manifest.expected.formatVersion,
      pointFormat: acquired.manifest.expected.pointFormat,
      points: acquired.manifest.expected.pointRecords,
      ranges: 1,
      pointRangeBytes: 163_264,
      pointRangePayloadBytes: 163_216,
      pointRangeSha256:
        "8383abce84d57b8f50ee1f39aa1d442a" +
        "7f258cd759ab9812aff1a0625ab10449",
      rendererLimits: null,
      searchQuery: null,
      provenance: Object.freeze({
        repository:
          acquired.manifest.provenance.repository,
        commit: acquired.manifest.provenance.commit,
        license:
          acquired.manifest.use.sourceRepositoryLicense,
        cacheHit,
        bundled: false,
        sampleRedistributed: false,
      }),
    });
  }
  throw new TypeError(
    "BIM product qualification fixture must be synthetic, public, " +
      "gltf-public, gltf-product-scale, e57-public, " +
      "e57-spherical-public, e57-multiple-scan-public, " +
      "las-public, or laz-public",
  );
}

export async function qualifyBimProductShell({
  fixture: fixtureKind = "synthetic",
} = {}) {
  const fixture = await qualificationFixture(fixtureKind);
  const pointCloud = ["e57", "las", "laz"].includes(
    fixture.format,
  );
  const server = createBimExplorerWebServer({
    fixture: fixture.serverFixture,
  });
  const origin = await listen(server);
  const userDataDirectory = await mkdtemp(
    path.join(tmpdir(), "bim-explorer-chrome-"),
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
      await fetch(newTarget, {
        method: "PUT",
      })
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
      errors.push(event.exceptionDetails?.text ?? "exception");
    });
    client.on("Network.requestWillBeSent", (event) => {
      requestedUrls.push(event.request?.url ?? "");
    });
    const loaded = client.event("Page.loadEventFired");
    await client.send("Page.navigate", {
      url: origin,
    });
    await loaded;
    await poll(
      client,
      `globalThis.__bimExplorerProductReport?.status === "idle"`,
      {
        timeoutMs: 10_000,
      },
    );
    if (fixture.input === null) {
      await client.evaluate(
        `document.querySelector("#open-fixture").click(); true`,
      );
    } else {
      await client.send("DOM.enable");
      const document = await client.send("DOM.getDocument", {
        depth: 1,
      });
      const sourceInput = await client.send(
        "DOM.querySelector",
        {
          nodeId: document.root.nodeId,
          selector: "#source-file",
        },
      );
      if (!Number.isSafeInteger(sourceInput.nodeId)) {
        throw new Error(
          "Browser local source input is unavailable",
        );
      }
      await client.send("DOM.setFileInputFiles", {
        nodeId: sourceInput.nodeId,
        files: [fixture.input],
      });
    }
    let opened = await poll(
      client,
      `(() => {
        const report = globalThis.__bimExplorerProductReport;
        if (report?.status === "failed") {
          throw new Error(JSON.stringify(
            report.diagnostic ?? { code: "open failed" }
          ));
        }
        return report?.status === "ready"
          ? JSON.parse(JSON.stringify(report))
          : null;
      })()`,
      {
        timeoutMs:
          fixture.kind === "gltf-product-scale"
            ? 120_000
            : fixture.kind === "public"
              ? 60_000
              : 30_000,
      },
    );
    const initialPointLod = pointCloud &&
      opened.pointCloud?.hierarchy?.levels?.length > 1
        ? {
            lifecycle: opened.lifecycle,
            lod: opened.pointCloud.lod,
            renderer: opened.renderer,
            renderedRangeSha256:
              opened.pointCloud.renderedRangeSha256,
          }
        : null;
    if (initialPointLod !== null) {
      await client.evaluate(
        `document.querySelector("#pick-model").click(); true`,
      );
      initialPointLod.pointSelection = await poll(
        client,
        `(() => {
          const selection = globalThis.__bimExplorerProductReport
            ?.pointSelection;
          return selection?.status === "hit"
            ? JSON.parse(JSON.stringify(selection))
            : null;
        })()`,
      );
    }
    while (
      pointCloud &&
      opened.pointCloud?.lod !== null &&
      opened.pointCloud?.lod?.fullDetail !== true
    ) {
      const nextLevel = opened.pointCloud.lod.levelIndex + 1;
      await client.evaluate(
        `document.querySelector("#show-all").click(); true`,
      );
      opened = await poll(
        client,
        `(() => {
          const report = globalThis.__bimExplorerProductReport;
          return report?.status === "ready" &&
            report?.pointCloud?.lod?.levelIndex === ${nextLevel}
              ? JSON.parse(JSON.stringify(report))
              : null;
        })()`,
        { timeoutMs: 120_000 },
      );
    }
    if (!pointCloud) {
      await client.evaluate(`(() => {
        const input = document.querySelector("#search-input");
        input.value = ${JSON.stringify(fixture.searchQuery)};
        document.querySelector("#search-form").requestSubmit();
        return true;
      })()`);
      await poll(
        client,
        `document.querySelectorAll("#search-results [role=option]").length`,
      );
      await client.evaluate(
        `document.querySelector("#pick-model").click(); true`,
      );
      await poll(
        client,
        `document.querySelector("#selection-origin").textContent === "3d"`,
      );
    } else {
      await client.evaluate(
        `document.querySelector("#pick-model").click(); true`,
      );
      await poll(
        client,
        `(() => {
          const report = globalThis.__bimExplorerProductReport;
          return report?.pointSelection?.status === "hit" &&
            document.querySelector("#selection-origin")
              .textContent === "3d";
        })()`,
      );
    }
    const interaction = await client.evaluate(`(() => {
      const report = globalThis.__bimExplorerProductReport;
      const origins = [...new Set(
        performance.getEntriesByType("resource")
          .map((entry) => new URL(entry.name).origin)
          .filter((value) => value !== location.origin)
      )];
      return {
        externalOrigins: origins,
        searchResults:
          document.querySelectorAll(
            "#search-results [role=option]"
          ).length,
        selectedExpressId: Number(
          document.querySelector(
            "#model-tree [aria-selected=true]"
          )?.dataset.expressId
        ) || null,
        selectedNativeId:
          report?.pointSelection?.identity?.nativeId ??
          document.querySelector(
            "#model-tree [aria-selected=true]"
          )?.dataset.nativeId ?? null,
        pointSelection:
          report?.pointSelection === null ||
          report?.pointSelection === undefined
            ? null
            : JSON.parse(JSON.stringify(report.pointSelection)),
        selectionOrigin:
          document.querySelector("#selection-origin").textContent,
        pickDisabled:
          document.querySelector("#pick-model").disabled,
        searchDisabled:
          document.querySelector("#search-input").disabled,
        serializedReport: JSON.stringify(report),
        treeRows:
          document.querySelectorAll(
            "#model-tree [role=treeitem]"
          ).length,
      };
    })()`);
    await client.evaluate(
      `document.querySelector("#close-model").click(); true`,
    );
    const cleanup = await poll(
      client,
      `globalThis.__bimExplorerProductReport?.status === "disposed"
        ? JSON.parse(JSON.stringify(
            globalThis.__bimExplorerProductReport
          ))
        : null`,
    );
    const gates = assertions(
      opened,
      interaction,
      cleanup,
      errors,
      fixture,
    );
    if (Object.values(gates).some((value) => value !== true)) {
      throw new Error(
        `BIM product qualification failed: ` +
          `${JSON.stringify(gates)}`,
      );
    }
    const localRequests = requestedUrls.filter(Boolean);
    return Object.freeze({
      schema:
        "bim-explorer-product-shell-browser-evidence/1",
      capturedAt: new Date().toISOString(),
      environment: {
        browser: chrome.browserVersion,
        headless: true,
        platform: `${process.platform}-${process.arch}`,
        rendererQualification:
          "actual Browser WebGL2 API via SwiftShader; physical GPU not claimed",
      },
      fixture: {
        id: fixture.id,
        committed: fixture.committed,
        format: fixture.format,
        sourceBytes: opened.source.byteLength,
        fingerprint: opened.source.fingerprint,
        ...(fixture.format === "ifc"
          ? { ifcSchema: opened.source.ifcSchema }
          : pointCloud
            ? {
                formatVersion: opened.source.formatVersion,
                pointFormat: opened.source.pointFormat,
              }
          : {
              gltfVersion: opened.source.gltfVersion,
              nativeId: fixture.nativeId,
            }),
        ...(fixture.provenance === null
          ? {}
          : { provenance: fixture.provenance }),
      },
      ...(fixture.rendererLimits === null
        ? {}
        : {
            qualification: {
              classification: "product-scale-reference",
              rendererLimits: fixture.rendererLimits,
            },
          }),
      observation: {
        hostKind: opened.hostKind,
        model: opened.model,
        performance: opened.performance,
        resources: opened.resources,
        renderer: opened.renderer,
        ...(initialPointLod === null
          ? {}
          : { initialPointLod }),
        ...(fixture.format === "ifc"
          ? { semantic: opened.semantic }
          : pointCloud
            ? {
                pointCloud: opened.pointCloud,
                pointSelection: interaction.pointSelection,
                productLifecycle: opened.lifecycle,
                lodTransitions: opened.lodTransitions,
              }
            : { reference: opened.reference }),
        interaction: {
          searchResults: interaction.searchResults,
          selectedExpressId:
            interaction.selectedExpressId,
          selectedNativeId:
            interaction.selectedNativeId,
          pointIndex:
            interaction.pointSelection?.identity?.pointIndex ?? null,
          selectionOrigin:
            interaction.selectionOrigin,
          pickDisabled: interaction.pickDisabled,
          searchDisabled: interaction.searchDisabled,
          treeRows: interaction.treeRows,
        },
        lifecycle: {
          opened: opened.status,
          closed: cleanup.status,
          backendDisposed:
            cleanup.cleanup.backend.disposed,
          clientDisposed:
            cleanup.cleanup.client.disposed,
          ...(pointCloud
            ? {
                pointRangeCleared:
                  cleanup.cleanup.pointRangeCleared,
                rendererDisposed:
                  cleanup.cleanup.rendererDisposed,
                workerTerminatedAfterTransfer:
                  cleanup.cleanup.workerTerminatedAfterTransfer,
              }
            : {}),
        },
        network: {
          externalOrigins: interaction.externalOrigins,
          localRequestCount: localRequests.length,
        },
        runtimeErrors: errors,
      },
      assertions: gates,
      decision: {
        browserProductShell: "passed",
        referenceProductOpen:
          fixture.format === "ifc" || pointCloud
            ? "not-applicable"
            : "passed-bounded-read-only",
        pointCloudProductOpen: pointCloud
          ? "passed-bounded-read-only-unqualified-coordinates"
          : "not-applicable",
        actualPhysicalGpu: "not-claimed",
        publicViewerCoreConformance: "held",
        vscodeChromiumRuntime: "separate-gate",
      },
    });
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

function parseArguments(values) {
  const allowedFixtures = new Set([
    "gltf-product-scale",
    "gltf-public",
    "e57-public",
    "e57-spherical-public",
    "e57-multiple-scan-public",
    "las-public",
    "laz-public",
    "public",
    "synthetic",
  ]);
  const options = {
    fixture: "synthetic",
    output: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    const value = values[index + 1];
    if (
      name === "--fixture" &&
      allowedFixtures.has(value)
    ) {
      options.fixture = value;
      index += 1;
      continue;
    }
    if (
      name === "--output" &&
      typeof value === "string" &&
      !value.startsWith("-")
    ) {
      options.output = path.resolve(value);
      index += 1;
      continue;
    }
    throw new TypeError(
      "usage: node scripts/qualify-bim-product-shell.mjs " +
        "[--fixture synthetic|public|gltf-public|" +
        "gltf-product-scale|e57-public|e57-spherical-public|" +
        "e57-multiple-scan-public|las-public|laz-public] " +
        "[--output path]",
    );
  }
  return options;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const evidence = await qualifyBimProductShell({
    fixture: options.fixture,
  });
  if (options.output !== null) {
    await mkdir(path.dirname(options.output), {
      recursive: true,
    });
    await writeFile(
      options.output,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
