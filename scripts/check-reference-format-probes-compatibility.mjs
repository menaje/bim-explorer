import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  validateE57PublicSampleProbe,
} from "./qualify-e57-public-sample.mjs";

const PASSED_GATES = Object.freeze([
  "cacheOnlyPublicFixture",
  "pinnedDigestAcquisition",
  "e57EnvelopeInspection",
  "e57PhysicalPageIntegrity",
  "e57MetadataProfile",
]);
const HELD_GATES = Object.freeze([
  "e57PointDecode",
  "e57Renderer",
  "e57ProductOpen",
]);

export function validateReferenceFormatProbeCompatibility(
  manifest,
  evidence,
) {
  validateE57PublicSampleProbe(evidence);
  if (
    manifest?.schema !==
      "bim-explorer-reference-format-probes-compatibility/1" ||
    manifest.status !== "pre-admission" ||
    manifest.asOf !== "2026-08-08" ||
    manifest.evidence?.e57PublicSample !==
      "compatibility/evidence/" +
        "e57-public-sample-probe-2026-08-08.json"
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
    manifest.policy.releaseBundled !== false ||
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
    sampleFormats: 1,
  });
}

async function main() {
  const [manifest, evidence] = await Promise.all([
    readFile("compatibility/reference-format-probes.json", "utf8")
      .then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "e57-public-sample-probe-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
  ]);
  console.log(JSON.stringify(
    validateReferenceFormatProbeCompatibility(manifest, evidence),
  ));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
