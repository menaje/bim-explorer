import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createE57PointSourceArtifact,
  decodeE57PointSource,
} from "../packages/e57-point-source/src/index.mjs";
import {
  acquirePublicE57ProfileFixtures,
} from "./public-e57-profile-fixtures.mjs";

const ASSERTIONS = Object.freeze([
  "pinnedProfileFixtures",
  "allPhysicalPageChecksums",
  "float64CoordinateDecode",
  "scaledIntegerCoordinateDecode",
  "indexlessCompressedVector",
  "cartesianInvalidStateDecode",
  "cartesianDirectionRecordFiltered",
  "independentReferenceParity",
  "coordinateRepresentationParity",
  "boundedPointRange",
  "decoderBuffersCleared",
  "cacheOnlyTestUse",
  "sampleNotTrackedOrBundled",
  "formatAdmissionHeld",
  "pathFreeEvidence",
]);
const POSITION_SHA256 =
  "dcdbc49b64fc068442b69f440252ec96" +
  "fc0a7b8bdbf5bdd68755d83b3962cfef";
const RANGE_SHA256 =
  "500c94ed39bfb57abbdc7346a5d63f0f" +
  "c6e64fe999872c770f136db7033a9b4d";
const CRC32C_POLYNOMIAL = 0x82f63b78;
const CRC32C_TABLE = Uint32Array.from(
  { length: 256 },
  (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^
        ((crc & 1) === 1 ? CRC32C_POLYNOMIAL : 0);
    }
    return crc >>> 0;
  },
);

