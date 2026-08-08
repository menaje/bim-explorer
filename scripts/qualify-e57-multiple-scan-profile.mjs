import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  E57_MULTIPLE_SCAN_MAXIMUM_DECODED_POINT_BYTES,
  E57_MULTIPLE_SCAN_MAXIMUM_POINTS,
  E57_MULTIPLE_SCAN_MAXIMUM_POINTS_PER_SCAN,
  E57_MULTIPLE_SCAN_MAXIMUM_SCANS,
  E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  decodeE57MultipleScanSource,
} from "../packages/e57-point-source/src/index.mjs";
import {
  acquirePublicE57MultipleScanFixture,
} from "./public-e57-multiple-scan-fixture.mjs";

const ASSERTIONS = Object.freeze([
  "exactPinnedFixture",
  "allPhysicalPageChecksums",
  "fiveIndependentScanIdentities",
  "boundedAggregatePointDecode",
  "structuredIndexStreamAlignment",
  "fourExplicitPoses",
  "oneImplicitIdentityPose",
  "independentPoseProjectionParity",
  "independentRgbParity",
  "deterministicCleanup",
  "sampleNotTrackedOrBundled",
  "coordinateAuthorityHeld",
  "productOpenHeld",
  "formatAdmissionHeld",
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const EXPECTED_SCAN_EVIDENCE_SHA256 =
  "1f8d1389f4fc1250139a8ef4144c0721" +
  "f9cddd6e4b8297955632192ac8356cbf";

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function nearVector(left, right, tolerance = 1e-12) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) =>
      Math.abs(value - right[index]) <= tolerance);
}

function nearBounds(left, right) {
  return nearVector(left?.min, right?.min) &&
    nearVector(left?.max, right?.max);
}

function outputArgument(args) {
  let output = null;
  for (let index = 0; index < args.length; index += 1) {
    if (!["--out", "--output"].includes(args[index])) {
      throw new TypeError(
        "usage: node scripts/qualify-e57-multiple-scan-profile.mjs " +
          "[--out <report.json>]",
      );
    }
    if (output !== null || index + 1 >= args.length) {
      throw new TypeError("E57 multiple-scan output argument is invalid");
    }
    output = args[index + 1];
    index += 1;
  }
  return output;
}

function nanometerBytes(positions) {
  const bytes = new Uint8Array(positions.length * 8);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < positions.length; index += 1) {
    const quantized = Math.round(
      positions[index] * 1_000_000_000,
    );
    if (!Number.isSafeInteger(quantized)) {
      bytes.fill(0);
      throw new RangeError(
        "E57 posed coordinate exceeds nanometer parity range",
      );
    }
    view.setBigInt64(index * 8, BigInt(quantized), true);
  }
  return bytes;
}

function rgbBytes(colors) {
  const bytes = new Uint8Array(colors.length / 4 * 3);
  for (let point = 0; point < colors.length / 4; point += 1) {
    bytes.set(
      colors.subarray(point * 4, point * 4 + 3),
      point * 3,
    );
  }
  return bytes;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function scanEvidenceSha256(scans) {
  const canonical = scans.map((scan) => ({
    index: scan.index,
    guid: scan.guid,
    name: scan.name,
    sourcePointRecords: scan.sourcePointRecords,
    pointRecords: scan.pointRecords,
    directionPointRecords: scan.directionPointRecords,
    invalidPointRecords: scan.invalidPointRecords,
    pose: scan.pose,
    prototype: scan.prototype,
    worldPositionNanometerInt64LeSha256:
      scan.worldPositionNanometerInt64LeSha256,
    rgbSha256: scan.rgbSha256,
    dataPackets: scan.packets.dataPackets,
    indexPackets: scan.packets.indexPackets,
    sectionLength: scan.packets.sectionLength,
  }));
  return sha256(new TextEncoder().encode(JSON.stringify(canonical)));
}

function prototype(fields) {
  return fields.map((field) => ({
    bitSize: field.bitSize,
    kind: field.kind,
    maximum: field.maximum,
    minimum: field.minimum,
    name: field.name,
    offset: field.offset,
    scale: field.scale,
  }));
}

function aggregateBounds(scans) {
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const scan of scans) {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(
        bounds.min[axis],
        scan.worldBounds.min[axis],
      );
      bounds.max[axis] = Math.max(
        bounds.max[axis],
        scan.worldBounds.max[axis],
      );
    }
  }
  return bounds;
}

