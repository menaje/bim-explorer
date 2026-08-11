import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateGltfProductPlatformMatrix,
} from "./gltf-product-platform-evidence.mjs";

const EVIDENCE_PATH =
  "compatibility/evidence/" +
  "gltf-product-platform-matrix-2026-08-08.json";
const RUN_ID = 31_239_573_856;
const COMMIT =
  "4be1d6c85d9dd3947612fb980b3f418aad3a8007";

export function validateGltfProductPlatformCompatibility(
  matrix,
  productManifest,
  sourceManifest,
) {
  const result = validateGltfProductPlatformMatrix(matrix, {
    commit: COMMIT,
    runId: RUN_ID,
  });
  if (
    result.projectionSha256 !==
      "6645aeeaff7e221a0bc14d999ef165bbb1805730" +
        "179337a0d403a7ba3a1d1c77" ||
    productManifest?.asOf !== "2026-08-11" ||
    productManifest?.gates?.crossPlatformGltfProductOpen !== true ||
    productManifest?.evidence?.gltfProductPlatformMatrix !==
      EVIDENCE_PATH ||
    productManifest?.policy
      ?.claimCrossPlatformGltfProductOpen !== true ||
    productManifest?.policy?.claimPhysicalGpu !== true ||
    productManifest?.physicalGpuScope?.platform !==
      "darwin-arm64" ||
    productManifest?.physicalGpuScope?.crossPlatform !== false ||
    sourceManifest?.asOf !== "2026-08-11" ||
    sourceManifest?.gates?.crossPlatformProductOpen !== true ||
    sourceManifest?.evidence?.productPlatformMatrix !==
      EVIDENCE_PATH ||
    sourceManifest?.policy?.claimCrossPlatformProductOpen !== true ||
    sourceManifest?.policy?.claimPhysicalGpu !== true ||
    sourceManifest?.evidence?.representativePhysicalGpu !==
      "compatibility/evidence/" +
        "bim-product-shell-representative-physical-gpu-" +
        "darwin-arm64-2026-08-11.json"
  ) {
    throw new Error(
      "glTF product platform manifests do not admit the evidence",
    );
  }
  const expectedEnvironments = {
    "darwin-arm64": {
      capturedAt: "2026-08-08T04:30:57.569Z",
      browser: "Google Chrome 150.0.7871.187",
    },
    "linux-x64": {
      capturedAt: "2026-08-08T04:30:43.487Z",
      browser: "Google Chrome 150.0.7871.128",
    },
  };
  for (const platform of matrix.platforms) {
    const expected =
      expectedEnvironments[platform.environment.platform];
    if (
      expected === undefined ||
      platform.capturedAt !== expected.capturedAt ||
      platform.environment.browser !== expected.browser ||
      platform.environment.node !== "v24.18.0" ||
      platform.environment.vscodeDownloadAttempts !== 1 ||
      platform.fixtureCacheHit !== false ||
      platform.vscodeInstall.package.byteLength !== 1_168_823 ||
      platform.vscodeInstall.package.workerBundleSha256 !==
        "d7bf7bd53fb45616b986ab6ecb1b5adaa" +
          "39cf63dfadd3f51c29f17faadd6e02f"
    ) {
      throw new Error(
        "glTF product platform runner identity differs",
      );
    }
  }
  return result;
}

async function main() {
  const root = process.cwd();
  const [matrix, productManifest, sourceManifest] =
    await Promise.all([
      readFile(path.join(root, EVIDENCE_PATH), "utf8")
        .then(JSON.parse),
      readFile(
        path.join(
          root,
          "compatibility",
          "bim-product-shells.json",
        ),
        "utf8",
      ).then(JSON.parse),
      readFile(
        path.join(
          root,
          "compatibility",
          "gltf-reference-source.json",
        ),
        "utf8",
      ).then(JSON.parse),
    ]);
  const result = validateGltfProductPlatformCompatibility(
    matrix,
    productManifest,
    sourceManifest,
  );
  console.log(
    `glTF product platform compatibility check passed: ` +
      `${result.passedPlatforms} platforms and ` +
      `${result.productSurfaces} product surfaces`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
