import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  validateE57PublicSampleProbe,
} from "./qualify-e57-public-sample.mjs";
import {
  validateE57ProfileMatrixQualification,
} from "./qualify-e57-profile-matrix.mjs";
import {
  validateE57SphericalProfileQualification,
} from "./qualify-e57-spherical-profile.mjs";
import {
  validateE57MultipleScanProfileEvidence,
} from "./qualify-e57-multiple-scan-profile.mjs";
import {
  validateE57SphericalBrowserProductQualification,
} from "./qualify-e57-spherical-browser-product.mjs";
import {
  validateE57SphericalVscodeProductQualification,
} from "./qualify-e57-spherical-vscode-product.mjs";
import {
  validateE57BrowserProductQualification,
} from "./qualify-e57-browser-product.mjs";
import {
  validateE57VscodeProductQualification,
} from "./qualify-e57-vscode-product.mjs";
import {
  validateLasLazPublicSampleProbe,
} from "./qualify-las-laz-public-sample.mjs";
import {
  validateLasLazBrowserWorkerQualification,
} from "./qualify-las-laz-browser-worker.mjs";
import {
  validateLasLazPointRendererQualification,
} from "./qualify-las-laz-point-renderer.mjs";
import {
  validateLasLazBrowserProductQualification,
} from "./qualify-las-laz-browser-product.mjs";
import {
  validateLasLazVscodeProductQualification,
} from "./qualify-las-laz-vscode-product.mjs";

const PASSED_GATES = Object.freeze([
  "cacheOnlyPublicFixture",
  "pinnedDigestAcquisition",
  "e57EnvelopeInspection",
  "e57PhysicalPageIntegrity",
  "e57MetadataProfile",
  "e57CoordinateRepresentations",
  "e57CartesianValidityFiltering",
  "e57IndexlessCompressedVector",
  "e57SphericalCoordinateProfile",
  "e57MultipleScanDecode",
  "e57ScanPoseApplication",
  "e57StructuredIndexAlignment",
  "e57SphericalBrowserProductOpen",
  "e57SphericalVscodeProductOpen",
  "e57PointDecode",
  "e57Renderer",
  "e57BrowserProductOpen",
  "e57VscodeProductOpen",
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
  "lasLazProductSource",
  "lasLazBrowserProductOpen",
  "lasLazVscodeProductOpen",
]);
const HELD_GATES = Object.freeze([
  "e57CoordinateReference",
  "e57FormatAdmission",
  "lasLazCoordinateReference",
  "lasLazFormatAdmission",
]);

