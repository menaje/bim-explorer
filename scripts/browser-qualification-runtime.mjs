import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resolveChromeQualificationExecutable,
} from "./chrome-qualification-runtime.mjs";

function timeoutError(label) {
  return new DOMException(
    `Browser qualification timed out: ${label}`,
    "TimeoutError",
  );
}

export function withBrowserTimeout(
  promise,
  milliseconds,
  label,
) {
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
  try {
    const browserWebSocket = await withBrowserTimeout(
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
    return {
      child,
      browserVersion: version.stdout.trim(),
      browserWebSocket,
    };
  } catch (error) {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
    throw error;
  }
}

class CdpClient {
  #nextId = 1;
  #pending = new Map();
  #socket;
  #subscribers = new Map();

  static async connect(url) {
    const socket = new WebSocket(url);
    await withBrowserTimeout(
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
      this.#socket.send(JSON.stringify({ id, method, params }));
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
        "Browser evaluation failed: " +
        response.exceptionDetails.text,
      );
    }
    return response.result?.value;
  }

  close() {
    this.#socket.close();
  }
}

async function poll(client, expression, timeoutMs) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const value = await client.evaluate(expression);
    if (value !== null && value !== false) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw timeoutError(expression);
}

export async function runBrowserQualification({
  server,
  reportExpression,
  timeoutMs,
  userDataPrefix = "bim-explorer-browser-",
} = {}) {
  if (
    typeof server?.listen !== "function" ||
    typeof server?.close !== "function" ||
    typeof reportExpression !== "string" ||
    reportExpression.length === 0 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 180_000 ||
    !/^[a-z0-9-]+$/u.test(userDataPrefix)
  ) {
    throw new TypeError(
      "Browser qualification runtime options are invalid",
    );
  }
  const origin = await listen(server);
  let userDataDirectory = null;
  let chrome = null;
  let client = null;
  try {
    userDataDirectory = await mkdtemp(
      path.join(tmpdir(), userDataPrefix),
    );
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
    const runtimeErrors = [];
    const requestedUrls = [];
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", (event) => {
      runtimeErrors.push(
        event.exceptionDetails?.text ?? "Browser exception",
      );
    });
    client.on("Network.requestWillBeSent", (event) => {
      requestedUrls.push(event.request?.url ?? "");
    });
    await client.send("Page.navigate", { url: origin });
    const report = await poll(
      client,
      reportExpression,
      timeoutMs,
    );
    const externalOrigins = [
      ...new Set(
        requestedUrls
          .filter((url) => /^https?:/u.test(url))
          .map((url) => new URL(url).origin)
          .filter((requestOrigin) => requestOrigin !== origin),
      ),
    ];
    return Object.freeze({
      report,
      browserVersion: chrome.browserVersion,
      platform: `${process.platform}-${process.arch}`,
      externalOrigins: Object.freeze(externalOrigins),
      requestedUrls: Object.freeze(requestedUrls),
      runtimeErrors: Object.freeze(runtimeErrors),
    });
  } finally {
    client?.close();
    if (chrome?.child.exitCode === null) {
      const exited = new Promise((resolve) => {
        chrome.child.once("exit", resolve);
      });
      chrome.child.kill("SIGTERM");
      await withBrowserTimeout(
        exited,
        10_000,
        "Chrome shutdown",
      ).catch(() => {
        chrome.child.kill("SIGKILL");
      });
    }
    await closeServer(server);
    if (userDataDirectory !== null) {
      await rm(userDataDirectory, {
        force: true,
        maxRetries: 10,
        recursive: true,
        retryDelay: 100,
      });
    }
  }
}
