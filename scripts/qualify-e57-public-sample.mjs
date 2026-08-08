import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  probeE57Envelope,
} from "./e57-envelope-probe.mjs";
import {
  acquirePublicE57Fixture,
} from "./public-e57-fixture.mjs";

const ASSERTIONS = Object.freeze([
  "pinnedPublicDownload",
  "exactByteLengthAndDigest",
  "validE57Header",
  "allPhysicalPageChecksums",
  "boundedXmlMetadata",
  "declaredPointProfile",
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
    report.capabilities.pointDecode !== false ||
    report.capabilities.renderer !== false ||
    report.cleanup?.downloadBufferCleared !== true ||
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
    capabilities: {
      envelopeInspection: true,
      pageIntegrity: true,
      metadataProfile: true,
      pointDecode: false,
      renderer: false,
    },
    cleanup: {
      downloadBufferCleared:
        fixture.bytes.every((value) => value === 0),
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
      "the probe validates the E57 envelope, physical page CRCs and XML metadata only",
      "compressed point records are declared but not decoded",
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
