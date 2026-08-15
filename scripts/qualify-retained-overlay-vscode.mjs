import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  qualifyVscodeCustomEditor,
} from "./qualify-vscode-custom-editor.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const SCHEMA =
  "bim-explorer-retained-overlay-vscode-qualification/1";

function parseArguments(values) {
  if (values.length === 0) {
    return { output: null };
  }
  if (
    values.length !== 2 ||
    !["--out", "--output"].includes(values[0]) ||
    typeof values[1] !== "string" ||
    values[1].startsWith("-")
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-retained-overlay-vscode.mjs " +
        "[--out path]",
    );
  }
  return { output: path.resolve(values[1]) };
}

function validRetained(value) {
  return (
    value?.contract ===
      "bim-explorer-federated-retained-overlay/0.1" &&
    value.actualWebGl2 === true &&
    value.atomic === true &&
    value.stagedFramebufferPreserved === true &&
    value.stagedPickMapPreserved === true &&
    value.payloadReads === 1 &&
    value.selectionItems === 1 &&
    value.selectionSource === value.selectedSource &&
    Number.isFinite(value.prepareMs) && value.prepareMs >= 0 &&
    Number.isFinite(value.commitMs) && value.commitMs >= 0 &&
    value.nonBackgroundPixels > 0 &&
    value.tombstonePickMiss === true &&
    value.externalReadsUnchanged === true &&
    value.baseGpuAllocationUnchanged === true &&
    value.cameraUnchanged === true &&
    value.clippingUnchanged === true &&
    value.selectionPreserved === true &&
    value.anchorsPreserved === true &&
    value.checkpointReads === 0 &&
    value.checkpointParses === 0 &&
    value.checkpointUploads === 0 &&
    value.retainedObjectsAfterTombstone === 0
  );
}

export function validateRetainedOverlayVscodeQualification(value) {
  return (
    value?.schema === SCHEMA &&
    value.status === "passed-actual-vscode-webgl2" &&
    value.asOf === "2026-08-15" &&
    value.environment?.host === "vscode-webview" &&
    typeof value.environment.vscode === "string" &&
    value.environment.runtimeLayout === "staged-development-source" &&
    value.fixture?.sourceCount === 3 &&
    value.lifecycle?.disposed === "disposed" &&
    value.cleanup?.backendDisposed === true &&
    value.cleanup.backendActiveBytes === 0 &&
    value.cleanup.retainedGeometryBytes === 0 &&
    validRetained(value.observation) &&
    Object.values(value.assertions ?? {}).every((item) => item === true)
  );
}

export async function qualifyRetainedOverlayVscode({
  vscodeRuntime = null,
} = {}) {
  const runtime = vscodeRuntime ??
    await resolveVscodeQualificationRuntime();
  const evidence = await qualifyVscodeCustomEditor({
    includeFederatedSurfaceFixture: true,
    includeRetainedOverlayFixture: true,
    rendererMode: "swiftshader",
    vscodeRuntime: runtime,
  });
  const observation =
    evidence.federatedSurfaceObservation?.retainedOverlay;
  const report = Object.freeze({
    schema: SCHEMA,
    status: "passed-actual-vscode-webgl2",
    asOf: "2026-08-15",
    capturedAt: new Date().toISOString(),
    environment: Object.freeze({
      host: "vscode-webview",
      vscode: evidence.environment.vscode,
      platform: evidence.environment.platform,
      rendererMode: evidence.environment.rendererMode,
      runtimeLayout: "staged-development-source",
      physicalGpuClaimed: false,
    }),
    fixture: Object.freeze({
      id: evidence.federatedSurfaceFixture?.id,
      sourceCount: evidence.federatedSurfaceFixture?.sourceCount,
      committed: false,
      releaseBundled: false,
    }),
    observation,
    cleanup: evidence.federatedSurfaceObservation?.cleanup,
    lifecycle: evidence.federatedSurfaceObservation?.lifecycle,
    assertions: Object.freeze({
      actualVscodeWebview: true,
      actualWebGl2Context: true,
      boundedAtomicStageCommit: true,
      geometryPickRevisionCoherent: true,
      sourceReadsUnchanged: true,
      baseGpuAllocationPreserved: true,
      cameraAndClippingPreserved: true,
      tombstoneAndCheckpointQualified: true,
      resourcesDisposed: true,
      immutablePublicV02RuntimeUntouched: true,
      generatedFixtureOnly: true,
      physicalGpuNotClaimed: true,
    }),
  });
  if (!validateRetainedOverlayVscodeQualification(report)) {
    throw new Error("retained overlay VS Code qualification failed");
  }
  return report;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyRetainedOverlayVscode();
  if (options.output !== null) {
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(
      options.output,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