function scanMatchesExpected(scan, expected) {
  const coordinateFields = scan.prototype.slice(0, 3);
  return scan.index === expected.index &&
    scan.guid === expected.guid &&
    scan.name === expected.name &&
    scan.sourcePointRecords === expected.pointRecords &&
    scan.pointRecords === expected.pointRecords &&
    scan.directionPointRecords === 0 &&
    scan.invalidPointRecords === 0 &&
    same(scan.pose, expected.pose) &&
    same(
      coordinateFields.map((field) => field.bitSize),
      expected.coordinateBitSizes,
    ) &&
    nearBounds(scan.localBounds, expected.localBounds) &&
    nearBounds(scan.worldBounds, expected.worldBounds) &&
    scan.worldPositionNanometerInt64LeSha256 ===
      expected.worldPositionNanometerInt64LeSha256 &&
    scan.rgbSha256 === expected.rgbSha256 &&
    scan.packets.dataPackets === expected.dataPackets &&
    scan.packets.indexPackets === expected.indexPackets &&
    scan.packets.sectionLength === expected.sectionLength;
}

export function validateE57MultipleScanProfileEvidence(report) {
  if (
    report?.schema !==
      "bim-explorer-e57-multiple-scan-profile-evidence/1" ||
    report.status !== "passed-bounded-multiple-scan-pose-profile" ||
    report.asOf !== "2026-08-08" ||
    report.fixture?.fixtureId !==
      "e57-example-pump-no-invalid-multiple-scan" ||
    report.fixture.repository !==
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/" ||
    report.fixture.sourcePage !==
      "https://e57-3d-imgfmt.sourceforge.net/data.html" ||
    report.fixture.publishedAt !== "2011-05-05T21:05:19Z" ||
    report.fixture.byteLength !== 22_146_048 ||
    report.fixture.sha256 !==
      "5b85b18fe9860e9f9a2f397434530f2d" +
        "403fefcc15cf1ff92d75d96d274ff5a5" ||
    report.fixture.license !== "LicenseRef-E57-Example-Test-Data" ||
    report.fixture.notice !==
      "Copyright 2008 Carnahan-Proctor and Cross, Inc." ||
    report.fixture.testOnly !== true ||
    report.fixture.artifactTracked !== false ||
    report.fixture.releaseBundled !== false ||
    report.fixture.sampleRedistributed !== false ||
    report.envelope?.signature !== "ASTM-E57" ||
    report.envelope?.formatVersion !== "1.0" ||
    report.envelope.pageSize !== 1_024 ||
    report.envelope.pages !== 21_627 ||
    report.envelope.pageChecksum !== "CRC-32C" ||
    report.envelope.validPageChecksums !== 21_627 ||
    report.envelope.xmlPhysicalOffset !== 22_123_144 ||
    report.envelope.xmlLogicalLength !== 22_732 ||
    report.profile?.scanCount !== 5 ||
    report.profile.sourcePointRecords !== 1_213_990 ||
    report.profile.pointRecords !== 1_213_990 ||
    report.profile.decodedPointBytes !== 35_205_710 ||
    report.profile.directionPointRecords !== 0 ||
    report.profile.invalidPointRecords !== 0 ||
    report.profile.explicitPoseScans !== 4 ||
    report.profile.implicitIdentityPoseScans !== 1 ||
    report.profile.coordinateRepresentation !== "cartesian" ||
    !same(report.profile.structuredIndexFields, [
      "rowIndex",
      "columnIndex",
    ]) ||
    !same(report.profile.ignoredSemanticFields, [
      "intensity",
      "rowIndex",
      "columnIndex",
    ]) ||
    !nearBounds(report.profile.aggregateWorldBounds, {
      min: [
        -3.0344074660216376,
        -5.8261088453196255,
        -1.9824323681397054,
      ],
      max: [
        1.7299581719103188,
        -0.792648,
        1.8476499300322446,
      ],
    }) ||
    report.profile.aggregateWorldPositionNanometerInt64LeSha256 !==
      "d44fa31718500cf88129bc1f0fbd4354" +
        "46d929d142878712b08fd2d95e9af63a" ||
    report.profile.aggregateRgbSha256 !==
      "cebed53b1493e874b11c5fc5bb4f411" +
        "aa72851ba884d58e62a4d3023a0e8be11" ||
    !Array.isArray(report.profile.scans) ||
    report.profile.scans.length !== 5 ||
    report.profile.scanEvidenceSha256 !==
      EXPECTED_SCAN_EVIDENCE_SHA256 ||
    scanEvidenceSha256(report.profile.scans) !==
      EXPECTED_SCAN_EVIDENCE_SHA256 ||
    report.profile.scans.some((scan) =>
      !SHA256.test(scan.worldPositionNanometerInt64LeSha256) ||
      !SHA256.test(scan.rgbSha256)) ||
    report.resources?.sourceBytes !== 22_146_048 ||
    report.resources.decodedPointBytes !== 35_205_710 ||
    report.resources.positionBytes !== 29_135_760 ||
    report.resources.colorBytes !== 4_855_960 ||
    report.resources.maximumSourceBytes !==
      E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES ||
    report.resources.maximumPoints !==
      E57_MULTIPLE_SCAN_MAXIMUM_POINTS ||
    report.resources.maximumPointsPerScan !==
      E57_MULTIPLE_SCAN_MAXIMUM_POINTS_PER_SCAN ||
    report.resources.maximumScans !==
      E57_MULTIPLE_SCAN_MAXIMUM_SCANS ||
    report.resources.maximumDecodedPointBytes !==
      E57_MULTIPLE_SCAN_MAXIMUM_DECODED_POINT_BYTES ||
    report.referenceDecoder?.id !== "pye57" ||
    report.referenceDecoder.version !== "0.4.18" ||
    report.referenceDecoder.repository !==
      "https://github.com/davidcaron/pye57" ||
    report.referenceDecoder.commit !==
      "46713644bf28cffad721724c41d248b70eb697b5" ||
    report.referenceDecoder.libE57FormatCommit !==
      "1914b8ea972251d3bb49a33828497dde683205d9" ||
    report.referenceDecoder.license !== "MIT" ||
    report.referenceDecoder.positionEncoding !==
      "record-major-pose-applied-cartesian-xyz-nanometer-int64-" +
        "little-endian" ||
    report.referenceDecoder.colorEncoding !== "record-major-rgb-uint8" ||
    report.referenceDecoder.runtimeBundled !== false ||
    report.referenceDecoder.usedForExpectedResultsOnly !== true ||
    report.capabilities?.envelopeInspection !== true ||
    report.capabilities.pageIntegrity !== true ||
    report.capabilities?.multipleScanDecode !== true ||
    report.capabilities.scanPoseMetadata !== true ||
    report.capabilities.scanPoseApplication !== true ||
    report.capabilities.structuredIndexStreamAlignment !== true ||
    report.capabilities.productFileOpen !== false ||
    report.cleanup?.downloadBufferCleared !== true ||
    report.cleanup.scanOutputBuffersCleared !== true ||
    report.decision?.formatAdmission !== false ||
    report.decision.sampleUse !== "cache-only-technical-test" ||
    report.decision.multipleScanProfile !== "passed-pre-admission" ||
    report.decision.scanPose !==
      "passed-local-registration-metadata-and-projection" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.surveyedDatum !== false ||
    report.decision.productSupport !== false ||
    !Number.isFinite(report.performance?.decodeAndPoseMs) ||
    report.performance.decodeAndPoseMs < 0 ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error("E57 multiple-scan profile evidence is invalid");
  }
  return report;
}

