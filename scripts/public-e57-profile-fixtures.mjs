import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PUBLIC_E57_PROFILE_FIXTURES_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "e57",
  "public-libe57-bunny-profiles",
  "manifest.json",
);
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const EXPECTED_ENTRIES = new Map([
  [
    "libe57format-bunny-double-e57",
    Object.freeze({
      name: "bunnyDouble.e57",
      path: "reference/bunnyDouble.e57",
      byteLength: 743_424,
      sha256:
        "5ec10af7a8b4cf7778d247ea20b2c305" +
        "8e6488b55ef102ae187373d5cbe8b056",
    }),
  ],
  [
    "libe57format-bunny-scaled-integer-e57",
    Object.freeze({
      name: "bunnyInt32.e57",
      path: "reference/bunnyInt32.e57",
      byteLength: 374_784,
      sha256:
        "6b3696c452a2dd0e325ab30b1ad28a40" +
        "de87f1a56cd9d8a24ad81389b606c205",
    }),
  ],
]);

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...expected].sort())
  ) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validExpectedProfile(expected) {
  const profile = plainRecord(expected, "public E57 expected profile");
  exactKeys(profile, [
    "formatVersion",
    "pageSize",
    "pages",
    "xmlPhysicalOffset",
    "xmlLogicalLength",
    "sourcePointRecords",
    "pointRecords",
    "directionPointRecords",
    "invalidPointRecords",
    "decodedPointBytes",
    "prototype",
    "bounds",
    "firstPoint",
    "lastPoint",
    "positionFloat64LeSha256",
    "dataPackets",
    "indexPackets",
    "sectionLength",
    "pointRangeByteLength",
    "pointRangePayloadBytes",
    "pointRangeSha256",
  ], "public E57 expected profile");
  return (
    profile.formatVersion === "1.0" &&
    profile.pageSize === 1_024 &&
    Number.isSafeInteger(profile.pages) &&
    profile.pages > 0 &&
    Number.isSafeInteger(profile.xmlPhysicalOffset) &&
    Number.isSafeInteger(profile.xmlLogicalLength) &&
    profile.sourcePointRecords === 30_571 &&
    profile.pointRecords === 30_571 &&
    profile.directionPointRecords === 0 &&
    profile.invalidPointRecords === 0 &&
    profile.decodedPointBytes === 886_559 &&
    Array.isArray(profile.prototype) &&
    profile.prototype.length === 4 &&
    profile.prototype[3]?.name === "cartesianInvalidState" &&
    profile.prototype[3].kind === "integer" &&
    profile.prototype[3].minimum === 0 &&
    profile.prototype[3].maximum === 1 &&
    Array.isArray(profile.bounds?.min) &&
    profile.bounds.min.length === 3 &&
    Array.isArray(profile.bounds?.max) &&
    profile.bounds.max.length === 3 &&
    Array.isArray(profile.firstPoint) &&
    profile.firstPoint.length === 3 &&
    Array.isArray(profile.lastPoint) &&
    profile.lastPoint.length === 3 &&
    SHA256.test(profile.positionFloat64LeSha256 ?? "") &&
    Number.isSafeInteger(profile.dataPackets) &&
    profile.dataPackets > 0 &&
    profile.indexPackets === 0 &&
    Number.isSafeInteger(profile.sectionLength) &&
    profile.sectionLength > 32 &&
    profile.pointRangeByteLength === 489_184 &&
    profile.pointRangePayloadBytes === 489_136 &&
    SHA256.test(profile.pointRangeSha256 ?? "")
  );
}

