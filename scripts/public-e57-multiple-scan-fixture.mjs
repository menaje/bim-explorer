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
export const PUBLIC_E57_MULTIPLE_SCAN_FIXTURE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "e57",
  "public-e57-example-multiple-scan",
  "manifest.json",
);

const SHA256 = /^[0-9a-f]{64}$/u;
const GUID = /^\{[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\}$/u;
const EXPECTED_PYE57_COMMIT =
  "46713644bf28cffad721724c41d248b70eb697b5";
const EXPECTED_SOURCE_SHA256 =
  "5b85b18fe9860e9f9a2f397434530f2d" +
  "403fefcc15cf1ff92d75d96d274ff5a5";
const EXPECTED_POSITION_SHA256 =
  "d44fa31718500cf88129bc1f0fbd4354" +
  "46d929d142878712b08fd2d95e9af63a";
const EXPECTED_RGB_SHA256 =
  "cebed53b1493e874b11c5fc5bb4f411" +
  "aa72851ba884d58e62a4d3023a0e8be11";
const EXPECTED_POINT_RECORDS = Object.freeze([
  174_479,
  155_201,
  161_619,
  118_053,
  604_638,
]);
const EXPECTED_NAMES = Object.freeze([
  "pumps2",
  "pumps2_2",
  "pumps2_3",
  "pumps2_4",
  "pumps2_5",
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

function finiteVector(value, length) {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((item) =>
      typeof item === "number" && Number.isFinite(item));
}

function validBounds(value) {
  const bounds = plainRecord(value, "E57 expected bounds");
  exactKeys(bounds, ["min", "max"], "E57 expected bounds");
  return finiteVector(bounds.min, 3) &&
    finiteVector(bounds.max, 3) &&
    bounds.min.every((item, axis) => item <= bounds.max[axis]);
}

function validPose(value, expectedExplicit) {
  const pose = plainRecord(value, "E57 expected pose");
  exactKeys(
    pose,
    ["explicit", "rotation", "translation"],
    "E57 expected pose",
  );
  if (
    pose.explicit !== expectedExplicit ||
    !finiteVector(pose.rotation, 4) ||
    !finiteVector(pose.translation, 3)
  ) {
    return false;
  }
  const normSquared = pose.rotation.reduce(
    (sum, item) => sum + item * item,
    0,
  );
  return Math.abs(normSquared - 1) <= 1e-9;
}

function validScan(value, index) {
  const scan = plainRecord(value, `E57 expected scan ${index}`);
  exactKeys(scan, [
    "index",
    "guid",
    "name",
    "pointRecords",
    "pose",
    "coordinateBitSizes",
    "localBounds",
    "worldBounds",
    "worldPositionNanometerInt64LeSha256",
    "rgbSha256",
    "dataPackets",
    "indexPackets",
    "sectionLength",
  ], `E57 expected scan ${index}`);
  return scan.index === index &&
    GUID.test(scan.guid) &&
    scan.name === EXPECTED_NAMES[index] &&
    scan.pointRecords === EXPECTED_POINT_RECORDS[index] &&
    validPose(scan.pose, index !== 1) &&
    Array.isArray(scan.coordinateBitSizes) &&
    scan.coordinateBitSizes.length === 3 &&
    scan.coordinateBitSizes.every(
      (bits) => bits === (index === 4 ? 32 : 24),
    ) &&
    validBounds(scan.localBounds) &&
    validBounds(scan.worldBounds) &&
    SHA256.test(scan.worldPositionNanometerInt64LeSha256) &&
    SHA256.test(scan.rgbSha256) &&
    Number.isSafeInteger(scan.dataPackets) &&
    scan.dataPackets > 0 &&
    scan.indexPackets === 0 &&
    Number.isSafeInteger(scan.sectionLength) &&
    scan.sectionLength > 32;
}

function validProductProjection(value) {
  const projection = plainRecord(
    value,
    "public E57 multiple-scan product projection",
  );
  exactKeys(projection, [
    "pointFormat",
    "pointRangeByteLength",
    "pointRangePayloadBytes",
    "pointRangeSha256",
    "origin",
    "maximumAbsoluteError",
    "bounds",
  ], "public E57 multiple-scan product projection");
  return projection.pointFormat ===
      "cartesian-xyz-rgb-multiple-scan" &&
    projection.pointRangeByteLength === 19_423_888 &&
    projection.pointRangePayloadBytes === 19_423_840 &&
    projection.pointRangeSha256 ===
      "4dd5bbef38ffd815c00a01cf3feaa07a" +
        "85b40fa7019b2a6dad448e373381e697" &&
    finiteVector(projection.origin, 3) &&
    projection.maximumAbsoluteError > 0 &&
    projection.maximumAbsoluteError < 1e-6 &&
    validBounds(projection.bounds);
}

function validExpected(expected) {
  const value = plainRecord(
    expected,
    "public E57 multiple-scan expected",
  );
  exactKeys(value, [
    "formatVersion",
    "pageSize",
    "pages",
    "xmlPhysicalOffset",
    "xmlLogicalLength",
    "scanCount",
    "sourcePointRecords",
    "pointRecords",
    "directionPointRecords",
    "invalidPointRecords",
    "decodedPointBytes",
    "explicitPoseScans",
    "implicitIdentityPoseScans",
    "coordinateRepresentation",
    "prototypeFields",
    "aggregateWorldBounds",
    "aggregateWorldPositionNanometerInt64LeSha256",
    "aggregateRgbSha256",
    "productProjection",
    "scans",
  ], "public E57 multiple-scan expected");
  const expectedFields = [
    "cartesianX",
    "cartesianY",
    "cartesianZ",
    "intensity",
    "colorRed",
    "colorGreen",
    "colorBlue",
    "rowIndex",
    "columnIndex",
    "cartesianInvalidState",
  ];
  return value.formatVersion === "1.0" &&
    value.pageSize === 1_024 &&
    value.pages === 21_627 &&
    value.xmlPhysicalOffset === 22_123_144 &&
    value.xmlLogicalLength === 22_732 &&
    value.scanCount === 5 &&
    value.sourcePointRecords === 1_213_990 &&
    value.pointRecords === 1_213_990 &&
    value.directionPointRecords === 0 &&
    value.invalidPointRecords === 0 &&
    value.decodedPointBytes === 35_205_710 &&
    value.explicitPoseScans === 4 &&
    value.implicitIdentityPoseScans === 1 &&
    value.coordinateRepresentation === "cartesian" &&
    JSON.stringify(value.prototypeFields) ===
      JSON.stringify(expectedFields) &&
    validBounds(value.aggregateWorldBounds) &&
    value.aggregateWorldPositionNanometerInt64LeSha256 ===
      EXPECTED_POSITION_SHA256 &&
    value.aggregateRgbSha256 === EXPECTED_RGB_SHA256 &&
    validProductProjection(value.productProjection) &&
    Array.isArray(value.scans) &&
    value.scans.length === 5 &&
    value.scans.every(validScan);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateManifest(value) {
  const manifest = plainRecord(
    value,
    "public E57 multiple-scan manifest",
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
  ], "public E57 multiple-scan manifest");
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
      "bim-explorer-public-e57-multiple-scan-fixture/1" ||
    manifest.fixtureId !==
      "e57-example-pump-no-invalid-multiple-scan" ||
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
        "E57Example-data/pumpNoInvalidPoints.e57/download" ||
    provenance.publishedAt !== "2011-05-05T21:05:19Z" ||
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
    reference.commit !== EXPECTED_PYE57_COMMIT ||
    reference.libE57FormatCommit !==
      "1914b8ea972251d3bb49a33828497dde683205d9" ||
    reference.license !== "MIT" ||
    reference.positionEncoding !==
      "record-major-pose-applied-cartesian-xyz-nanometer-int64-" +
        "little-endian" ||
    reference.colorEncoding !== "record-major-rgb-uint8" ||
    reference.runtimeBundled !== false ||
    reference.usedForExpectedResultsOnly !== true ||
    entry.name !== "pumpNoInvalidPoints.e57" ||
    entry.rawUrl !==
      "https://downloads.sourceforge.net/project/" +
        "e57-3d-imgfmt/E57Example-data/pumpNoInvalidPoints.e57" ||
    entry.mediaType !== "application/octet-stream" ||
    entry.byteLength !== 22_146_048 ||
    entry.sha256 !== EXPECTED_SOURCE_SHA256 ||
    !validExpected(manifest.expected)
  ) {
    throw new Error("public E57 multiple-scan manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicE57MultipleScanFixtureManifest(
  manifestPath = PUBLIC_E57_MULTIPLE_SCAN_FIXTURE_MANIFEST,
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

export async function acquirePublicE57MultipleScanFixture({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  manifestPath = PUBLIC_E57_MULTIPLE_SCAN_FIXTURE_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError(
      "public E57 multiple-scan acquisition requires fetch",
    );
  }
  const manifest = await loadPublicE57MultipleScanFixtureManifest(
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
          schema:
            "bim-explorer-public-e57-multiple-scan-acquisition/1",
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
    throw new Error("public E57 multiple-scan download failed");
  }
  const contentLength = response.headers?.get?.("content-length");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    Number(contentLength) !== manifest.entry.byteLength
  ) {
    throw new RangeError(
      "public E57 multiple-scan Content-Length does not match manifest",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== manifest.entry.byteLength ||
    sha256(bytes) !== manifest.entry.sha256
  ) {
    bytes.fill(0);
    throw new Error(
      "public E57 multiple-scan digest does not match manifest",
    );
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
      schema: "bim-explorer-public-e57-multiple-scan-acquisition/1",
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
