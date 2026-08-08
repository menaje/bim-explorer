import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const REQUIRED_PATHS = [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/ISSUE_TEMPLATE/reference-format-qualification.yml",
  ".gitignore",
  ".node-version",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "LICENSES/fflate-MIT.txt",
  "LICENSES/saxes-ISC.txt",
  "LICENSES/xmlchars-MIT.txt",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "SOURCE_OFFER.md",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
  "adapters/README.md",
  "adapters/ifcopenshell/README.md",
  "adapters/ifcopenshell/THIRD_PARTY_NOTICES.md",
  "adapters/ifcopenshell/cancel_in_call.py",
  "adapters/ifcopenshell/qualify.py",
  "adapters/ifcopenshell/inspect_negative.py",
  "adapters/web-ifc/README.md",
  "adapters/web-ifc/THIRD_PARTY_NOTICES.md",
  "adapters/web-ifc/package.json",
  "adapters/web-ifc/src/create-source-artifact.mjs",
  "adapters/web-ifc/src/cancel-in-call.mjs",
  "adapters/web-ifc/src/inspect.mjs",
  "adapters/web-ifc/src/inspect-negative.mjs",
  "adapters/web-ifc/src/measure-headless-renderer.mjs",
  "adapters/web-ifc/src/measure-source-artifact.mjs",
  "adapters/web-ifc/src/measure-performance.mjs",
  "apps/README.md",
  "apps/bim-explorer-vscode/README.md",
  "apps/bim-explorer-vscode/extension.js",
  "apps/bim-explorer-vscode/package.json",
  "apps/bim-explorer-vscode/src/provider.js",
  "apps/bim-explorer-vscode/src/webview-html.js",
  "apps/bim-explorer-web/README.md",
  "apps/bim-explorer-web/app.mjs",
  "apps/bim-explorer-web/index.html",
  "apps/bim-explorer-web/reference-mesh-explorer.mjs",
  "apps/bim-explorer-web/source-worker.bundle.mjs",
  "apps/bim-explorer-web/source-worker.mjs",
  "apps/bim-explorer-web/styles.css",
  "apps/bim-explorer-web/worker-source-client.mjs",
  "apps/browser-gpu-probe/README.md",
  "apps/browser-gpu-probe/app.mjs",
  "apps/browser-gpu-probe/index.html",
  "apps/browser-gpu-probe/source-session.mjs",
  "apps/browser-gpu-probe/styles.css",
  "apps/browser-worker-probe/README.md",
  "apps/browser-worker-probe/app.mjs",
  "apps/browser-worker-probe/ifc-worker.mjs",
  "apps/browser-worker-probe/index.html",
  "apps/browser-worker-probe/performance-budget.mjs",
  "apps/browser-worker-probe/source-session.mjs",
  "apps/browser-worker-probe/styles.css",
  "apps/federation-browser-probe/README.md",
  "apps/federation-browser-probe/app.mjs",
  "apps/federation-browser-probe/index.html",
  "apps/federation-browser-probe/styles.css",
  "apps/gltf-browser-probe/app.mjs",
  "apps/gltf-browser-probe/index.html",
  "apps/gltf-browser-probe/README.md",
  "apps/gltf-browser-probe/styles.css",
  "apps/las-laz-worker-probe/README.md",
  "apps/las-laz-worker-probe/app.mjs",
  "apps/las-laz-worker-probe/index.html",
  "apps/las-laz-worker-probe/laz-worker.js",
  "apps/las-laz-worker-probe/worker-client.mjs",
  "apps/las-laz-point-renderer-probe/README.md",
  "apps/las-laz-point-renderer-probe/app.mjs",
  "apps/las-laz-point-renderer-probe/index.html",
  "apps/las-laz-point-renderer-probe/styles.css",
  "apps/browser-worker-probe/worker-client.mjs",
  "apps/semantic-explorer-probe/README.md",
  "apps/semantic-explorer-probe/app.mjs",
  "apps/semantic-explorer-probe/index.html",
  "apps/semantic-explorer-probe/source-session.mjs",
  "apps/semantic-explorer-probe/styles.css",
  "compatibility/README.md",
  "compatibility/bim-federation.json",
  "compatibility/reference-format-probes.json",
  "compatibility/gltf-reference-source.json",
  "compatibility/community-release.json",
  "compatibility/evidence/bim-federation-synthetic-2026-08-04.json",
  "compatibility/evidence/bim-federation-product-scale-2026-08-08.json",
  "compatibility/evidence/bim-federation-product-scale-platform-matrix-2026-08-08.json",
  "compatibility/evidence/e57-public-sample-probe-2026-08-08.json",
  "compatibility/evidence/las-laz-public-sample-probe-2026-08-08.json",
  "compatibility/evidence/las-laz-browser-worker-2026-08-08.json",
  "compatibility/evidence/las-laz-point-renderer-2026-08-08.json",
  "compatibility/evidence/gltf-reference-source-khronos-box-2026-08-04.json",
  "compatibility/evidence/gltf-reference-source-khronos-box-browser-webgl2-2026-08-04.json",
  "compatibility/evidence/gltf-reference-source-khronos-box-browser-product-2026-08-04.json",
  "compatibility/evidence/gltf-product-platform-matrix-2026-08-08.json",
  "compatibility/evidence/gltf-reference-source-a-beautiful-game-product-scale-2026-08-08.json",
  "compatibility/evidence/gltf-reference-source-a-beautiful-game-browser-product-2026-08-08.json",
  "compatibility/evidence/gltf-reference-source-a-beautiful-game-vscode-product-2026-08-08.json",
  "compatibility/evidence/gltf-reference-source-a-beautiful-game-vscode-vsix-product-2026-08-08.json",
  "compatibility/evidence/community-release-v0.1.0-2026-08-04.json",
  "compatibility/bim-product-shells.json",
  "compatibility/spatial-integration.json",
  "compatibility/bim-renderer-3d.json",
  "compatibility/bim-model-source.json",
  "compatibility/bim-semantic-explorer.json",
  "compatibility/openbim-explorer.json",
  "compatibility/evidence/bim-semantic-explorer-browser-synthetic-2026-08-04.json",
  "compatibility/evidence/bim-product-shell-browser-synthetic-2026-08-04.json",
  "compatibility/evidence/bim-product-shell-browser-public-2026-08-04.json",
  "compatibility/evidence/bim-product-shell-vscode-synthetic-2026-08-04.json",
  "compatibility/evidence/bim-product-shell-vscode-vsix-install-2026-08-04.json",
  "compatibility/evidence/spatial-integration-synthetic-2026-08-04.json",
  "compatibility/evidence/openbim-explorer-synthetic-2026-08-04.json",
  "compatibility/evidence/bim-renderer-3d-public-headless-2026-08-04.json",
  "compatibility/evidence/bim-renderer-3d-public-browser-webgl2-2026-08-04.json",
  "compatibility/evidence/bim-renderer-3d-public-browser-view-state-2026-08-04.json",
  "compatibility/evidence/bim-model-source-public-representative-2026-08-04.json",
  "compatibility/evidence/bim-model-source-metadata-2026-08-04.json",
  "compatibility/evidence/bim-model-source-synthetic-mapped-2026-08-03.json",
  "compatibility/evidence/bim-model-source-synthetic-mapped-2026-08-04.json",
  "compatibility/evidence/ifc-engine-synthetic-mapped-2026-08-03.json",
  "compatibility/evidence/ifc-engine-synthetic-small-2026-08-03.json",
  "compatibility/evidence/ifc-engine-negative-corpus-2026-08-04.json",
  "compatibility/evidence/ifc-engine-in-call-cancellation-2026-08-04.json",
  "compatibility/evidence/ifc-engine-resource-exhaustion-2026-08-04.json",
  "compatibility/evidence/ifc-license-profile-2026-08-04.json",
  "compatibility/evidence/web-ifc-platform-package-matrix-2026-08-04.json",
  "compatibility/evidence/viewer-core-local-probe-2026-08-03.json",
  "compatibility/evidence/viewer-core-release-2026-08-04.json",
  "compatibility/evidence/web-ifc-browser-checkpoint-cancellation-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-in-call-cancellation-2026-08-04.json",
  "compatibility/evidence/web-ifc-browser-bounded-performance-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-local-file-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-public-representative-performance-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-worker-smoke-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-negative-corpus-2026-08-04.json",
  "compatibility/evidence/web-ifc-public-representative-node-performance-2026-08-03.json",
  "compatibility/ifc-engines.json",
  "compatibility/viewer-core.json",
  "docs/README.md",
  "docs/adr/ADR-0001-independent-product-boundary.md",
  "docs/adr/ADR-0002-viewer-core-consumer-admission.md",
  "docs/community-release.md",
  "docs/decision-register.md",
  "docs/federation-and-reference-formats.md",
  "docs/reference-format-intake.md",
  "docs/ifc-engine-qualification.md",
  "docs/openbim-exploration.md",
  "docs/open-source-commercial-boundary.md",
  "docs/product-boundary.md",
  "docs/releases/v0.1.0.md",
  "docs/system-architecture.md",
  "fixtures/README.md",
  "fixtures/ifc/synthetic-mapped/manifest.json",
  "fixtures/ifc/negative-corpus/manifest.json",
  "fixtures/ifc/synthetic-performance/manifest.json",
  "fixtures/ifc/synthetic-small/manifest.json",
  "fixtures/ifc/public-schependomlaan/manifest.json",
  "fixtures/gltf/public-khronos-box/manifest.json",
  "fixtures/gltf/public-khronos-a-beautiful-game/manifest.json",
  "fixtures/e57/public-libe57-coloured-cube/manifest.json",
  "fixtures/las-laz/public-loaders-gl-ripple/manifest.json",
  "package-lock.json",
  "package.json",
  "packages/README.md",
  "packages/bim-federation/README.md",
  "packages/bim-federation/package.json",
  "packages/bim-federation/src/index.mjs",
  "packages/bim-federation/src/reference-format-intake.mjs",
  "packages/bim-federation/src/renderer-projection.mjs",
  "packages/gltf-reference-source/README.md",
  "packages/gltf-reference-source/package.json",
  "packages/gltf-reference-source/src/geometry.mjs",
  "packages/gltf-reference-source/src/index.mjs",
  "packages/gltf-reference-source/src/math.mjs",
  "packages/gltf-reference-source/src/profile.mjs",
  "packages/bim-model-source/README.md",
  "packages/bim-model-source/package.json",
  "packages/bim-model-source/src/artifact-schema.mjs",
  "packages/bim-model-source/src/index.mjs",
  "packages/bim-model-source/src/semantic-index.mjs",
  "packages/bim-model-source/src/sha256.mjs",
  "packages/bim-semantic-explorer/README.md",
  "packages/bim-semantic-explorer/package.json",
  "packages/bim-semantic-explorer/src/index.mjs",
  "packages/spatial-integration/README.md",
  "packages/spatial-integration/package.json",
  "packages/spatial-integration/src/index.mjs",
  "packages/openbim-explorer/README.md",
  "packages/openbim-explorer/package.json",
  "packages/openbim-explorer/src/bcf.mjs",
  "packages/openbim-explorer/src/bsdd.mjs",
  "packages/openbim-explorer/src/common.mjs",
  "packages/openbim-explorer/src/ids.mjs",
  "packages/openbim-explorer/src/index.mjs",
  "packages/openbim-explorer/src/xml.mjs",
  "packages/bim-renderer-3d/README.md",
  "packages/bim-renderer-3d/package.json",
  "packages/bim-renderer-3d/src/camera.mjs",
  "packages/bim-renderer-3d/src/index.mjs",
  "packages/bim-renderer-3d/src/point-cloud.mjs",
  "packages/bim-renderer-3d/src/point-cloud-webgl2-backend.mjs",
  "packages/bim-renderer-3d/src/webgl2-backend.mjs",
  "packages/ifc-engine-contract/README.md",
  "packages/ifc-engine-contract/package.json",
  "packages/ifc-engine-contract/src/index.mjs",
  "packages/ifc-engine-contract/src/process-supervisor.mjs",
  "packages/viewer-core-consumer/README.md",
  "packages/viewer-core-consumer/package.json",
  "packages/viewer-core-consumer/src/bim-mock-delta-source.mjs",
  "packages/viewer-core-consumer/src/bim-mock-source.mjs",
  "packages/viewer-core-consumer/src/bim-model-render-source.mjs",
  "packages/viewer-core-consumer/src/index.mjs",
  "packages/viewer-core-consumer/src/mock-3d-presentation.mjs",
  "packages/viewer-core-consumer/src/mock-host.mjs",
  "packaging/web-ifc-platform-stage/package.json",
  "packaging/web-ifc-platform-stage/README.md",
  "packaging/web-ifc-platform-stage/THIRD_PARTY_NOTICES.md",
  "scripts/check-bim-model-source-compatibility.mjs",
  "scripts/check-bim-federation-compatibility.mjs",
  "scripts/check-reference-format-probes-compatibility.mjs",
  "scripts/check-gltf-reference-source-compatibility.mjs",
  "scripts/check-gltf-product-platform-compatibility.mjs",
  "scripts/check-community-history.mjs",
  "scripts/check-community-release-compatibility.mjs",
  "scripts/check-bim-product-shell-compatibility.mjs",
  "scripts/check-spatial-integration-compatibility.mjs",
  "scripts/check-openbim-compatibility.mjs",
  "scripts/check-bim-renderer-3d-compatibility.mjs",
  "scripts/check-bim-semantic-explorer-compatibility.mjs",
  "scripts/check-docs.mjs",
  "scripts/check-ifc-engine-compatibility.mjs",
  "scripts/check-repository.mjs",
  "scripts/check-text.mjs",
  "scripts/check-viewer-core-compatibility.mjs",
  "scripts/build-community-release.mjs",
  "scripts/assemble-bim-federation-product-scale-platform-matrix.mjs",
  "scripts/assemble-gltf-product-platform-matrix.mjs",
  "scripts/compare-community-release.mjs",
  "scripts/fetch-public-ifc-fixture.mjs",
  "scripts/fetch-public-gltf-fixture.mjs",
  "scripts/fetch-public-e57-fixture.mjs",
  "scripts/fetch-public-las-laz-fixture.mjs",
  "scripts/build-vscode-worker.mjs",
  "scripts/browser-qualification-runtime.mjs",
  "scripts/bim-federation-product-scale-platform-evidence.mjs",
  "scripts/chrome-qualification-runtime.mjs",
  "scripts/generate-synthetic-ifc.mjs",
  "scripts/generate-synthetic-gltf.mjs",
  "scripts/generate-negative-ifc-corpus.mjs",
  "scripts/gltf-product-platform-evidence.mjs",
  "scripts/generate-community-sbom.mjs",
  "scripts/public-ifc-fixture.mjs",
  "scripts/public-gltf-fixture.mjs",
  "scripts/public-e57-fixture.mjs",
  "scripts/public-las-laz-fixture.mjs",
  "scripts/e57-envelope-probe.mjs",
  "scripts/las-header-probe.mjs",
  "scripts/las-laz-point-probe.mjs",
  "scripts/las-point-range.mjs",
  "scripts/package-vscode-extension.mjs",
  "scripts/qualify-bim-product-shell.mjs",
  "scripts/qualify-bim-federation.mjs",
  "scripts/qualify-bim-federation-product-scale.mjs",
  "scripts/qualify-e57-public-sample.mjs",
  "scripts/qualify-las-laz-public-sample.mjs",
  "scripts/qualify-las-laz-browser-worker.mjs",
  "scripts/qualify-las-laz-point-renderer.mjs",
  "scripts/qualify-gltf-reference-source.mjs",
  "scripts/qualify-gltf-browser-webgl2.mjs",
  "scripts/qualify-gltf-product-scale-reference.mjs",
  "scripts/qualify-gltf-product-surfaces.mjs",
  "scripts/qualify-community-release.mjs",
  "scripts/qualify-bim-model-source.mjs",
  "scripts/qualify-bim-source-metadata.mjs",
  "scripts/qualify-spatial-integration.mjs",
  "scripts/qualify-openbim-explorer.mjs",
  "scripts/qualify-public-bim-renderer-3d.mjs",
  "scripts/qualify-public-bim-model-source.mjs",
  "scripts/qualify-ifc-engine.mjs",
  "scripts/qualify-ifc-in-call-cancellation.mjs",
  "scripts/qualify-ifc-resource-exhaustion.mjs",
  "scripts/qualify-ifc-license-profile.mjs",
  "scripts/qualify-ifc-negative-corpus.mjs",
  "scripts/qualify-web-ifc-platform-package.mjs",
  "scripts/qualify-public-ifc-performance.mjs",
  "scripts/qualify-viewer-core-local.mjs",
  "scripts/qualify-viewer-core-release.mjs",
  "scripts/qualify-vscode-custom-editor.mjs",
  "scripts/qualify-vscode-vsix-install.mjs",
  "scripts/vscode-qualification-runtime.mjs",
  "scripts/serve-bim-explorer-web.mjs",
  "scripts/serve-bim-federation-browser-probe.mjs",
  "scripts/serve-browser-worker-probe.mjs",
  "scripts/serve-browser-gpu-probe.mjs",
  "scripts/serve-gltf-browser-probe.mjs",
  "scripts/serve-las-laz-worker-probe.mjs",
  "scripts/serve-las-laz-point-renderer-probe.mjs",
  "scripts/serve-semantic-explorer-probe.mjs",
  "specs/README.md",
  "specs/LICENSE",
  "specs/bim-source-artifact-v0.1.md",
  "specs/bim-source-artifact-v0.2.md",
  "specs/bim-federation-v0.1.md",
  "specs/reference-format-intake-v0.1.md",
  "specs/gltf-reference-source-v0.1.md",
  "specs/bim-renderer-3d-v0.1.md",
  "specs/bim-semantic-explorer-v0.1.md",
  "specs/bim-product-hosts-v0.1.md",
  "specs/bim-spatial-integration-v0.1.md",
  "specs/openbim-explorer-v0.1.md",
  "specs/ifc-engine-adapter-v0.2.md",
  "tests/README.md",
  "tests/architecture/product-boundary.test.mjs",
  "tests/compatibility/viewer-core.test.mjs",
  "tests/compatibility/bim-federation.test.mjs",
  "tests/compatibility/reference-format-probes.test.mjs",
  "tests/compatibility/bim-renderer-3d.test.mjs",
  "tests/compatibility/community-release.test.mjs",
  "tests/compatibility/bim-model-source.test.mjs",
  "tests/compatibility/bim-semantic-explorer.test.mjs",
  "tests/compatibility/bim-product-shells.test.mjs",
  "tests/compatibility/gltf-product-platforms.test.mjs",
  "tests/compatibility/spatial-integration.test.mjs",
  "tests/compatibility/openbim-explorer.test.mjs",
  "tests/compatibility/viewer-core-consumer.test.mjs",
  "tests/compatibility/viewer-core-release.test.mjs",
  "tests/foundation/repository.test.mjs",
  "tests/federation/bim-federation.test.mjs",
  "tests/federation/bim-federation-qualification.test.mjs",
  "tests/federation/reference-format-intake.test.mjs",
  "tests/federation/e57-public-sample-probe.test.mjs",
  "tests/federation/las-laz-public-sample-probe.test.mjs",
  "tests/federation/las-laz-browser-worker.test.mjs",
  "tests/federation/las-laz-point-renderer.test.mjs",
  "tests/federation/federated-renderer-projection.test.mjs",
  "tests/federation/gltf-reference-federation.test.mjs",
  "tests/gltf/gltf-reference-source.test.mjs",
  "tests/gltf/gltf-browser-probe.test.mjs",
  "tests/gltf/public-gltf-fixture.test.mjs",
  "tests/ifc/bim-model-source.test.mjs",
  "tests/ifc/sha256.test.mjs",
  "tests/ifc/source-metadata.test.mjs",
  "tests/integration/spatial-integration.test.mjs",
  "tests/integration/spatial-qualification.test.mjs",
  "tests/openbim/openbim-explorer.test.mjs",
  "tests/openbim/openbim-qualification.test.mjs",
  "tests/ifc/engine-compatibility.test.mjs",
  "tests/ifc/engine-contract.test.mjs",
  "tests/ifc/browser-worker-probe.test.mjs",
  "tests/ifc/process-supervisor.test.mjs",
  "tests/ifc/platform-package.test.mjs",
  "tests/ifc/license-profile.test.mjs",
  "tests/ifc/public-ifc-fixture.test.mjs",
  "tests/ifc/qualification-harness.test.mjs",
  "tests/ifc/synthetic-fixture.test.mjs",
  "tests/ifc/web-ifc-adapter.test.mjs",
  "tests/renderer/bounded-3d-renderer.test.mjs",
  "tests/renderer/point-cloud-renderer.test.mjs",
  "tests/renderer/point-cloud-webgl2-backend.test.mjs",
  "tests/product/bim-explorer-web-server.test.mjs",
  "tests/product/reference-mesh-explorer.test.mjs",
  "tests/product/vscode-extension.test.mjs",
  "tests/product/worker-source-client.test.mjs",
  "tests/release/community-release.test.mjs",
  "tests/semantic/semantic-explorer-probe.test.mjs",
  "tests/semantic/semantic-explorer.test.mjs",
  "tests/vscode/driver-extension/extension.cjs",
  "tests/vscode/driver-extension/package.json",
  "tests/vscode/suite/index.cjs",
];
const FORBIDDEN_TRACKED_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/u,
  /(^|\/)(?:fixtures\/private|fixtures\/customer)(?:\/|$)/u,
  /\.(?:ifc|ifczip|ifcxml|gltf|glb|las|laz|e57|rvt|dgn|nwd|nwc|bim)$/iu,
  /(^|\/)__pycache__(?:\/|$)/u,
  /\.pyc$/iu,
  /(^|\/)(?:node_modules|coverage|dist|build|artifacts)(?:\/|$)/u,
];
const FORBIDDEN_LOCAL_DEPENDENCY_PREFIXES = [
  "file:",
  "link:",
  "workspace:",
];