function outputArgument(values) {
  if (values.length === 0) {
    return null;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    values[1].startsWith("-")
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-e57-profile-matrix.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function crc32c(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32C_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function logicalToPhysical(offset, pageSize) {
  const payload = pageSize - 4;
  return Math.floor(offset / payload) * pageSize + offset % payload;
}

function logicalUint16(bytes, offset, pageSize) {
  return bytes[logicalToPhysical(offset, pageSize)] |
    (bytes[logicalToPhysical(offset + 1, pageSize)] << 8);
}

function directionFilteredFixture(source) {
  const bytes = Uint8Array.from(source);
  const view = new DataView(bytes.buffer);
  const pageSize = Number(view.getBigUint64(40, true));
  const dataPacketOffset = 80;
  const streamCount = logicalUint16(
    bytes,
    dataPacketOffset + 4,
    pageSize,
  );
  if (streamCount !== 4) {
    bytes.fill(0);
    throw new Error("E57 direction filter fixture profile changed");
  }
  const sizes = Array.from({ length: streamCount }, (_, index) =>
    logicalUint16(
      bytes,
      dataPacketOffset + 6 + index * 2,
      pageSize,
    ));
  const invalidStateLogicalOffset =
    dataPacketOffset + 6 + streamCount * 2 +
    sizes.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const invalidStatePhysicalOffset = logicalToPhysical(
    invalidStateLogicalOffset,
    pageSize,
  );
  if ((bytes[invalidStatePhysicalOffset] & 1) !== 0) {
    bytes.fill(0);
    throw new Error("E57 direction filter seed is not valid");
  }
  bytes[invalidStatePhysicalOffset] |= 1;
  const page = Math.floor(invalidStatePhysicalOffset / pageSize);
  const pageStart = page * pageSize;
  new DataView(bytes.buffer).setUint32(
    pageStart + pageSize - 4,
    crc32c(bytes.subarray(pageStart, pageStart + pageSize - 4)),
    false,
  );
  return bytes;
}

function positionDigest(positions) {
  const canonical = new Uint8Array(positions.length * 8);
  const view = new DataView(canonical.buffer);
  positions.forEach((value, index) => {
    view.setFloat64(index * 8, value, true);
  });
  const digest = createHash("sha256")
    .update(canonical)
    .digest("hex");
  canonical.fill(0);
  return digest;
}

function prototypeProfile(fields) {
  return fields.map((field) => ({
    name: field.name,
    kind: field.kind,
    bitSize: field.bitSize,
    minimum: field.minimum,
    maximum: field.maximum,
    scale: field.scale,
    offset: field.offset,
  }));
}

function profileObservation(fixture, decoded, artifact) {
  const expected = fixture.entry.expected;
  const last = decoded.header.pointRecords - 1;
  const observation = {
    fixtureId: fixture.entry.fixtureId,
    name: fixture.entry.name,
    sourceBytes: fixture.entry.byteLength,
    sourceSha256: fixture.entry.sha256,
    coordinateRepresentation:
      decoded.header.fields[0].kind,
    header: {
      formatVersion: decoded.header.formatVersion,
      pageSize: decoded.header.pageSize,
      pages: decoded.header.pages,
      xmlPhysicalOffset: decoded.header.xmlPhysicalOffset,
      xmlLogicalLength: decoded.header.xmlLogicalLength,
      sourcePointRecords: decoded.header.sourcePointRecords,
      pointRecords: decoded.header.pointRecords,
      directionPointRecords:
        decoded.header.directionPointRecords,
      invalidPointRecords: decoded.header.invalidPointRecords,
      decodedPointBytes: decoded.header.decodedPointBytes,
      prototype: prototypeProfile(decoded.header.fields),
    },
    decode: {
      bounds: decoded.rawBounds,
      firstPoint: [...decoded.rawPositions.slice(0, 3)],
      lastPoint: [
        ...decoded.rawPositions.slice(last * 3, last * 3 + 3),
      ],
      positionFloat64LeSha256:
        positionDigest(decoded.rawPositions),
      dataPackets: decoded.packetProfile.dataPackets,
      indexPackets: decoded.packetProfile.indexPackets,
      sectionLength: decoded.packetProfile.sectionLength,
    },
    pointSource: {
      contract: artifact.schema,
      pointFormat: artifact.source.pointFormat,
      points: artifact.model.points,
      pointRangeByteLength: artifact.range.byteLength,
      pointRangePayloadBytes:
        artifact.resources.pointRangePayloadBytes,
      pointRangeSha256: artifact.range.sha256,
      maximumProjectionError:
        artifact.profile.coordinateProjection.maximumAbsoluteError,
    },
  };
  const expectedObservation = {
    formatVersion: expected.formatVersion,
    pageSize: expected.pageSize,
    pages: expected.pages,
    xmlPhysicalOffset: expected.xmlPhysicalOffset,
    xmlLogicalLength: expected.xmlLogicalLength,
    sourcePointRecords: expected.sourcePointRecords,
    pointRecords: expected.pointRecords,
    directionPointRecords: expected.directionPointRecords,
    invalidPointRecords: expected.invalidPointRecords,
    decodedPointBytes: expected.decodedPointBytes,
    prototype: expected.prototype,
  };
  if (
    !same(observation.header, expectedObservation) ||
    !same(observation.decode.bounds, expected.bounds) ||
    !same(observation.decode.firstPoint, expected.firstPoint) ||
    !same(observation.decode.lastPoint, expected.lastPoint) ||
    observation.decode.positionFloat64LeSha256 !==
      expected.positionFloat64LeSha256 ||
    observation.decode.dataPackets !== expected.dataPackets ||
    observation.decode.indexPackets !== expected.indexPackets ||
    observation.decode.sectionLength !== expected.sectionLength ||
    observation.pointSource.contract !==
      "bim-explorer-e57-point-source/0.1" ||
    observation.pointSource.pointFormat !== "cartesian-xyz" ||
    observation.pointSource.points !== expected.pointRecords ||
    observation.pointSource.pointRangeByteLength !==
      expected.pointRangeByteLength ||
    observation.pointSource.pointRangePayloadBytes !==
      expected.pointRangePayloadBytes ||
    observation.pointSource.pointRangeSha256 !==
      expected.pointRangeSha256 ||
    observation.pointSource.maximumProjectionError >= 1e-8 ||
    decoded.colors.some((value) => value !== 255)
  ) {
    throw new Error(
      `E57 ${fixture.entry.name} differs from its profile manifest`,
    );
  }
  return observation;
}

export function validateE57ProfileMatrixQualification(report) {
  const profiles = report?.profiles;
  const double = profiles?.[0];
  const scaled = profiles?.[1];
  if (
    report?.schema !==
      "bim-explorer-e57-profile-matrix-evidence/1" ||
    report.status !== "passed-bounded-profile-expansion" ||
    report.asOf !== "2026-08-08" ||
    report.fixtureSet?.id !==
      "libe57format-bunny-coordinate-profiles" ||
    report.fixtureSet.repository !==
      "https://github.com/asmaloney/libE57Format-test-data" ||
    report.fixtureSet.commit !==
      "1ca737e03d6277c384f1b05c4046e10caab331b5" ||
    report.fixtureSet.license !== "LicenseRef-E57-Test-Data" ||
    report.fixtureSet.testOnly !== true ||
    report.fixtureSet.artifactTracked !== false ||
    report.fixtureSet.releaseBundled !== false ||
    report.referenceDecoder?.id !== "pye57" ||
    report.referenceDecoder.version !== "0.4.19" ||
    report.referenceDecoder.commit !==
      "64c9000738ad54242e87e1da6bca6b683b13374b" ||
    report.referenceDecoder.libE57FormatCommit !==
      "1914b8ea972251d3bb49a33828497dde683205d9" ||
    report.referenceDecoder.license !== "MIT" ||
    report.referenceDecoder.positionEncoding !==
      "record-major-cartesian-xyz-float64-little-endian" ||
    report.referenceDecoder.runtimeBundled !== false ||
    !Array.isArray(profiles) ||
    profiles.length !== 2 ||
    double.fixtureId !== "libe57format-bunny-double-e57" ||
    double.coordinateRepresentation !== "double" ||
    double.sourceBytes !== 743_424 ||
    double.header?.pages !== 726 ||
    double.header.sourcePointRecords !== 30_571 ||
    double.header.pointRecords !== 30_571 ||
    double.header.decodedPointBytes !== 886_559 ||
    double.decode?.positionFloat64LeSha256 !== POSITION_SHA256 ||
    double.decode.indexPackets !== 0 ||
    double.pointSource?.pointRangeSha256 !== RANGE_SHA256 ||
    scaled.fixtureId !==
      "libe57format-bunny-scaled-integer-e57" ||
    scaled.coordinateRepresentation !== "scaled-integer" ||
    scaled.sourceBytes !== 374_784 ||
    scaled.header?.pages !== 366 ||
    scaled.header.sourcePointRecords !== 30_571 ||
    scaled.header.pointRecords !== 30_571 ||
    scaled.header.decodedPointBytes !== 886_559 ||
    scaled.decode?.positionFloat64LeSha256 !== POSITION_SHA256 ||
    scaled.decode.indexPackets !== 0 ||
    scaled.pointSource?.pointRangeSha256 !== RANGE_SHA256 ||
    !same(double.decode.bounds, scaled.decode.bounds) ||
    !same(double.decode.firstPoint, scaled.decode.firstPoint) ||
    !same(double.decode.lastPoint, scaled.decode.lastPoint) ||
    report.validityFilter?.sourcePointRecords !== 30_571 ||
    report.validityFilter.pointRecords !== 30_570 ||
    report.validityFilter.directionPointRecords !== 1 ||
    report.validityFilter.invalidPointRecords !== 0 ||
    report.validityFilter.firstDirectionRecordRemoved !== true ||
    report.validityFilter.pageChecksumRevalidated !== true ||
    report.capabilities?.float64Coordinates !== true ||
    report.capabilities.scaledIntegerCoordinates !== true ||
    report.capabilities.indexlessCompressedVector !== true ||
    report.capabilities.cartesianInvalidState !== true ||
    report.capabilities.pointRange !== true ||
    report.cleanup?.downloadBuffersCleared !== true ||
    report.cleanup.decoderBuffersCleared !== true ||
    report.cleanup.pointRangesCleared !== true ||
    report.cleanup.mutationBufferCleared !== true ||
    report.decision?.productProfileExpanded !== true ||
    report.decision.coordinateReference !== "held" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.formatAdmission !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error("E57 profile matrix evidence is invalid");
  }
  return report;
}

export async function qualifyE57ProfileMatrix() {
  const acquired = await acquirePublicE57ProfileFixtures();
  const profiles = [];
  const decodedResults = [];
  const artifacts = [];
  let mutation = null;
  let filtered = null;
  let validityFilter = null;
  try {
    for (const fixture of acquired.fixtures) {
      const decoded = decodeE57PointSource(fixture.bytes);
      const artifact = await createE57PointSourceArtifact(
        fixture.bytes,
      );
      decodedResults.push(decoded);
      artifacts.push(artifact);
      profiles.push(profileObservation(fixture, decoded, artifact));
    }
    mutation = directionFilteredFixture(acquired.fixtures[0].bytes);
    filtered = decodeE57PointSource(mutation);
    validityFilter = {
      sourcePointRecords: filtered.header.sourcePointRecords,
      pointRecords: filtered.header.pointRecords,
      directionPointRecords:
        filtered.header.directionPointRecords,
      invalidPointRecords: filtered.header.invalidPointRecords,
      firstDirectionRecordRemoved: same(
        [...filtered.rawPositions.slice(0, 3)],
        [...decodedResults[0].rawPositions.slice(3, 6)],
      ),
      pageChecksumRevalidated:
        filtered.header.validPageChecksums ===
        filtered.header.pages,
    };
  } finally {
    decodedResults.forEach((decoded) => {
      decoded.rawPositions.fill(0);
      decoded.colors.fill(0);
    });
    artifacts.forEach((artifact) => artifact.range.bytes.fill(0));
    filtered?.rawPositions.fill(0);
    filtered?.colors.fill(0);
    mutation?.fill(0);
    acquired.fixtures.forEach((fixture) => fixture.bytes.fill(0));
  }
  const report = {
    schema: "bim-explorer-e57-profile-matrix-evidence/1",
    status: "passed-bounded-profile-expansion",
    asOf: "2026-08-08",
    fixtureSet: {
      id: acquired.manifest.fixtureSetId,
      repository: acquired.manifest.provenance.repository,
      commit: acquired.manifest.provenance.commit,
      license: acquired.manifest.license.identifier,
      testOnly: true,
      artifactTracked: false,
      releaseBundled: false,
    },
    referenceDecoder: acquired.manifest.referenceDecoder,
    profiles,
    validityFilter,
    capabilities: {
      float64Coordinates: true,
      scaledIntegerCoordinates: true,
      indexlessCompressedVector: true,
      cartesianInvalidState: true,
      pointRange: true,
    },
    cleanup: {
      downloadBuffersCleared: acquired.fixtures.every(
        (fixture) => fixture.bytes.every((value) => value === 0),
      ),
      decoderBuffersCleared: decodedResults.every(
        (decoded) =>
          decoded.rawPositions.every((value) => value === 0) &&
          decoded.colors.every((value) => value === 0),
      ) &&
        filtered.rawPositions.every((value) => value === 0) &&
        filtered.colors.every((value) => value === 0),
      pointRangesCleared: artifacts.every((artifact) =>
        artifact.range.bytes.every((value) => value === 0)),
      mutationBufferCleared:
        mutation.every((value) => value === 0),
    },
    decision: {
      productProfileExpanded: true,
      coordinateReference: "held",
      pointCloudCodec: "held",
      formatAdmission: false,
    },
    assertions: Object.fromEntries(
      ASSERTIONS.map((name) => [name, true]),
    ),
    limitations: [
      "the two public samples contain only cartesianInvalidState zero records; a checksum-valid in-memory derivative qualifies state-one direction filtering",
      "spherical coordinates are qualified by separate evidence; scan pose, multiple scans, extension records, point identity, picking and LOD streaming remain outside this Cartesian matrix",
      "pye57/libE57Format was used only to capture the independent canonical position digest and is not a product or release dependency",
      "the public E57 binaries remain in an ignored digest cache and are not redistributed",
      "coordinate authority and E57 format admission remain held"
    ],
  };
  return validateE57ProfileMatrixQualification(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyE57ProfileMatrix();
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
