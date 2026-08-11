import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const VERSION = "0.2.0";
const REQUIRED_FILES = Object.freeze([
  "LICENSE",
  "NOTICE",
  "RELEASE_NOTES.md",
  "SHA256SUMS",
  "SOURCE_OFFER.md",
  "TRADEMARKS.md",
  `bim-explorer-federated-bim-surface-${VERSION}.spdx.json`,
  `bim-explorer-federated-bim-surface-${VERSION}.tgz`,
  "release-manifest.json",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function files(directory) {
  const entries = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    if (!entry.isFile()) {
      throw new Error(
        "Federated BIM surface release must contain only regular files",
      );
    }
    entries.push(entry.name);
  }
  return entries.sort();
}

async function verifyChecksums(directory, names) {
  const checksumText = await readFile(
    path.join(directory, "SHA256SUMS"),
    "utf8",
  );
  const observed = new Map();
  for (const line of checksumText.trimEnd().split("\n")) {
    const match = /^([a-f0-9]{64}) {2}([^/]+)$/u.exec(line);
    if (match === null || observed.has(match[2])) {
      throw new Error(
        "Federated BIM surface SHA256SUMS is malformed",
      );
    }
    observed.set(match[2], match[1]);
  }
  const expected = names.filter((name) => name !== "SHA256SUMS");
  if (
    JSON.stringify([...observed.keys()].sort()) !==
    JSON.stringify(expected)
  ) {
    throw new Error(
      "Federated BIM surface checksum inventory differs",
    );
  }
  for (const [name, digest] of observed) {
    const content = await readFile(path.join(directory, name));
    if (sha256(content) !== digest) {
      throw new Error(`${name} does not match SHA256SUMS`);
    }
  }
}

function validateManifest(manifest) {
  if (
    manifest.schema !==
      "bim-explorer-federated-bim-surface-release/1" ||
    manifest.package?.name !==
      "@bim-explorer/federated-bim-surface" ||
    manifest.package.version !== VERSION ||
    manifest.package.contract !==
      "bim-explorer-bim-surface/0.2" ||
    manifest.package.runtimeDependencies !== 0 ||
    manifest.package.repositoryManifestPrivate !== true ||
    manifest.source?.branch !== "prerelease" ||
    manifest.source.expectedTag !== `bim-surface-v${VERSION}` ||
    manifest.source.cleanTree !== true ||
    manifest.profile?.status !==
      "experimental-read-only-release-ready-candidate" ||
    manifest.profile.nativeWrite !== false ||
    manifest.profile.coniSpatialAuthority !== false ||
    manifest.profile.vscodeExtensionIncluded !== false ||
    manifest.profile.marketplacePublication !== false ||
    manifest.qualification?.status !==
      "passed-release-ready-candidate-consumer-revalidated" ||
    manifest.qualification.byteIdentical !== true ||
    manifest.qualification.offlineCleanInstall !== true ||
    !/^[0-9a-f]{64}$/u.test(
      manifest.qualification.packageSha256 ?? "",
    ) ||
    !/^sha512-[A-Za-z0-9+/]+=*$/u.test(
      manifest.qualification.packageIntegrity ?? "",
    ) ||
    manifest.releaseGate?.actualSpatialConsumer !== true ||
    manifest.releaseGate.releaseReadyPackageConsumerRevalidation !==
      true ||
    manifest.releaseGate.publicRelease !== false ||
    manifest.releaseGate.publicationAuthorized !== true ||
    manifest.postReleaseGate?.publicArtifactSpatialAdmission !== false ||
    manifest.postReleaseGate.productionSupport !== false ||
    Object.values(manifest.authority ?? {}).some(Boolean)
  ) {
    throw new Error(
      "Federated BIM surface release manifest is invalid",
    );
  }
  return manifest;
}

export async function compareFederatedBimSurfaceReleases(
  left,
  right,
) {
  const [leftNames, rightNames] = await Promise.all([
    files(left),
    files(right),
  ]);
  if (
    JSON.stringify(leftNames) !== JSON.stringify(REQUIRED_FILES) ||
    JSON.stringify(rightNames) !== JSON.stringify(REQUIRED_FILES)
  ) {
    throw new Error(
      "Federated BIM surface release inventory is invalid",
    );
  }
  await Promise.all([
    verifyChecksums(left, leftNames),
    verifyChecksums(right, rightNames),
  ]);
  const artifacts = [];
  for (const name of leftNames) {
    const [leftBytes, rightBytes] = await Promise.all([
      readFile(path.join(left, name)),
      readFile(path.join(right, name)),
    ]);
    const leftDigest = sha256(leftBytes);
    if (leftDigest !== sha256(rightBytes)) {
      throw new Error(`${name} differs across release builds`);
    }
    artifacts.push({
      file: name,
      byteLength: leftBytes.byteLength,
      sha256: leftDigest,
    });
  }
  const manifest = validateManifest(JSON.parse(await readFile(
    path.join(left, "release-manifest.json"),
    "utf8",
  )));
  return Object.freeze({
    schema:
      "bim-explorer-federated-bim-surface-release-reproducibility/1",
    version: manifest.package.version,
    tag: manifest.source.expectedTag,
    branch: manifest.source.branch,
    commit: manifest.source.commit,
    files: artifacts.length,
    byteIdentical: true,
    checksumsVerified: true,
    publicationAuthorized:
      manifest.releaseGate.publicationAuthorized,
    packageSha256: manifest.qualification.packageSha256,
    artifacts,
  });
}

function parseArguments(values) {
  if (
    values.length !== 4 ||
    values[0] !== "--left" ||
    values[2] !== "--right"
  ) {
    throw new TypeError(
      "usage: node scripts/compare-federated-bim-surface-release.mjs " +
        "--left <directory> --right <directory>",
    );
  }
  return [
    path.resolve(ROOT, values[1]),
    path.resolve(ROOT, values[3]),
  ];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [left, right] = parseArguments(process.argv.slice(2));
  for (const directory of [left, right]) {
    if (!(await stat(directory)).isDirectory()) {
      throw new TypeError(
        "Federated release comparison input is not a directory",
      );
    }
  }
  const report = await compareFederatedBimSurfaceReleases(
    left,
    right,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