const failures = [];
for (const relative of REQUIRED_PATHS) {
  try {
    const metadata = await stat(path.join(ROOT, relative));
    if (!metadata.isFile()) {
      failures.push(`${relative}: required path is not a file`);
    }
  } catch {
    failures.push(`${relative}: required file is missing`);
  }
}

const PACKAGE_MANIFESTS = [
  "package.json",
  "adapters/web-ifc/package.json",
  "apps/bim-explorer-vscode/package.json",
  "tests/vscode/driver-extension/package.json",
  "packages/bim-model-source/package.json",
  "packages/bim-federation/package.json",
  "packages/gltf-reference-source/package.json",
  "packages/bim-renderer-3d/package.json",
  "packages/bim-semantic-explorer/package.json",
  "packages/spatial-integration/package.json",
  "packages/openbim-explorer/package.json",
  "packages/ifc-engine-contract/package.json",
  "packages/viewer-core-consumer/package.json",
  "packaging/web-ifc-platform-stage/package.json",
];
for (const manifestPath of PACKAGE_MANIFESTS) {
  const packageJson = JSON.parse(
    await readFile(path.join(ROOT, manifestPath), "utf8"),
  );
  if (packageJson.private !== true) {
    failures.push(
      `${manifestPath}: npm publication must remain disabled`,
    );
  }
  if (packageJson.license !== "MPL-2.0") {
    failures.push(
      `${manifestPath}: first-party package must declare MPL-2.0`,
    );
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, version] of Object.entries(packageJson[field] ?? {})) {
      if (
        FORBIDDEN_LOCAL_DEPENDENCY_PREFIXES.some(
          (prefix) => String(version).startsWith(prefix),
        )
      ) {
        failures.push(
          `${manifestPath}: ${field}.${name} uses forbidden local ` +
            `dependency ${version}`,
        );
      }
    }
  }
}

