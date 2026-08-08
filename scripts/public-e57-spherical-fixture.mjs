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
export const PUBLIC_E57_SPHERICAL_FIXTURE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "e57",
  "public-e57-example-spherical",
  "manifest.json",
);

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const EXPECTED_SHA256 =
  "268b42e69bbbad85703933f24626b9773" +
  "6ec703b0a7c34550dcb6ed0830317e3";

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

function validExpected(expected) {
  const value = plainRecord(expected, "public E57 spherical expected");
  exactKeys(value, [
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
    "coordinateRepresentation",
    "prototype",
    "bounds",
    "firstPoint",
    "lastPoint",
    "firstColor",
    "lastColor",
    "colorRange",
    "rawSphericalFloat64LeSha256",
    "referencePositionFloat64LeSha256",
    "projectedPositionFloat64LeSha256",
    "positionNanometerInt64LeSha256",
    "validRgbSha256",
    "dataPackets",
    "indexPackets",
    "sectionLength",
    "pointRangeByteLength",
    "pointRangePayloadBytes",
    "pointRangeSha256",
  ], "public E57 spherical expected");
  return (
    value.formatVersion === "1.0" &&
    value.pageSize === 1_024 &&
    value.pages === 5_047 &&
    value.xmlPhysicalOffset === 5_163_876 &&
    value.xmlLogicalLength === 3_988 &&
    value.sourcePointRecords === 370_530 &&
    value.pointRecords === 155_201 &&
    value.directionPointRecords === 0 &&
    value.invalidPointRecords === 215_329 &&
    value.decodedPointBytes === 10_745_370 &&
    value.coordinateRepresentation === "spherical" &&
    Array.isArray(value.prototype) &&
    value.prototype.length === 8 &&
    value.prototype[0]?.name === "sphericalRange" &&
    value.prototype[1]?.name === "sphericalAzimuth" &&
    value.prototype[2]?.name === "sphericalElevation" &&
    value.prototype[3]?.name === "intensity" &&
    value.prototype[7]?.name === "sphericalInvalidState" &&
    Array.isArray(value.bounds?.min) &&
    value.bounds.min.length === 3 &&
    Array.isArray(value.bounds?.max) &&
    value.bounds.max.length === 3 &&
    Array.isArray(value.firstPoint) &&
    value.firstPoint.length === 3 &&
    Array.isArray(value.lastPoint) &&
    value.lastPoint.length === 3 &&
    Array.isArray(value.firstColor) &&
    value.firstColor.length === 3 &&
    Array.isArray(value.lastColor) &&
    value.lastColor.length === 3 &&
    Object.keys(value)
      .filter((name) => name.endsWith("Sha256"))
      .every((name) => SHA256.test(value[name])) &&
    value.dataPackets === 104 &&
    value.indexPackets === 0 &&
    value.sectionLength === 5_143_660 &&
    value.pointRangeByteLength === 2_483_264 &&
    value.pointRangePayloadBytes === 2_483_216
  );
}

