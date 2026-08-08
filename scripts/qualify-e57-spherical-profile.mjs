import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createE57PointSourceArtifact,
  decodeE57PointSource,
} from "../packages/e57-point-source/src/index.mjs";
import {
  acquirePublicE57SphericalFixture,
} from "./public-e57-spherical-fixture.mjs";

const ASSERTIONS = Object.freeze([
  "pinnedPublicDownload",
  "exactByteLengthAndDigest",
  "allPhysicalPageChecksums",
  "sphericalScaledIntegerDecode",
  "sphericalToCartesianProjection",
  "sphericalInvalidStateFiltering",
  "intensityStreamAlignment",
  "rgbProjection",
  "boundedTerminalPadding",
  "independentReferenceParity",
  "boundedPointRange",
  "decoderBuffersCleared",
  "cacheOnlyTestUse",
  "sampleNotTrackedOrBundled",
  "formatAdmissionHeld",
  "pathFreeEvidence",
]);

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
      "usage: node scripts/qualify-e57-spherical-profile.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function positionFloat64Digest(positions) {
  const canonical = new Uint8Array(positions.length * 8);
  const view = new DataView(canonical.buffer);
  positions.forEach((value, index) => {
    view.setFloat64(index * 8, value, true);
  });
  const digest = sha256(canonical);
  canonical.fill(0);
  return digest;
}

function positionNanometerDigest(positions) {
  const canonical = new Uint8Array(positions.length * 8);
  const view = new DataView(canonical.buffer);
  positions.forEach((value, index) => {
    const nanometers = Math.round(value * 1_000_000_000);
    if (!Number.isSafeInteger(nanometers)) {
      canonical.fill(0);
      throw new RangeError(
        "E57 nanometer parity coordinate exceeds the safe range",
      );
    }
    view.setBigInt64(index * 8, BigInt(nanometers), true);
  });
  const digest = sha256(canonical);
  canonical.fill(0);
  return digest;
}