const lockfile = JSON.parse(
  await readFile(path.join(ROOT, "package-lock.json"), "utf8"),
);
const webIfcLock = lockfile.packages?.["node_modules/web-ifc"];
if (
  webIfcLock?.version !== "0.0.77" ||
  typeof webIfcLock.integrity !== "string" ||
  !webIfcLock.integrity.startsWith("sha512-")
) {
  failures.push(
    "package-lock.json: web-ifc 0.0.77 requires exact registry integrity",
  );
}
for (const [name, version] of [
  ["fflate", "0.8.3"],
  ["saxes", "6.0.0"],
]) {
  const dependency = lockfile.packages?.[`node_modules/${name}`];
  if (
    dependency?.version !== version ||
    typeof dependency.integrity !== "string" ||
    !dependency.integrity.startsWith("sha512-")
  ) {
    failures.push(
      `package-lock.json: ${name} ${version} requires ` +
        "exact registry integrity",
    );
  }
}

const lazPerfLock = lockfile.packages?.["node_modules/laz-perf"];
if (
  lazPerfLock?.version !== "0.0.6" ||
  lazPerfLock.integrity !==
    "sha512-ZBqC+BBlofznDIY3SfjXDBVdIhYfz7bq8HAHztlw4XOnu++n" +
      "HiWtCGPgzpdeAhPkByc68DaKNy3E3rY4XrdRtQ==" ||
  lazPerfLock.license !== "Apache-2.0" ||
  lazPerfLock.dev !== true
) {
  failures.push(
    "package-lock.json: laz-perf 0.0.6 qualification dependency " +
      "requires exact registry integrity and Apache-2.0 metadata",
  );
}

const git = spawnSync("git", ["ls-files", "-z"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (git.status !== 0) {
  failures.push(`git ls-files failed: ${git.stderr.trim()}`);
} else {
  const tracked = git.stdout.split("\u0000").filter(Boolean);
  for (const file of tracked) {
    if (FORBIDDEN_TRACKED_PATTERNS.some((pattern) => pattern.test(file))) {
      failures.push(`${file}: forbidden sensitive/generated artifact is tracked`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Repository check passed: ${REQUIRED_PATHS.length} required files`,
  );
}
