import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function files(directory) {
  const entries = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    if (!entry.isFile()) {
      throw new Error("release bundle must contain only regular files");
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
      throw new Error("SHA256SUMS is malformed");
    }
    observed.set(match[2], match[1]);
  }
  const expectedNames = names.filter((name) => name !== "SHA256SUMS");
  if (
    JSON.stringify([...observed.keys()].sort()) !==
    JSON.stringify(expectedNames)
  ) {
    throw new Error("SHA256SUMS inventory differs from release files");
  }
  for (const [name, expected] of observed) {
    const content = await readFile(path.join(directory, name));
    if (sha256(content) !== expected) {
      throw new Error(`${name} does not match SHA256SUMS`);
    }
  }
}

export async function compareCommunityReleases(left, right) {
  const leftNames = await files(left);
  const rightNames = await files(right);
  if (JSON.stringify(leftNames) !== JSON.stringify(rightNames)) {
    throw new Error("release bundle inventories differ");
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
    const rightDigest = sha256(rightBytes);
    if (leftDigest !== rightDigest) {
      throw new Error(`${name} differs across release builds`);
    }
    artifacts.push({
      file: name,
      byteLength: leftBytes.byteLength,
      sha256: leftDigest,
    });
  }
  const manifest = JSON.parse(
    await readFile(
      path.join(left, "release-manifest.json"),
      "utf8",
    ),
  );
  if (
    manifest.schema !== "bim-explorer-community-release/1" ||
    manifest.source?.cleanTree !== true ||
    manifest.profile?.nativeWrite !== false ||
    manifest.profile?.accountRequired !== false ||
    manifest.privacyReview?.noCustomerOrModelArtifacts !== true ||
    manifest.privacyReview?.noCredentialPatternFiles !== true
  ) {
    throw new Error("release manifest boundary is invalid");
  }
  for (const required of [
    `bim-explorer-${manifest.product.version}.vsix`,
    `bim-explorer-${manifest.product.version}-source.tar.gz`,
    `bim-explorer-${manifest.product.version}.spdx.json`,
    `bim-explorer-${manifest.product.version}-source.spdx.json`,
    "LICENSE",
    "SOURCE_OFFER.md",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    if (!leftNames.includes(required)) {
      throw new Error(`release bundle is missing ${required}`);
    }
  }
  return Object.freeze({
    schema: "bim-explorer-community-release-reproducibility/1",
    version: manifest.product.version,
    commit: manifest.source.commit,
    files: artifacts.length,
    byteIdentical: true,
    checksumsVerified: true,
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
      "usage: node scripts/compare-community-release.mjs " +
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
  const [left, right] = parseArguments(
    process.argv.slice(2),
  );
  for (const directory of [left, right]) {
    if (!(await stat(directory)).isDirectory()) {
      throw new TypeError("release comparison input is not a directory");
    }
  }
  const report = await compareCommunityReleases(left, right);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
