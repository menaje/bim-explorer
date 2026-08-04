import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
  const browserVersion = spawnSync(CHROME, ["--version"], {
    encoding: "utf8",
  }).stdout.trim();
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
      throw new Error(
        `Browser evaluation failed: ` +
          `${response.exceptionDetails.text}`,
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
  return Object.freeze({
    actualBrowserWebGl2:
      opened.renderer.actualGpu === true &&
      opened.renderer.nonBackgroundPixels > 0,
    boundedLocalSource:
      opened.source.byteLength > 0 &&
      opened.source.byteLength <= 64 * 1024 * 1024 &&
      opened.resources.sourceBytes === opened.source.byteLength,
    localOnly:
      opened.externalUpload === false &&
      opened.telemetry === false &&
      interaction.externalOrigins.length === 0,
    pathFree:
      interaction.serializedReport.includes(".ifc") === false &&
      interaction.serializedReport.includes("file:") === false,
    semanticAnd3dSync:
      interaction.searchResults > 0 &&
      interaction.selectionOrigin === "3d" &&
      interaction.selectedExpressId !== null,
    workerAndGpuCleanup:
      cleanup.status === "disposed" &&
      cleanup.cleanup?.backend?.disposed === true &&
      cleanup.cleanup?.client?.disposed === true,
    noRuntimeErrors: errors.length === 0,
    fixtureIdentity:
      opened.source.byteLength === fixture.sourceBytes &&
      opened.source.fingerprint === fixture.fingerprint &&
      opened.source.ifcSchema === fixture.ifcSchema &&
      opened.model.products === fixture.products &&
      opened.model.treeNodes === fixture.treeNodes &&
      opened.model.triangles === fixture.triangles &&
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
      sourceBytes: 4_030,
      fingerprint:
        "sha256:4a07468afbed86fad1bc107b59b73a5cebbf041bc8a31785fe9d92ab25873999",
      ifcSchema: "IFC4",
      products: 2,
      treeNodes: 7,
      triangles: 24,
      ranges: 1,
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
      sourceBytes: manifest.entry.byteLength,
      fingerprint: `sha256:${manifest.entry.sha256}`,
      ifcSchema: manifest.ifc.schema,
      products: manifest.expected.geometryProducts,
      treeNodes: 3_578,
      triangles: manifest.expected.triangles,
      ranges: 3,
      provenance: Object.freeze({
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        license: manifest.provenance.license,
        cacheHit: fixture.receipt.cacheHit,
        bundled: false,
      }),
    });
  }
  throw new TypeError(
    "BIM product qualification fixture must be synthetic or public",
  );
}

export async function qualifyBimProductShell({
  fixture: fixtureKind = "synthetic",
} = {}) {
  const fixture = await qualificationFixture(fixtureKind);
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
          "Browser local IFC input is unavailable",
        );
      }
      await client.send("DOM.setFileInputFiles", {
        nodeId: sourceInput.nodeId,
        files: [fixture.input],
      });
    }
    const opened = await poll(
      client,
      `(() => {
        const report = globalThis.__bimExplorerProductReport;
        if (report?.status === "failed") {
          throw new Error(report.diagnostic?.code ?? "open failed");
        }
        return report?.status === "ready"
          ? JSON.parse(JSON.stringify(report))
          : null;
      })()`,
      {
        timeoutMs:
          fixture.kind === "public" ? 60_000 : 30_000,
      },
    );
    await client.evaluate(`(() => {
      const input = document.querySelector("#search-input");
      input.value = "Wall";
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
        selectionOrigin:
          document.querySelector("#selection-origin").textContent,
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
        sourceBytes: opened.source.byteLength,
        fingerprint: opened.source.fingerprint,
        ifcSchema: opened.source.ifcSchema,
        ...(fixture.provenance === null
          ? {}
          : { provenance: fixture.provenance }),
      },
      observation: {
        hostKind: opened.hostKind,
        model: opened.model,
        performance: opened.performance,
        resources: opened.resources,
        renderer: opened.renderer,
        semantic: opened.semantic,
        interaction: {
          searchResults: interaction.searchResults,
          selectedExpressId:
            interaction.selectedExpressId,
          selectionOrigin:
            interaction.selectionOrigin,
          treeRows: interaction.treeRows,
        },
        lifecycle: {
          opened: opened.status,
          closed: cleanup.status,
          backendDisposed:
            cleanup.cleanup.backend.disposed,
          clientDisposed:
            cleanup.cleanup.client.disposed,
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
      recursive: true,
    });
  }
}

function parseFixtureArguments(values) {
  if (values.length === 0) {
    return "synthetic";
  }
  if (
    values.length === 2 &&
    values[0] === "--fixture" &&
    ["public", "synthetic"].includes(values[1])
  ) {
    return values[1];
  }
  throw new TypeError(
    "usage: node scripts/qualify-bim-product-shell.mjs " +
      "[--fixture synthetic|public]",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const evidence = await qualifyBimProductShell({
    fixture: parseFixtureArguments(process.argv.slice(2)),
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
