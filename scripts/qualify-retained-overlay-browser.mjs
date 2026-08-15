import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  runBrowserQualification,
} from "./browser-qualification-runtime.mjs";
import {
  createRetainedOverlayBrowserProbeServer,
} from "./serve-retained-overlay-browser-probe.mjs";

const AS_OF = "2026-08-15";

export function validateRetainedOverlayBrowserQualification(value) {
  return (
    value?.schema ===
      "bim-explorer-retained-overlay-browser-qualification/1" &&
    value.status === "passed-actual-browser-webgl2" &&
    value.asOf === AS_OF &&
    value.contract ===
      "bim-explorer-federated-retained-overlay/0.1" &&
    value.environment?.host === "browser" &&
    value.environment.actualWebGl2 === true &&
    value.environment.context === "webgl2" &&
    value.transaction?.atomic === true &&
    value.transaction.payloadReads === 1 &&
    value.transaction.beforeCommit?.framebufferPreserved === true &&
    value.transaction.beforeCommit.pickMapPreserved === true &&
    typeof value.transaction.selectedPickId === "string" &&
    value.transaction.selectionItems === 1 &&
    value.transaction.selectionSource ===
      value.transaction.selectedSource &&
    value.transaction.tombstonePickMiss === true &&
    value.pixels?.nonBackgroundAfterCommit > 0 &&
    value.preservation?.externalReadsUnchanged === true &&
    value.preservation.unchangedBaseGpuAllocation === true &&
    value.preservation.cameraUnchanged === true &&
    value.preservation.clippingUnchanged === true &&
    value.preservation.checkpointReads === 0 &&
    value.preservation.checkpointParses === 0 &&
    value.preservation.checkpointUploads === 0 &&
    value.cleanup?.backendDisposed === true &&
    value.cleanup.backendActiveBytes === 0 &&
    value.cleanup.retainedObjects === 0 &&
    value.browser?.physicalGpuClaimed === false &&
    Array.isArray(value.network?.externalOrigins) &&
    value.network.externalOrigins.length === 0 &&
    Array.isArray(value.network.runtimeErrors) &&
    value.network.runtimeErrors.length === 0
  );
}

export async function qualifyRetainedOverlayBrowser() {
  const runtime = await runBrowserQualification({
    server: await createRetainedOverlayBrowserProbeServer(),
    reportExpression: `(() => {
      const report = globalThis.__retainedOverlayBrowserReport;
      return !report || report.status === "running" ? null : report;
    })()`,
    timeoutMs: 30_000,
    userDataPrefix: "bim-explorer-retained-overlay-browser-",
  });
  const report = runtime.report;
  if (
    report?.status !== "passed" ||
    runtime.externalOrigins.length !== 0 ||
    runtime.runtimeErrors.length !== 0
  ) {
    throw new Error(
      "retained overlay Browser qualification failed: " +
        JSON.stringify({ report, runtimeErrors: runtime.runtimeErrors }),
    );
  }
  const evidence = Object.freeze({
    ...report,
    status: "passed-actual-browser-webgl2",
    asOf: AS_OF,
    capturedAt: new Date().toISOString(),
    browser: {
      version: runtime.browserVersion,
      platform: runtime.platform,
      headless: true,
      physicalGpuClaimed: false,
    },
    network: {
      externalOrigins: runtime.externalOrigins,
      runtimeErrors: runtime.runtimeErrors,
      requestCount: runtime.requestedUrls.length,
    },
  });
  if (!validateRetainedOverlayBrowserQualification(evidence)) {
    throw new Error("retained overlay Browser evidence is invalid");
  }
  return evidence;
}

async function main() {
  const values = process.argv.slice(2);
  const output = values.length === 0
    ? null
    : values.length === 2 && values[0] === "--out"
      ? path.resolve(values[1])
      : undefined;
  if (output === undefined) {
    throw new TypeError(
      "usage: node scripts/qualify-retained-overlay-browser.mjs [--out path]",
    );
  }
  const evidence = await qualifyRetainedOverlayBrowser();
  if (output !== null) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