export function validateReferenceFormatProbeCompatibility(
  manifest,
  e57Evidence,
  e57ProfileMatrixEvidence,
  e57SphericalProfileEvidence,
  e57MultipleScanProfileEvidence,
  e57SphericalBrowserProductEvidence,
  e57SphericalVscodeProductEvidence,
  e57BrowserProductEvidence,
  e57VscodeProductEvidence,
  lasLazEvidence,
  lasLazWorkerEvidence,
  lasLazPointRendererEvidence,
  lasLazBrowserProductEvidence,
  lasLazVscodeProductEvidence,
) {
  validateE57PublicSampleProbe(e57Evidence);
  validateE57ProfileMatrixQualification(e57ProfileMatrixEvidence);
  validateE57SphericalProfileQualification(
    e57SphericalProfileEvidence,
  );
  validateE57MultipleScanProfileEvidence(
    e57MultipleScanProfileEvidence,
  );
  validateE57SphericalBrowserProductQualification(
    e57SphericalBrowserProductEvidence,
  );
  validateE57SphericalVscodeProductQualification(
    e57SphericalVscodeProductEvidence,
  );
  validateE57BrowserProductQualification(
    e57BrowserProductEvidence,
  );
  validateE57VscodeProductQualification(
    e57VscodeProductEvidence,
  );
  validateLasLazPublicSampleProbe(lasLazEvidence);
  validateLasLazBrowserWorkerQualification(
    lasLazWorkerEvidence,
  );
  validateLasLazPointRendererQualification(
    lasLazPointRendererEvidence,
  );
  validateLasLazBrowserProductQualification(
    lasLazBrowserProductEvidence,
  );
  validateLasLazVscodeProductQualification(
    lasLazVscodeProductEvidence,
  );
  if (
    manifest?.schema !==
      "bim-explorer-reference-format-probes-compatibility/1" ||
    manifest.status !== "pre-admission" ||
    manifest.asOf !== "2026-08-08" ||
    manifest.evidence?.e57PublicSample !==
      "compatibility/evidence/" +
        "e57-public-sample-probe-2026-08-08.json" ||
    manifest.evidence?.e57ProfileMatrix !==
      "compatibility/evidence/" +
        "e57-profile-matrix-2026-08-08.json" ||
    manifest.evidence?.e57SphericalProfile !==
      "compatibility/evidence/" +
        "e57-spherical-profile-2026-08-08.json" ||
    manifest.evidence?.e57MultipleScanProfile !==
      "compatibility/evidence/" +
        "e57-multiple-scan-profile-2026-08-08.json" ||
    manifest.evidence?.e57SphericalBrowserProduct !==
      "compatibility/evidence/" +
        "e57-spherical-browser-product-2026-08-08.json" ||
    manifest.evidence?.e57SphericalVscodeProduct !==
      "compatibility/evidence/" +
        "e57-spherical-vscode-product-2026-08-08.json" ||
    manifest.evidence?.e57BrowserProduct !==
      "compatibility/evidence/" +
        "e57-browser-product-2026-08-08.json" ||
    manifest.evidence?.e57VscodeProduct !==
      "compatibility/evidence/" +
        "e57-vscode-product-2026-08-08.json" ||
    manifest.evidence?.lasLazPublicSample !==
      "compatibility/evidence/" +
        "las-laz-public-sample-probe-2026-08-08.json" ||
    manifest.evidence?.lasLazBrowserWorker !==
      "compatibility/evidence/" +
        "las-laz-browser-worker-2026-08-08.json" ||
    manifest.evidence?.lasLazPointRenderer !==
      "compatibility/evidence/" +
        "las-laz-point-renderer-2026-08-08.json" ||
    manifest.evidence?.lasLazBrowserProduct !==
      "compatibility/evidence/" +
        "las-laz-browser-product-2026-08-08.json" ||
    manifest.evidence?.lasLazVscodeProduct !==
      "compatibility/evidence/" +
        "las-laz-vscode-product-2026-08-08.json"
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
    manifest.policy.decoderBrowserProductRuntime !== true ||
    manifest.policy.decoderVscodeProductRuntime !== true ||
    manifest.policy.e57DecoderProductRuntime !== true ||
    manifest.policy.decoderReleaseBundled !== false ||
    manifest.policy.sampleUseTestOnly !== true ||
    manifest.policy.browserExperimentalProductOpen !== true ||
    manifest.policy.vscodeExperimentalProductOpen !== true ||
    manifest.policy.e57BrowserExperimentalProductOpen !== true ||
    manifest.policy.e57VscodeExperimentalProductOpen !== true ||
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
    e57ProfileMatrixEvidence,
    e57SphericalProfileEvidence,
    e57MultipleScanProfileEvidence,
    e57SphericalBrowserProductEvidence,
    e57SphericalVscodeProductEvidence,
    e57BrowserProductEvidence,
    e57VscodeProductEvidence,
    lasLazEvidence,
    lasLazWorkerEvidence,
    lasLazPointRendererEvidence,
    lasLazBrowserProductEvidence,
    lasLazVscodeProductEvidence,
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
        "e57-profile-matrix-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-spherical-profile-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-multiple-scan-profile-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-spherical-browser-product-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-spherical-vscode-product-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-browser-product-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-vscode-product-2026-08-08.json",
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
    readFile(
      "compatibility/evidence/" +
        "las-laz-browser-product-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "las-laz-vscode-product-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
  ]);
  console.log(JSON.stringify(
    validateReferenceFormatProbeCompatibility(
      manifest,
      e57Evidence,
      e57ProfileMatrixEvidence,
      e57SphericalProfileEvidence,
      e57MultipleScanProfileEvidence,
      e57SphericalBrowserProductEvidence,
      e57SphericalVscodeProductEvidence,
      e57BrowserProductEvidence,
      e57VscodeProductEvidence,
      lasLazEvidence,
      lasLazWorkerEvidence,
      lasLazPointRendererEvidence,
      lasLazBrowserProductEvidence,
      lasLazVscodeProductEvidence,
    ),
  ));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
