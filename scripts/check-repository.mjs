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
  "apps/README.md",
  "compatibility/README.md",
  "compatibility/viewer-core.json",
  "docs/README.md",
  "docs/adr/ADR-0001-independent-product-boundary.md",
  "docs/adr/ADR-0002-viewer-core-consumer-admission.md",
  "docs/decision-register.md",
  "docs/open-source-commercial-boundary.md",
  "docs/product-boundary.md",
  "docs/system-architecture.md",
  "package-lock.json",
  "package.json",
  "packages/README.md",
  "scripts/check-docs.mjs",
  "scripts/check-repository.mjs",
  "scripts/check-text.mjs",
  "scripts/check-viewer-core-compatibility.mjs",
  "specs/README.md",
  "tests/README.md",
  "tests/architecture/product-boundary.test.mjs",
  "tests/compatibility/viewer-core.test.mjs",
  "tests/foundation/repository.test.mjs"
];
const FORBIDDEN_TRACKED_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/u,
  /(^|\/)(?:fixtures\/private|fixtures\/customer)(?:\/|$)/u,
  /\.(?:ifc|ifczip|ifcxml|rvt|nwd|nwc|bim)$/iu,
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

const packageJson = JSON.parse(
  await readFile(path.join(ROOT, "package.json"), "utf8"),
);
if (packageJson.private !== true) {
  failures.push("package.json: root must remain private before release Gate");
}
if (packageJson.license !== "UNLICENSED") {
  failures.push(
    "package.json: license must remain UNLICENSED before legal release Gate",
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
        `package.json: ${field}.${name} uses forbidden local dependency ${version}`,
      );
    }
  }
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