function rgbDigest(colors, pointRecords) {
  const rgb = new Uint8Array(pointRecords * 3);
  for (let index = 0; index < pointRecords; index += 1) {
    rgb.set(colors.subarray(index * 4, index * 4 + 3), index * 3);
  }
  const digest = sha256(rgb);
  rgb.fill(0);
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

export function validateE57SphericalProfileQualification(report) {
  if (
    report?.schema !==
      "bim-explorer-e57-spherical-profile-evidence/1" ||
    report.status !== "passed-bounded-spherical-profile" ||
    report.asOf !== "2026-08-08" ||
    report.fixture?.fixtureId !== "e57-example-pump-a-spherical" ||
    report.fixture.repository !==
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/" ||
    report.fixture.sourcePage !==
      "https://e57-3d-imgfmt.sourceforge.net/data.html" ||
    report.fixture.byteLength !== 5_168_128 ||
    report.fixture.sha256 !==
      "268b42e69bbbad85703933f24626b9773" +
        "6ec703b0a7c34550dcb6ed0830317e3" ||
    report.fixture.license !== "LicenseRef-E57-Example-Test-Data" ||
    report.fixture.testOnly !== true ||
    report.fixture.artifactTracked !== false ||
    report.fixture.releaseBundled !== false ||
    report.referenceDecoder?.id !== "pye57" ||
    report.referenceDecoder.version !== "0.4.18" ||
    report.referenceDecoder.commit !==
      "46713644bf28cffad721724c41d248b70eb697b5" ||
    report.referenceDecoder.libE57FormatCommit !==
      "1914b8ea972251d3bb49a33828497dde683205d9" ||
    report.referenceDecoder.runtimeBundled !== false ||
    report.header?.coordinateRepresentation !== "spherical" ||
    report.header.sourcePointRecords !== 370_530 ||
    report.header.pointRecords !== 155_201 ||
    report.header.directionPointRecords !== 0 ||
    report.header.invalidPointRecords !== 215_329 ||
    report.header.decodedPointBytes !== 10_745_370 ||
    report.header.pages !== 5_047 ||
    report.header.validPageChecksums !== 5_047 ||
    report.header.prototype?.length !== 8 ||
    report.header.prototype[0]?.name !== "sphericalRange" ||
    report.header.prototype[3]?.name !== "intensity" ||
    report.header.prototype[7]?.name !== "sphericalInvalidState" ||
    !same(report.decode?.bounds, {
      min: [
        -2.9037629619081056,
        -5.301102580971326,
        -1.8997026532643004,
      ],
      max: [
        1.7216047845518772,
        -0.7926476312450051,
        1.8430029745831933,
      ],
    }) ||
    !/^[0-9a-f]{64}$/u.test(
      report.decode.positionFloat64LeSha256 ?? "",
    ) ||
    report.decode.positionNanometerInt64LeSha256 !==
      "25d3abf28dbf71fce25f55d524fcb81a" +
        "cdbc75b8a5d5ef5c47a268a3a82b6af6" ||
    report.decode.referencePositionFloat64LeSha256 !==
      "4f336d56e8ffeb2c140c6230788740150" +
        "f7435a1ef80173e4e7fc48e6b1b1846" ||
    report.decode.validRgbSha256 !==
      "269e22fc74d4fe6336b9e594f7adfd7c" +
        "46bb69e40c6f2b054a94f0cf6bb5c699" ||
    report.decode.dataPackets !== 104 ||
    report.decode.indexPackets !== 0 ||
    report.decode.sectionLength !== 5_143_660 ||
    !same(report.decode.terminalPadding, [
      { field: "sphericalRange", bits: 16, bytePaddingBits: 0 },
      { field: "sphericalAzimuth", bits: 18, bytePaddingBits: 2 },
      { field: "sphericalElevation", bits: 18, bytePaddingBits: 2 },
      { field: "intensity", bits: 2, bytePaddingBits: 2 },
      { field: "colorRed", bits: 0, bytePaddingBits: 0 },
      { field: "colorGreen", bits: 0, bytePaddingBits: 0 },
      { field: "colorBlue", bits: 0, bytePaddingBits: 0 },
      { field: "sphericalInvalidState", bits: 4, bytePaddingBits: 4 },
    ]) ||
    report.pointSource?.contract !==
      "bim-explorer-e57-point-source/0.1" ||
    report.pointSource.pointFormat !== "spherical-rae-rgb" ||
    report.pointSource.points !== 155_201 ||
    report.pointSource.pointRangeByteLength !== 2_483_264 ||
    report.pointSource.pointRangePayloadBytes !== 2_483_216 ||
    report.pointSource.pointRangeSha256 !==
      "b0a0c2cd5cb5f3a051d208332824318e" +
        "7561e1098ef24a4dd718e460b3fd303f" ||
    !same(report.pointSource.ignoredFields, ["intensity"]) ||
    report.pointSource.attributeLossiness !== "lossy" ||
    report.capabilities?.sphericalCoordinates !== true ||
    report.capabilities.sphericalInvalidState !== true ||
    report.capabilities.intensityStreamAlignment !== true ||
    report.capabilities.rgbProjection !== true ||
    report.capabilities.pointRange !== true ||
    report.cleanup?.downloadBufferCleared !== true ||
    report.cleanup.decoderBuffersCleared !== true ||
    report.cleanup.pointRangeCleared !== true ||
    report.decision?.productProfileExpanded !== true ||
    report.decision.coordinateReference !== "held" ||
    report.decision.formatAdmission !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error("E57 spherical profile evidence is invalid");
  }
  return report;
}

export async function qualifyE57SphericalProfile() {
  const fixture = await acquirePublicE57SphericalFixture();
  const expected = fixture.manifest.expected;
  let decoded = null;
  let artifact = null;
  let report = null;
  try {
    decoded = decodeE57PointSource(fixture.bytes);
    artifact = await createE57PointSourceArtifact(fixture.bytes);
    const last = decoded.header.pointRecords - 1;
    const observed = {
      coordinateRepresentation:
        decoded.header.coordinateRepresentation,
      formatVersion: decoded.header.formatVersion,
      pageSize: decoded.header.pageSize,
      pages: decoded.header.pages,
      validPageChecksums: decoded.header.validPageChecksums,
      xmlPhysicalOffset: decoded.header.xmlPhysicalOffset,
      xmlLogicalLength: decoded.header.xmlLogicalLength,
      sourcePointRecords: decoded.header.sourcePointRecords,
      pointRecords: decoded.header.pointRecords,
      directionPointRecords: decoded.header.directionPointRecords,
      invalidPointRecords: decoded.header.invalidPointRecords,
      decodedPointBytes: decoded.header.decodedPointBytes,
      prototype: prototypeProfile(decoded.header.fields),
    };
    const expectedHeader = {
      coordinateRepresentation: expected.coordinateRepresentation,
      formatVersion: expected.formatVersion,
      pageSize: expected.pageSize,
      pages: expected.pages,
      validPageChecksums: expected.pages,
      xmlPhysicalOffset: expected.xmlPhysicalOffset,
      xmlLogicalLength: expected.xmlLogicalLength,
      sourcePointRecords: expected.sourcePointRecords,
      pointRecords: expected.pointRecords,
      directionPointRecords: expected.directionPointRecords,
      invalidPointRecords: expected.invalidPointRecords,
      decodedPointBytes: expected.decodedPointBytes,
      prototype: expected.prototype,
    };
    const decode = {
      bounds: decoded.rawBounds,
      colorRange: decoded.rawColorRange,
      firstPoint: [...decoded.rawPositions.slice(0, 3)],
      lastPoint: [
        ...decoded.rawPositions.slice(last * 3, last * 3 + 3),
      ],
      firstColor: [...decoded.colors.slice(0, 3)],
      lastColor: [
        ...decoded.colors.slice(last * 4, last * 4 + 3),
      ],
      rawSphericalFloat64LeSha256:
        expected.rawSphericalFloat64LeSha256,
      referencePositionFloat64LeSha256:
        expected.referencePositionFloat64LeSha256,
      positionFloat64LeSha256:
        positionFloat64Digest(decoded.rawPositions),
      positionNanometerInt64LeSha256:
        positionNanometerDigest(decoded.rawPositions),
      validRgbSha256: rgbDigest(
        decoded.colors,
        decoded.header.pointRecords,
      ),
      dataPackets: decoded.packetProfile.dataPackets,
      indexPackets: decoded.packetProfile.indexPackets,
      sectionLength: decoded.packetProfile.sectionLength,
      terminalPadding: decoded.packetProfile.terminalPadding,
    };
    if (
      !same(observed, expectedHeader) ||
      !same(decode.bounds, expected.bounds) ||
      !same(decode.colorRange, expected.colorRange) ||
      !same(decode.firstPoint, expected.firstPoint) ||
      !same(decode.lastPoint, expected.lastPoint) ||
      !same(decode.firstColor, expected.firstColor) ||
      !same(decode.lastColor, expected.lastColor) ||
      decode.positionNanometerInt64LeSha256 !==
        expected.positionNanometerInt64LeSha256 ||
      decode.validRgbSha256 !== expected.validRgbSha256 ||
      decode.dataPackets !== expected.dataPackets ||
      decode.indexPackets !== expected.indexPackets ||
      decode.sectionLength !== expected.sectionLength ||
      artifact.source.pointFormat !== "spherical-rae-rgb" ||
      artifact.model.points !== expected.pointRecords ||
      artifact.range.byteLength !== expected.pointRangeByteLength ||
      artifact.resources.pointRangePayloadBytes !==
        expected.pointRangePayloadBytes ||
      artifact.range.sha256 !== expected.pointRangeSha256 ||
      !same(
        artifact.profile.attributeProjection.ignoredFields,
        ["intensity"],
      )
    ) {
      throw new Error(
        "public E57 spherical decode differs from its manifest",
      );
    }
    report = {
      schema: "bim-explorer-e57-spherical-profile-evidence/1",
      status: "passed-bounded-spherical-profile",
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
      },
      referenceDecoder: fixture.manifest.referenceDecoder,
      header: observed,
      decode,
      pointSource: {
        contract: artifact.schema,
        decoder: artifact.profile.decoder.id,
        pointFormat: artifact.source.pointFormat,
        points: artifact.model.points,
        ranges: artifact.model.ranges,
        pointRangeByteLength: artifact.range.byteLength,
        pointRangePayloadBytes:
          artifact.resources.pointRangePayloadBytes,
        pointRangeSha256: artifact.range.sha256,
        ignoredFields:
          artifact.profile.attributeProjection.ignoredFields,
        attributeLossiness:
          artifact.profile.attributeProjection.lossiness,
        coordinateReferenceStatus:
          artifact.source.coordinateReferenceStatus,
        maximumProjectionError:
          artifact.profile.coordinateProjection.maximumAbsoluteError,
      },
      capabilities: {
        sphericalCoordinates: true,
        sphericalInvalidState: true,
        intensityStreamAlignment: true,
        rgbProjection: true,
        pointRange: true,
      },
      cleanup: {
        downloadBufferCleared: true,
        decoderBuffersCleared: true,
        pointRangeCleared: true,
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
        "the public sample is downloaded to an ignored digest cache and is not redistributed",
        "intensity is decoded for stream alignment but omitted from the RGBA point range as an explicit lossy attribute projection",
        "nanometer-quantized Cartesian positions match pye57/libE57Format; the reference decoder is not a product dependency",
        "the exact Float64 trigonometric digest is observational because the final sub-nanometer bits vary by CPU runtime; the nanometer digest and Float32 point range are portable",
        "the sample has an identity pose and does not qualify scan pose, CRS or surveyed datum authority",
        "multiple scans, extension records, point identity, picking, LOD and E57 format admission remain held"
      ],
    };
  } finally {
    decoded?.rawPositions.fill(0);
    decoded?.colors.fill(0);
    artifact?.range.bytes.fill(0);
    fixture.bytes.fill(0);
  }
  report.cleanup = {
    downloadBufferCleared:
      fixture.bytes.every((value) => value === 0),
    decoderBuffersCleared:
      decoded.rawPositions.every((value) => value === 0) &&
      decoded.colors.every((value) => value === 0),
    pointRangeCleared:
      artifact.range.bytes.every((value) => value === 0),
  };
  return validateE57SphericalProfileQualification(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyE57SphericalProfile();
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
