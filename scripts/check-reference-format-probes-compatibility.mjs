import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  validateE57PublicSampleProbe,
} from "./qualify-e57-public-sample.mjs";
import {
  validateLasLazPublicSampleProbe,
} from "./qualify-las-laz-public-sample.mjs";
import {
  validateLasLazBrowserWorkerQualification,
} from "./qualify-las-laz-browser-worker.mjs";
import {
  validateLasLazPointRendererQualification,
} from "./qualify-las-laz-point-renderer.mjs";

const PASSED_GATES = Object.freeze([
  "cacheOnlyPublicFixture",
  "pinnedDigestAcquisition",
  "e57EnvelopeInspection",
  "e57PhysicalPageIntegrity",
  "e57MetadataProfile",
  "lasHeaderInspection",
  "lazHeaderInspection",
  "lasPointDecode",
  "lazPointDecode",
  "lasLazPointRecordParity",
  "lasLazWorkerLifecycle",
  "lasLazWorkerMemoryBudget",
  "lasLazMalformedInputIsolation",
  "lasLazPointRange",
  "lasLazRenderer",
]);
const HELD_GATES = Object.freeze([
  "e57PointDecode",
  "e57Renderer",
  "e57ProductOpen",
  "lasLazCoordinateReference",
  "lasLazProductOpen",
]);

export function validateReferenceFormatProbeCompatibility(
  manifest,
  e57Evidence,
  lasLazEvidence,
  lasLazWorkerEvidence,
  lasLazPointRendererEvidence,
) {
  validateE57PublicSampleProbe(e57Evidence);
  validateLasLazPublicSampleProbe(lasLazEvidence);
  validateLasLazBrowserWorkerQualification(
    lasLazWorkerEvidence,
  );
  validateLasLazPointRendererQualification(
    lasLazPointRendererEvidence,
  );
  if (
    manifest?.schema !==
      "bim-explorer-reference-format-probes-compatibility/1" ||
    manifest.status !== "pre-admission" ||
    manifest.asOf !== "2026-08-08" ||
    manifest.evidence?.e57PublicSample !==
      "compatibility/evidence/" +
        "e57-public-sample-probe-2026-08-08.json" ||
    manifest.evidence?.lasLazPublicSample !==
      "compatibility/evidence/" +
        "las-laz-public-sample-probe-2026-08-08.json" ||
    manifest.evidence?.lasLazBrowserWorker !==
      "compatibility/evidence/" +
        "las-laz-browser-worker-2026-08-08.json" ||
    manifest.evidence?.lasLazPointRenderer !==
      "compatibility/evidence/" +
        "las-laz-point-renderer-2026-08-08.json"
  ) {
    throw new Error(
      "reference format probe compatibility identity is invalid",
    );
  }
  const gates = manifest.gates;
  if (
    gates === null ||
    typeof gates !== "object" ||
    Array.isArray(gates) ||
    Object.keys(gates).length !==
      PASSED_GATES.length + HELD_GATES.length
  ) {
    throw new Error("reference format probe Gate inventory is invalid");
  }
  for (const gate of PASSED_GATES) {
    if (gates[gate] !== true) {
      throw new Error(`reference format probe Gate ${gate} must pass`);
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(`reference format probe Gate ${gate} must be held`);
    }
  }
  if (
    manifest.policy?.sampleArtifactTracked !== false ||
    manifest.policy.sampleRedistributed !== false ||
    manifest.policy.releaseBundled !== false ||
    manifest.policy.decoderProductBundled !== false ||
    manifest.policy.testOnly !== true ||
    manifest.policy.formatAdmission !== false ||
    manifest.policy.productSupport !== false ||
    manifest.blockers?.length !== HELD_GATES.length ||
    manifest.limitations?.length < 4
  ) {
    throw new Error("reference format probe policy overclaims support");
  }
  return Object.freeze({
    status: manifest.status,
    passedGates: PASSED_GATES.length,
    heldGates: HELD_GATES.length,
    sampleFormats: 3,
  });
}

async function main() {
  const [
    manifest,
    e57Evidence,
    lasLazEvidence,
    lasLazWorkerEvidence,
    lasLazPointRendererEvidence,
  ] = await Promise.all([
    readFile("compatibility/reference-format-probes.json", "utf8")
      .then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-public-sample-probe-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "las-laz-public-sample-probe-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "las-laz-browser-worker-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "las-laz-point-renderer-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
  ]);
  console.log(JSON.stringify(
    validateReferenceFormatProbeCompatibility(
      manifest,
      e57Evidence,
      lasLazEvidence,
      lasLazWorkerEvidence,
      lasLazPointRendererEvidence,
    ),
  ));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