export async function qualifyE57MultipleScanProfile() {
  const fixture = await acquirePublicE57MultipleScanFixture();
  const expected = fixture.manifest.expected;
  const started = performance.now();
  let decoded = null;
  let summaries = null;
  try {
    decoded = decodeE57MultipleScanSource(fixture.bytes);
    const aggregatePosition = createHash("sha256");
    const aggregateRgb = createHash("sha256");
    summaries = [];
    for (const scan of decoded.scans) {
      const positions = nanometerBytes(scan.worldPositions);
      const rgb = rgbBytes(scan.colors);
      try {
        aggregatePosition.update(positions);
        aggregateRgb.update(rgb);
        summaries.push({
          index: scan.header.index,
          guid: scan.header.guid,
          name: scan.header.name,
          sourcePointRecords: scan.header.sourcePointRecords,
          pointRecords: scan.header.pointRecords,
          directionPointRecords:
            scan.header.directionPointRecords,
          invalidPointRecords: scan.header.invalidPointRecords,
          pose: scan.header.pose,
          prototype: prototype(scan.header.fields),
          localBounds: scan.localBounds,
          worldBounds: scan.worldBounds,
          worldPositionNanometerInt64LeSha256: sha256(positions),
          rgbSha256: sha256(rgb),
          packets: scan.packetProfile,
        });
      } finally {
        positions.fill(0);
        rgb.fill(0);
      }
    }
    const aggregatePositionSha256 = aggregatePosition.digest("hex");
    const aggregateRgbSha256 = aggregateRgb.digest("hex");
    const worldBounds = aggregateBounds(summaries);
    const mismatches = [
      ["formatVersion", decoded.header.formatVersion !== expected.formatVersion],
      ["pageSize", decoded.header.pageSize !== expected.pageSize],
      ["pages", decoded.header.pages !== expected.pages],
      [
        "validPageChecksums",
        decoded.header.validPageChecksums !== expected.pages,
      ],
      [
        "xmlPhysicalOffset",
        decoded.header.xmlPhysicalOffset !== expected.xmlPhysicalOffset,
      ],
      [
        "xmlLogicalLength",
        decoded.header.xmlLogicalLength !== expected.xmlLogicalLength,
      ],
      ["scanCount", decoded.header.scanCount !== expected.scanCount],
      [
        "sourcePointRecords",
        decoded.header.sourcePointRecords !== expected.sourcePointRecords,
      ],
      [
        "pointRecords",
        decoded.header.pointRecords !== expected.pointRecords,
      ],
      [
        "directionPointRecords",
        decoded.header.directionPointRecords !==
          expected.directionPointRecords,
      ],
      [
        "invalidPointRecords",
        decoded.header.invalidPointRecords !== expected.invalidPointRecords,
      ],
      [
        "decodedPointBytes",
        decoded.header.decodedPointBytes !== expected.decodedPointBytes,
      ],
      [
        "explicitPoseScans",
        decoded.header.explicitPoseScans !== expected.explicitPoseScans,
      ],
      [
        "implicitIdentityPoseScans",
        decoded.header.implicitIdentityPoseScans !==
          expected.implicitIdentityPoseScans,
      ],
      [
        "coordinateRepresentation",
        decoded.header.coordinateRepresentation !==
          expected.coordinateRepresentation,
      ],
      [
        "prototypeFields",
        !same(
          summaries[0]?.prototype.map((field) => field.name),
          expected.prototypeFields,
        ),
      ],
      [
        "aggregateWorldBounds",
        !nearBounds(worldBounds, expected.aggregateWorldBounds),
      ],
      [
        "aggregateWorldPositionNanometerInt64LeSha256",
        aggregatePositionSha256 !==
          expected.aggregateWorldPositionNanometerInt64LeSha256,
      ],
      [
        "aggregateRgbSha256",
        aggregateRgbSha256 !== expected.aggregateRgbSha256,
      ],
      ...summaries.map((scan, index) => [
        `scan-${index}`,
        !scanMatchesExpected(scan, expected.scans[index]),
      ]),
    ].filter(([, mismatch]) => mismatch).map(([label]) => label);
    if (mismatches.length > 0) {
      throw new Error(
        "public E57 multiple-scan decode differs from its manifest: " +
          mismatches.join(", "),
      );
    }
    const positionBytes = decoded.scans.reduce(
      (sum, scan) => sum + scan.worldPositions.byteLength,
      0,
    );
    const colorBytes = decoded.scans.reduce(
      (sum, scan) => sum + scan.colors.byteLength,
      0,
    );
    for (const scan of decoded.scans) {
      scan.worldPositions.fill(0);
      scan.colors.fill(0);
    }
    const scanOutputBuffersCleared = decoded.scans.every(
      (scan) =>
        scan.worldPositions.every((value) => value === 0) &&
        scan.colors.every((value) => value === 0),
    );
    fixture.bytes.fill(0);
    const report = {
      schema: "bim-explorer-e57-multiple-scan-profile-evidence/1",
      status: "passed-bounded-multiple-scan-pose-profile",
      asOf: "2026-08-08",
      fixture: {
        fixtureId: fixture.manifest.fixtureId,
        repository: fixture.manifest.provenance.repository,
        sourcePage: fixture.manifest.provenance.sourcePage,
        publishedAt: fixture.manifest.provenance.publishedAt,
        byteLength: fixture.manifest.entry.byteLength,
        sha256: fixture.manifest.entry.sha256,
        license: fixture.manifest.license.identifier,
        notice: fixture.manifest.license.notice,
        testOnly: true,
        artifactTracked: false,
        releaseBundled: false,
        sampleRedistributed: false,
      },
      envelope: {
        signature: decoded.header.signature,
        formatVersion: decoded.header.formatVersion,
        pageSize: decoded.header.pageSize,
        pages: decoded.header.pages,
        pageChecksum: decoded.header.pageChecksum,
        validPageChecksums: decoded.header.validPageChecksums,
        xmlPhysicalOffset: decoded.header.xmlPhysicalOffset,
        xmlLogicalLength: decoded.header.xmlLogicalLength,
      },
      profile: {
        scanCount: decoded.header.scanCount,
        sourcePointRecords: decoded.header.sourcePointRecords,
        pointRecords: decoded.header.pointRecords,
        directionPointRecords: decoded.header.directionPointRecords,
        invalidPointRecords: decoded.header.invalidPointRecords,
        decodedPointBytes: decoded.header.decodedPointBytes,
        explicitPoseScans: decoded.header.explicitPoseScans,
        implicitIdentityPoseScans:
          decoded.header.implicitIdentityPoseScans,
        coordinateRepresentation:
          decoded.header.coordinateRepresentation,
        structuredIndexFields: ["rowIndex", "columnIndex"],
        ignoredSemanticFields: [
          "intensity",
          "rowIndex",
          "columnIndex",
        ],
        aggregateWorldBounds: worldBounds,
        aggregateWorldPositionNanometerInt64LeSha256:
          aggregatePositionSha256,
        aggregateRgbSha256,
        scanEvidenceSha256: scanEvidenceSha256(summaries),
        scans: summaries,
      },
      resources: {
        sourceBytes: fixture.manifest.entry.byteLength,
        decodedPointBytes: decoded.header.decodedPointBytes,
        positionBytes,
        colorBytes,
        maximumSourceBytes:
          E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
        maximumPoints: E57_MULTIPLE_SCAN_MAXIMUM_POINTS,
        maximumPointsPerScan:
          E57_MULTIPLE_SCAN_MAXIMUM_POINTS_PER_SCAN,
        maximumScans: E57_MULTIPLE_SCAN_MAXIMUM_SCANS,
        maximumDecodedPointBytes:
          E57_MULTIPLE_SCAN_MAXIMUM_DECODED_POINT_BYTES,
      },
      performance: {
        decodeAndPoseMs: performance.now() - started,
      },
      referenceDecoder: fixture.manifest.referenceDecoder,
      capabilities: {
        envelopeInspection: true,
        pageIntegrity: true,
        multipleScanDecode: true,
        scanPoseMetadata: true,
        scanPoseApplication: true,
        structuredIndexStreamAlignment: true,
        productFileOpen: false,
      },
      cleanup: {
        downloadBufferCleared:
          fixture.bytes.every((value) => value === 0),
        scanOutputBuffersCleared,
      },
      decision: {
        sampleUse: "cache-only-technical-test",
        multipleScanProfile: "passed-pre-admission",
        scanPose:
          "passed-local-registration-metadata-and-projection",
        coordinateReference: "held",
        surveyedDatum: false,
        productSupport: false,
        pointCloudCodec: "held",
        formatAdmission: false,
      },
      assertions: Object.fromEntries(
        ASSERTIONS.map((name) => [name, true]),
      ),
      limitations: [
        "the sample covers five registered Cartesian scans with structured row/column streams, intensity and RGB",
        "one scan omits pose metadata and remains in the implicit identity frame; four scans carry explicit unit-quaternion rotation and translation",
        "the pose is local registration metadata and does not establish CRS, surveyed control, datum transformation or accuracy authority",
        "intensity and row/column values are decoded for packet alignment but omitted from the point display projection without semantic authority",
        "the largest scan exceeds the current 500,000-point product range and no Browser, VS Code or clean VSIX multiple-scan open is claimed",
        "the public sample remains in an ignored digest cache and is not tracked, redistributed or release-bundled",
        "point identity, picking, LOD, extension records, write, round-trip and E57 format admission remain held",
      ],
    };
    return validateE57MultipleScanProfileEvidence(report);
  } finally {
    if (decoded !== null) {
      for (const scan of decoded.scans) {
        scan.worldPositions.fill(0);
        scan.colors.fill(0);
      }
    }
    fixture.bytes.fill(0);
  }
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyE57MultipleScanProfile();
  if (output !== null) {
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