function validateManifest(value) {
  const manifest = plainRecord(
    value,
    "public E57 profile fixture manifest",
  );
  exactKeys(manifest, [
    "schema",
    "fixtureSetId",
    "format",
    "purpose",
    "provenance",
    "license",
    "tracking",
    "referenceDecoder",
    "entries",
  ], "public E57 profile fixture manifest");
  const provenance = plainRecord(manifest.provenance, "provenance");
  const license = plainRecord(manifest.license, "license");
  const tracking = plainRecord(manifest.tracking, "tracking");
  const reference = plainRecord(
    manifest.referenceDecoder,
    "reference decoder",
  );
  if (
    manifest.schema !==
      "bim-explorer-public-e57-profile-fixtures/1" ||
    manifest.fixtureSetId !==
      "libe57format-bunny-coordinate-profiles" ||
    manifest.format !== "e57" ||
    typeof manifest.purpose !== "string" ||
    manifest.purpose.length === 0 ||
    provenance.repository !==
      "https://github.com/asmaloney/libE57Format-test-data" ||
    provenance.commit !==
      "1ca737e03d6277c384f1b05c4046e10caab331b5" ||
    !COMMIT.test(provenance.commit) ||
    provenance.committedAt !== "2026-08-04T16:42:49Z" ||
    license.identifier !== "LicenseRef-E57-Test-Data" ||
    license.url !==
      "https://github.com/asmaloney/libE57Format-test-data/blob/" +
        `${provenance.commit}/README.md#licensing` ||
    license.scope !== "reference directory test data" ||
    tracking.cacheRoot !==
      ".bim-explorer-cache/public-reference/e57" ||
    tracking.artifactTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.testOnly !== true ||
    tracking.networkAtRuntime !== false ||
    reference.id !== "pye57" ||
    reference.version !== "0.4.19" ||
    reference.repository !==
      "https://github.com/davidcaron/pye57" ||
    reference.commit !==
      "64c9000738ad54242e87e1da6bca6b683b13374b" ||
    reference.libE57FormatCommit !==
      "1914b8ea972251d3bb49a33828497dde683205d9" ||
    reference.license !== "MIT" ||
    reference.positionEncoding !==
      "record-major-cartesian-xyz-float64-little-endian" ||
    reference.runtimeBundled !== false ||
    reference.usedForExpectedResultsOnly !== true ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length !== EXPECTED_ENTRIES.size
  ) {
    throw new Error("public E57 profile fixture manifest is invalid");
  }
  const ids = new Set();
  for (const entryValue of manifest.entries) {
    const entry = plainRecord(entryValue, "public E57 profile entry");
    exactKeys(entry, [
      "fixtureId",
      "name",
      "path",
      "sourcePage",
      "rawUrl",
      "mediaType",
      "byteLength",
      "sha256",
      "expected",
    ], "public E57 profile entry");
    const pinned = EXPECTED_ENTRIES.get(entry.fixtureId);
    const sourcePage =
      `${provenance.repository}/blob/${provenance.commit}/` +
      entry.path;
    const rawUrl =
      "https://raw.githubusercontent.com/asmaloney/" +
      `libE57Format-test-data/${provenance.commit}/${entry.path}`;
    if (
      pinned === undefined ||
      ids.has(entry.fixtureId) ||
      entry.name !== pinned.name ||
      entry.path !== pinned.path ||
      entry.sourcePage !== sourcePage ||
      entry.rawUrl !== rawUrl ||
      entry.mediaType !== "application/octet-stream" ||
      entry.byteLength !== pinned.byteLength ||
      entry.sha256 !== pinned.sha256 ||
      !validExpectedProfile(entry.expected)
    ) {
      throw new Error("public E57 profile fixture entry is invalid");
    }
    ids.add(entry.fixtureId);
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicE57ProfileFixturesManifest(
  manifestPath = PUBLIC_E57_PROFILE_FIXTURES_MANIFEST,
) {
  return validateManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
}

async function verifiedCache(cachePath, entry) {
  try {
    const bytes = new Uint8Array(await readFile(cachePath));
    if (
      bytes.byteLength === entry.byteLength &&
      sha256(bytes) === entry.sha256
    ) {
      return bytes;
    }
    bytes.fill(0);
    return null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function acquireEntry(entry, manifest, options) {
  const root = options.cacheRoot ?? path.join(
    ROOT,
    manifest.tracking.cacheRoot,
  );
  const cachePath = path.join(root, `${entry.sha256}.e57`);
  if (!options.force) {
    const cached = await verifiedCache(cachePath, entry);
    if (cached !== null) {
      return {
        entry,
        bytes: cached,
        cachePath,
        cacheHit: true,
      };
    }
  }
  const response = await options.fetchImpl(entry.rawUrl, {
    redirect: "follow",
  });
  if (!response?.ok || typeof response.arrayBuffer !== "function") {
    throw new Error(`public E57 ${entry.name} download failed`);
  }
  const contentLength = response.headers?.get?.("content-length");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    Number(contentLength) !== entry.byteLength
  ) {
    throw new RangeError(
      `public E57 ${entry.name} Content-Length is invalid`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== entry.byteLength ||
    sha256(bytes) !== entry.sha256
  ) {
    bytes.fill(0);
    throw new Error(`public E57 ${entry.name} digest is invalid`);
  }
  await mkdir(root, { recursive: true });
  const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, bytes, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, cachePath);
  } finally {
    await rm(temporary, { force: true });
  }
  return {
    entry,
    bytes,
    cachePath,
    cacheHit: false,
  };
}

export async function acquirePublicE57ProfileFixtures({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  manifestPath = PUBLIC_E57_PROFILE_FIXTURES_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("public E57 profile acquisition requires fetch");
  }
  const manifest = await loadPublicE57ProfileFixturesManifest(
    manifestPath,
  );
  const fixtures = await Promise.all(manifest.entries.map((entry) =>
    acquireEntry(entry, manifest, {
      cacheRoot,
      fetchImpl,
      force,
    })));
  return Object.freeze({
    manifest,
    fixtures: Object.freeze(fixtures.map((fixture) => ({
      ...fixture,
      receipt: Object.freeze({
        schema: "bim-explorer-public-e57-profile-acquisition/1",
        fixtureId: fixture.entry.fixtureId,
        byteLength: fixture.bytes.byteLength,
        sha256: fixture.entry.sha256,
        cacheHit: fixture.cacheHit,
        artifactTracked: false,
        releaseBundled: false,
        testOnly: true,
      }),
    }))),
  });
}
