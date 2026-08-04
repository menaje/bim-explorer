import { spawn } from "node:child_process";

const SAFE_ENVIRONMENT_NAMES = [
  "PATH",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "SYSTEMROOT",
];

function safeEnvironment() {
  return {
    ...Object.fromEntries(
      SAFE_ENVIRONMENT_NAMES
        .filter((name) => typeof process.env[name] === "string")
        .map((name) => [name, process.env[name]]),
    ),
    NO_COLOR: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUTF8: "1",
  };
}

export class AdapterProcessError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = "AdapterProcessError";
    this.code = "BIM_EXPLORER_ADAPTER_PROCESS_FAILED";
    this.receipt = Object.freeze(receipt);
  }
}

function validateOptions(options) {
  if (
    options === null ||
    typeof options !== "object" ||
    !/^[a-z0-9][a-z0-9-]+$/u.test(options.id) ||
    typeof options.executable !== "string" ||
    options.executable.length === 0 ||
    !Array.isArray(options.arguments) ||
    !options.arguments.every((value) => typeof value === "string") ||
    (
      options.onProgress !== undefined &&
      typeof options.onProgress !== "function"
    )
  ) {
    throw new TypeError("invalid isolated adapter process options");
  }
}

export async function runAdapterProcess(options) {
  validateOptions(options);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 2 * 1024 * 1024;
  const cancellationGraceMs = options.cancellationGraceMs ?? 250;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes <= 0 ||
    !Number.isSafeInteger(cancellationGraceMs) ||
    cancellationGraceMs < 0
  ) {
    throw new TypeError("invalid isolated adapter resource budget");
  }
  if (options.signal?.aborted) {
    throw new AdapterProcessError(`${options.id} adapter cancelled`, {
      outcome: "cancelled-before-start",
      exitCode: null,
      signal: null,
      processExited: false,
      timedOut: false,
      cancelled: true,
      outputLimitExceeded: false,
      stdoutBytes: 0,
      stderrBytes: 0,
      stderrCaptured: false,
      wallClockMs: 0,
    });
  }

  return await new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(options.executable, options.arguments, {
      cwd: options.cwd ?? process.cwd(),
      env: safeEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let progressBuffer = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let cancelled = false;
    let outputLimitExceeded = false;
    let cancellationEscalation = null;
    let settled = false;

    const kill = (signal) => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      kill("SIGKILL");
    }, timeoutMs);
    const onAbort = () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      kill("SIGTERM");
      cancellationEscalation = setTimeout(() => {
        kill("SIGKILL");
      }, cancellationGraceMs);
    };
    options.signal?.addEventListener("abort", onAbort, {
      once: true,
    });
    if (options.signal?.aborted) {
      onAbort();
    }

    const cleanup = () => {
      clearTimeout(timeout);
      if (cancellationEscalation !== null) {
        clearTimeout(cancellationEscalation);
      }
      options.signal?.removeEventListener("abort", onAbort);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes <= maxOutputBytes) {
        stdout += chunk;
        if (options.onProgress) {
          progressBuffer += chunk;
          let newline = progressBuffer.indexOf("\n");
          while (newline >= 0) {
            const line = progressBuffer.slice(0, newline).trim();
            progressBuffer = progressBuffer.slice(newline + 1);
            if (line) {
              try {
                options.onProgress(Object.freeze(JSON.parse(line)));
              } catch {
                // The final report and process receipt remain authoritative.
              }
            }
            newline = progressBuffer.indexOf("\n");
          }
        }
      } else {
        outputLimitExceeded = true;
        kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > maxOutputBytes) {
        outputLimitExceeded = true;
        kill("SIGKILL");
      }
    });
    child.on("error", () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(
        new AdapterProcessError(
          `${options.id} adapter could not start`,
          {
            outcome: "spawn-error",
            exitCode: null,
            signal: null,
            processExited: false,
            timedOut: false,
            cancelled: false,
            outputLimitExceeded: false,
            stdoutBytes,
            stderrBytes,
            stderrCaptured: stderrBytes > 0,
            wallClockMs: performance.now() - started,
          },
        ),
      );
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      const outcome = cancelled
        ? "cancelled"
        : timedOut
          ? "timeout"
          : outputLimitExceeded
            ? "output-limit"
            : exitCode === 0
              ? "completed"
              : signal
                ? "signal"
                : "nonzero-exit";
      const receipt = {
        outcome,
        exitCode,
        signal,
        processExited: true,
        timedOut,
        cancelled,
        outputLimitExceeded,
        stdoutBytes,
        stderrBytes,
        stderrCaptured: stderrBytes > 0,
        wallClockMs: performance.now() - started,
      };
      if (outcome !== "completed") {
        reject(
          new AdapterProcessError(
            `${options.id} adapter process ${outcome}`,
            receipt,
          ),
        );
        return;
      }

      const lines = stdout.trim().split("\n").filter(Boolean);
      try {
        const report = JSON.parse(lines.at(-1));
        resolve({
          report,
          receipt,
        });
      } catch {
        reject(
          new AdapterProcessError(
            `${options.id} adapter returned an invalid report`,
            {
              ...receipt,
              outcome: "invalid-report",
            },
          ),
        );
      }
    });
  });
}
