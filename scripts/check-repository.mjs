import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const REQUIRED_PATHS = [
  ".github/workflows/ci.yml",
  ".gitignore",
  ".node-version",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "adapters/README.md",
  "adapters/ifcopenshell/README.md",
  "adapters/ifcopenshell/THIRD_PARTY_NOTICES.md",
  "adapters/ifcopenshell/qualify.py",
  "adapters/web-ifc/README.md",
  "adapters/web-ifc/THIRD_PARTY_NOTICES.md",
  "adapters/web-ifc/package.json",
  "adapters/web-ifc/src/create-source-artifact.mjs",
  "adapters/web-ifc/src/inspect.mjs",
  "adapters/web-ifc/src/measure-performance.mjs",
  "apps/README.md",
  "apps/browser-worker-probe/README.md",
  "apps/browser-worker-probe/app.mjs",
  "apps/browser-worker-probe/ifc-worker.mjs",
  "apps/browser-worker-probe/index.html",
  "apps/browser-worker-probe/performance-budget.mjs",
  "apps/browser-worker-probe/source-session.mjs",
  "apps/browser-worker-probe/styles.css",
  "apps/browser-worker-probe/worker-client.mjs",
  "compatibility/README.md",
  "compatibility/bim-model-source.json",
  "compatibility/evidence/bim-model-source-synthetic-mapped-2026-08-03.json",
  "compatibility/evidence/ifc-engine-synthetic-mapped-2026-08-03.json",
  "compatibility/evidence/ifc-engine-synthetic-small-2026-08-03.json",
  "compatibility/evidence/viewer-core-local-probe-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-checkpoint-cancellation-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-bounded-performance-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-local-file-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-public-representative-performance-2026-08-03.json",
  "compatibility/evidence/web-ifc-browser-worker-smoke-2026-08-03.json",
  "compatibility/evidence/web-ifc-public-representative-node-performance-2026-08-03.json",
  "compatibility/ifc-engines.json",
  "compatibility/viewer-core.json",
  "docs/README.md",
  "docs/adr/ADR-0001-independent-product-boundary.md",
  "docs/adr/ADR-0002-viewer-core-consumer-admission.md",
  "docs/decision-register.md",
  "docs/ifc-engine-qualification.md",
  "docs/open-source-commercial-boundary.md",
  "docs/product-boundary.md",
  "docs/system-architecture.md",
  "fixtures/README.md",
  "fixtures/ifc/synthetic-mapped/manifest.json",
  "fixtures/ifc/synthetic-performance/manifest.json",
  "fixtures/ifc/synthetic-small/manifest.json",
  "fixtures/ifc/public-schependomlaan/manifest.json",
  "package-lock.json",
  "package.json",
  "packages/README.md",
  "packages/bim-model-source/README.md",
  "packages/bim-model-source/package.json",
  "packages/bim-model-source/src/index.mjs",
  "packages/ifc-engine-contract/README.md",
  "packages/ifc-engine-contract/package.json",
  "packages/ifc-engine-contract/src/index.mjs",
  "packages/ifc-engine-contract/src/process-supervisor.mjs",
  "packages/viewer-core-consumer/README.md",
  "packages/viewer-core-consumer/package.json",
  "packages/viewer-core-consumer/src/bim-mock-delta-source.mjs",
  "packages/viewer-core-consumer/src/bim-mock-source.mjs",
  "packages/viewer-core-consumer/src/index.mjs",
  "packages/viewer-core-consumer/src/mock-3d-presentation.mjs",
  "packages/viewer-core-consumer/src/mock-host.mjs",
  "scripts/check-bim-model-source-compatibility.mjs",
  "scripts/check-docs.mjs",
  "scripts/check-ifc-engine-compatibility.mjs",
  "scripts/check-repository.mjs",
  "scripts/check-text.mjs",
  "scripts/check-viewer-core-compatibility.mjs",
  "scripts/fetch-public-ifc-fixture.mjs",
  "scripts/generate-synthetic-ifc.mjs",
  "scripts/public-ifc-fixture.mjs",
  "scripts/qualify-bim-model-source.mjs",
  "scripts/qualify-ifc-engine.mjs",
  "scripts/qualify-public-ifc-performance.mjs",
  "scripts/qualify-viewer-core-local.mjs",
  "scripts/serve-browser-worker-probe.mjs",
  "specs/README.md",
  "specs/bim-source-artifact-v0.1.md",
  "specs/ifc-engine-adapter-v0.2.md",
  "tests/README.md",
  "tests/architecture/product-boundary.test.mjs",
  "tests/compatibility/viewer-core.test.mjs",
  "tests/compatibility/bim-model-source.test.mjs",
  "tests/compatibility/viewer-core-consumer.test.mjs",
  "tests/foundation/repository.test.mjs",
  "tests/ifc/bim-model-source.test.mjs",
  "tests/ifc/engine-compatibility.test.mjs",
  "tests/ifc/engine-contract.test.mjs",
  "tests/ifc/browser-worker-probe.test.mjs",
  "tests/ifc/process-supervisor.test.mjs",
  "tests/ifc/public-ifc-fixture.test.mjs",
  "tests/ifc/qualification-harness.test.mjs",
  "tests/ifc/synthetic-fixture.test.mjs",
  "tests/ifc/web-ifc-adapter.test.mjs"
];
const FORBIDDEN_TRACKED_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/u,
  /(^|\/)(?:fixtures\/private|fixtures\/customer)(?:\/|$)/u,
  /\.(?:ifc|ifczip|ifcxml|rvt|nwd|nwc|bim)$/iu,
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
  "packages/bim-model-source/package.json",
  "packages/ifc-engine-contract/package.json",
  "packages/viewer-core-consumer/package.json",
];
for (const manifestPath of PACKAGE_MANIFESTS) {
  const packageJson = JSON.parse(
    await readFile(path.join(ROOT, manifestPath), "utf8"),
  );
  if (packageJson.private !== true) {
    failures.push(
      `${manifestPath}: package must remain private before release Gate`,
    );
  }
  if (packageJson.license !== "UNLICENSED") {
    failures.push(
      `${manifestPath}: license must remain UNLICENSED before legal release Gate`,
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
