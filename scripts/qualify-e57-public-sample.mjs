import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  probeE57Envelope,
} from "./e57-envelope-probe.mjs";
import {
  acquirePublicE57Fixture,
} from "./public-e57-fixture.mjs";
import {
  createE57PointSourceArtifact,
  decodeE57PointSource,
} from "../packages/e57-point-source/src/index.mjs";

const ASSERTIONS = Object.freeze([
  "pinnedPublicDownload",
  "exactByteLengthAndDigest",
  "validE57Header",
  "allPhysicalPageChecksums",
  "boundedXmlMetadata",
  "declaredPointProfile",
  "compressedPointDecode",
  "exactPointRecordProfile",
  "boundedPointRange",
  "decoderBuffersCleared",
  "cacheOnlyTestUse",
  "artifactNotTrackedOrBundled",
  "noFormatAdmission",
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
      "usage: node scripts/qualify-e57-public-sample.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateE57PublicSampleProbe(report) {
  if (
    report?.schema !==
      "bim-explorer-e57-public-sample-probe/1" ||
    report.status !== "passed-pre-admission-probe" ||
    report.asOf !== "2026-08-08" ||
    report.fixture?.fixtureId !==
      "libe57format-coloured-cube-float-e57" ||
    report.fixture.repository !==
      "https://github.com/asmaloney/libE57Format-test-data" ||
    report.fixture.commit !==
      "1ca737e03d6277c384f1b05c4046e10caab331b5" ||
    report.fixture.path !== "self/ColouredCubeFloat.e57" ||
    report.fixture.byteLength !== 118_784 ||
    report.fixture.sha256 !==
      "6dbf7972b358bd7dd0864c7893a4aa7b" +
        "61a339fd6ee27c71b3031f763c977d33" ||
    report.fixture.license !== "CC0-1.0" ||
    report.fixture.testOnly !== true ||
    report.fixture.artifactTracked !== false ||
    report.fixture.releaseBundled !== false ||
    report.envelope?.signature !== "ASTM-E57" ||
    report.envelope.formatVersion !== "1.0" ||
    report.envelope.physicalLength !== 118_784 ||
    report.envelope.pageSize !== 1_024 ||
    report.envelope.pages !== 116 ||
    report.envelope.pageChecksum !== "CRC-32C" ||
    report.envelope.validPageChecksums !== 116 ||
    report.envelope.xmlPhysicalOffset !== 115_824 ||
    report.envelope.xmlLogicalLength !== 1_932 ||
    report.profile?.data3DScans !== 1 ||
    report.profile.pointRecords !== 7_680 ||
    !same(report.profile.coordinateFields, [
      "cartesianX",
      "cartesianY",
      "cartesianZ",
    ]) ||
    !same(report.profile.colorFields, [
      "colorRed",
      "colorGreen",
      "colorBlue",
    ]) ||
    !same(report.profile.coordinateBounds, {
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    }) ||
    report.capabilities?.envelopeInspection !== true ||
    report.capabilities.pageIntegrity !== true ||
    report.capabilities.metadataProfile !== true ||
    report.capabilities.pointDecode !== true ||
    report.capabilities.pointRange !== true ||
    report.capabilities.renderer !== false ||
    report.pointSource?.contract !==
      "bim-explorer-e57-point-source/0.1" ||
    report.pointSource.decoder !==
      "bim-explorer-e57-bitpack-reader" ||
    report.pointSource.decoderVersion !== "0.1.0" ||
    report.pointSource.decoderReference?.id !== "cry-inc/e57" ||
    report.pointSource.decoderReference.version !== "0.10.5" ||
    report.pointSource.decoderReference.commit !==
      "7a7498f679b30588dc9298beb7aafab2245a2d0c" ||
    report.pointSource.decoderReference.license !== "MIT" ||
    report.pointSource.pointFormat !== "cartesian-xyz-rgb" ||
    report.pointSource.points !== 7_680 ||
    report.pointSource.dataPackets !== 3 ||
    report.pointSource.indexPackets !== 1 ||
    report.pointSource.pointRangeByteLength !== 122_928 ||
    report.pointSource.pointRangePayloadBytes !== 122_880 ||
    report.pointSource.pointRangeSha256 !==
      "dcc6868c55c79a51d315bfc4b287ca38" +
        "f8217e3d572554ef56b0da77359cd6aa" ||
    report.pointSource.coordinateReferenceStatus !== "unqualified" ||
    !same(report.pointSource.bounds, {
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    }) ||
    !same(report.pointSource.colorRange, {
      min: [0, 0, 0, 255],
      max: [255, 255, 255, 255],
    }) ||
    !same(report.pointSource.firstPoint, {
      position: [
        -0.5,
        -0.4990559220314026,
        0.07136291265487671,
      ],
      color: [0, 0, 255],
    }) ||
    !same(report.pointSource.lastPoint, {
      position: [
        0.16827905178070068,
        -0.00394439697265625,
        0.5,
      ],
      color: [255, 0, 0],
    }) ||
    report.cleanup?.downloadBufferCleared !== true ||
    report.cleanup.decodedPointBuffersCleared !== true ||
    report.cleanup.pointRangeCleared !== true ||
    report.decision?.formatAdmission !== false ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.productSupport !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error("E57 public sample probe evidence is invalid");
  }
  return report;
}

export async function qualifyE57PublicSample() {
  const fixture = await acquirePublicE57Fixture();
  const probe = probeE57Envelope(fixture.bytes);
  const expected = fixture.manifest.expected;
  let decoded = null;
  let artifact = null;
  let pointSource = null;
  if (
    probe.signature !== expected.signature ||
    probe.formatVersion !== expected.formatVersion ||
    probe.physicalLength !== expected.physicalLength ||
    probe.pageSize !== expected.pageSize ||
    probe.pages !== expected.pages ||
    probe.xmlPhysicalOffset !== expected.xmlPhysicalOffset ||
    probe.xmlLogicalLength !== expected.xmlLogicalLength ||
    probe.profile.data3DScans !== expected.data3DScans ||
    probe.profile.pointRecords !== expected.pointRecords ||
    !same(
      probe.profile.coordinateFields,
      expected.coordinateFields,
    ) ||
    !same(probe.profile.colorFields, expected.colorFields) ||
    !same(
      probe.profile.coordinateBounds,
      expected.coordinateBounds,
    )
  ) {
    fixture.bytes.fill(0);
    throw new Error("public E57 probe differs from its manifest");
  }
  try {
    decoded = decodeE57PointSource(fixture.bytes);
    artifact = await createE57PointSourceArtifact(fixture.bytes);
    const last = decoded.header.pointRecords - 1;
    pointSource = {
      contract: artifact.schema,
      decoder: artifact.profile.decoder.id,
      decoderVersion: artifact.profile.decoder.version,
      decoderReference: artifact.profile.decoder.reference,
      pointFormat: artifact.source.pointFormat,
      points: artifact.model.points,
      dataPackets: artifact.profile.packets.dataPackets,
      indexPackets: artifact.profile.packets.indexPackets,
      pointRangeByteLength: artifact.range.byteLength,
      pointRangePayloadBytes:
        artifact.resources.pointRangePayloadBytes,
      pointRangeSha256: artifact.range.sha256,
      coordinateReferenceStatus:
        artifact.source.coordinateReferenceStatus,
      bounds: artifact.model.bounds,
      colorRange: artifact.model.colorRange,
      firstPoint: {
        position: [...decoded.rawPositions.slice(0, 3)],
        color: [...decoded.colors.slice(0, 3)],
      },
      lastPoint: {
        position: [
          ...decoded.rawPositions.slice(last * 3, last * 3 + 3),
        ],
        color: [
          ...decoded.colors.slice(last * 4, last * 4 + 3),
        ],
      },
    };
    if (
      artifact.range.sha256 !== expected.pointRangeSha256 ||
      artifact.range.byteLength !== expected.pointRangeByteLength ||
      artifact.resources.pointRangePayloadBytes !==
        expected.pointRangePayloadBytes ||
      artifact.profile.packets.dataPackets !==
        expected.dataPackets ||
      artifact.profile.packets.indexPackets !==
        expected.indexPackets ||
      !same(pointSource.firstPoint, expected.firstPoint) ||
      !same(pointSource.lastPoint, expected.lastPoint)
    ) {
      throw new Error(
        "public E57 point decode differs from its manifest",
      );
    }
  } finally {
    decoded?.rawPositions.fill(0);
    decoded?.colors.fill(0);
    artifact?.range.bytes.fill(0);
  }
  const decodedPointBuffersCleared =
    decoded !== null &&
    decoded.rawPositions.every((value) => value === 0) &&
    decoded.colors.every((value) => value === 0);
  const pointRangeCleared =
    artifact !== null &&
    artifact.range.bytes.every((value) => value === 0);
  fixture.bytes.fill(0);
  const report = {
    schema: "bim-explorer-e57-public-sample-probe/1",
    status: "passed-pre-admission-probe",
    asOf: "2026-08-08",
    fixture: {
      fixtureId: fixture.manifest.fixtureId,
      repository: fixture.manifest.provenance.repository,
      commit: fixture.manifest.provenance.commit,
      path: fixture.manifest.provenance.path,
      byteLength: fixture.manifest.entry.byteLength,
      sha256: fixture.manifest.entry.sha256,
      license: fixture.manifest.license.spdx,
      testOnly: true,
      artifactTracked: false,
      releaseBundled: false,
    },
    envelope: {
      signature: probe.signature,
      formatVersion: probe.formatVersion,
      physicalLength: probe.physicalLength,
      pageSize: probe.pageSize,
      pages: probe.pages,
      pageChecksum: probe.pageChecksum,
      validPageChecksums: probe.validPageChecksums,
      xmlPhysicalOffset: probe.xmlPhysicalOffset,
      xmlLogicalLength: probe.xmlLogicalLength,
    },
    profile: probe.profile,
    pointSource,
    capabilities: {
      envelopeInspection: true,
      pageIntegrity: true,
      metadataProfile: true,
      pointDecode: true,
      pointRange: true,
      renderer: false,
    },
    cleanup: {
      downloadBufferCleared:
        fixture.bytes.every((value) => value === 0),
      decodedPointBuffersCleared,
      pointRangeCleared,
    },
    decision: {
      sampleUse: "cache-only-technical-test",
      formatAdmission: false,
      pointCloudCodec: "held",
      productSupport: false,
    },
    assertions: Object.fromEntries(
      ASSERTIONS.map((name) => [name, true]),
    ),
    limitations: [
      "the decoder profile covers one E57 1.0 scan with Cartesian XYZ/RGB and the default empty codec vector",
      "no point-cloud renderer or Browser product file-open is qualified",
      "the downloaded E57 file remains in an ignored digest cache and is not released",
      "sample evidence does not establish actual user demand or surveyed datum accuracy"
    ],
  };
  return validateE57PublicSampleProbe(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyE57PublicSample();
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