function validateManifest(value) {
  const manifest = plainRecord(
    value,
    "public E57 spherical manifest",
  );
  exactKeys(manifest, [
    "schema",
    "fixtureId",
    "format",
    "purpose",
    "provenance",
    "license",
    "tracking",
    "referenceDecoder",
    "entry",
    "expected",
  ], "public E57 spherical manifest");
  const provenance = plainRecord(manifest.provenance, "provenance");
  const license = plainRecord(manifest.license, "license");
  const tracking = plainRecord(manifest.tracking, "tracking");
  const reference = plainRecord(
    manifest.referenceDecoder,
    "reference decoder",
  );
  const entry = plainRecord(manifest.entry, "entry");
  if (
    manifest.schema !==
      "bim-explorer-public-e57-spherical-fixture/1" ||
    manifest.fixtureId !== "e57-example-pump-a-spherical" ||
    manifest.format !== "e57" ||
    typeof manifest.purpose !== "string" ||
    manifest.purpose.length === 0 ||
    provenance.repository !==
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/" ||
    provenance.sourcePage !==
      "https://e57-3d-imgfmt.sourceforge.net/data.html" ||
    provenance.downloadPage !==
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/pumpASpherical.e57/download" ||
    provenance.publishedAt !== "2011-05-04T23:26:44Z" ||
    license.identifier !== "LicenseRef-E57-Example-Test-Data" ||
    license.notice !==
      "Copyright 2008 Carnahan-Proctor and Cross, Inc." ||
    license.scope !== "test-only remote sample; no redistribution" ||
    tracking.cacheRoot !==
      ".bim-explorer-cache/public-reference/e57" ||
    tracking.artifactTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.testOnly !== true ||
    tracking.networkAtRuntime !== false ||
    reference.id !== "pye57" ||
    reference.version !== "0.4.18" ||
    reference.repository !== "https://github.com/davidcaron/pye57" ||
    reference.commit !==
      "46713644bf28cffad721724c41d248b70eb697b5" ||
    !COMMIT.test(reference.commit) ||
    reference.libE57FormatCommit !==
      "1914b8ea972251d3bb49a33828497dde683205d9" ||
    reference.license !== "MIT" ||
    reference.positionEncoding !==
      "record-major-cartesian-xyz-float64-little-endian" ||
    reference.parityEncoding !==
      "record-major-cartesian-xyz-nanometer-int64-little-endian" ||
    reference.runtimeBundled !== false ||
    reference.usedForExpectedResultsOnly !== true ||
    entry.name !== "pumpASpherical.e57" ||
    entry.rawUrl !==
      "https://downloads.sourceforge.net/project/" +
        "e57-3d-imgfmt/E57Example-data/pumpASpherical.e57" ||
    entry.mediaType !== "application/octet-stream" ||
    entry.byteLength !== 5_168_128 ||
    entry.sha256 !== EXPECTED_SHA256 ||
    !validExpected(manifest.expected)
  ) {
    throw new Error("public E57 spherical manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicE57SphericalFixtureManifest(
  manifestPath = PUBLIC_E57_SPHERICAL_FIXTURE_MANIFEST,
) {
  return validateManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
}

async function verifiedCache(cachePath, manifest) {
  try {
    const bytes = new Uint8Array(await readFile(cachePath));
    if (
      bytes.byteLength === manifest.entry.byteLength &&
      sha256(bytes) === manifest.entry.sha256
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

export async function acquirePublicE57SphericalFixture({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  manifestPath = PUBLIC_E57_SPHERICAL_FIXTURE_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("public E57 spherical acquisition requires fetch");
  }
  const manifest = await loadPublicE57SphericalFixtureManifest(
    manifestPath,
  );
  const root = cacheRoot ?? path.join(ROOT, manifest.tracking.cacheRoot);
  const cachePath = path.join(root, `${manifest.entry.sha256}.e57`);
  if (!force) {
    const cached = await verifiedCache(cachePath, manifest);
    if (cached !== null) {
      return {
        manifest,
        bytes: cached,
        cachePath,
        receipt: Object.freeze({
          schema: "bim-explorer-public-e57-spherical-acquisition/1",
          fixtureId: manifest.fixtureId,
          byteLength: cached.byteLength,
          sha256: manifest.entry.sha256,
          cacheHit: true,
          artifactTracked: false,
          releaseBundled: false,
          testOnly: true,
        }),
      };
    }
  }
  const response = await fetchImpl(manifest.entry.rawUrl, {
    redirect: "follow",
  });
  if (
    response === null ||
    response.ok !== true ||
    typeof response.arrayBuffer !== "function"
  ) {
    throw new Error("public E57 spherical download failed");
  }
  const contentLength = response.headers?.get?.("content-length");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    Number(contentLength) !== manifest.entry.byteLength
  ) {
    throw new RangeError(
      "public E57 spherical Content-Length does not match manifest",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== manifest.entry.byteLength ||
    sha256(bytes) !== manifest.entry.sha256
  ) {
    bytes.fill(0);
    throw new Error("public E57 spherical digest does not match manifest");
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
    manifest,
    bytes,
    cachePath,
    receipt: Object.freeze({
      schema: "bim-explorer-public-e57-spherical-acquisition/1",
      fixtureId: manifest.fixtureId,
      byteLength: bytes.byteLength,
      sha256: manifest.entry.sha256,
      cacheHit: false,
      artifactTracked: false,
      releaseBundled: false,
      testOnly: true,
    }),
  };
}
