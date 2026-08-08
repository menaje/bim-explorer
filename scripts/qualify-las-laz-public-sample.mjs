import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  LAZ_PERF_CANDIDATE,
  probeLasLazPointRecords,
} from "./las-laz-point-probe.mjs";
import {
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";

const ASSERTIONS = Object.freeze([
  "pinnedPublicPairDownload",
  "exactByteLengthsAndDigests",
  "validLas12Headers",
  "boundedPointProfile",
  "lasPointRecordDecode",
  "lazPointRecordDecode",
  "exactLasLazPointRecordParity",
  "float64CoordinateProjection",
  "rgbAttributeDecode",
  "exactDecoderArtifact",
  "wasmAllocationsReleased",
  "downloadBuffersCleared",
  "cacheOnlyTestUse",
  "artifactsNotTrackedOrBundled",
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
      "usage: node scripts/qualify-las-laz-public-sample.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function validateDecoderLock() {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const root = lock.packages?.[""];
  const dependency = lock.packages?.["node_modules/laz-perf"];
  if (
    root?.devDependencies?.["laz-perf"] !==
      LAZ_PERF_CANDIDATE.version ||
    dependency?.version !== LAZ_PERF_CANDIDATE.version ||
    dependency?.integrity !== LAZ_PERF_CANDIDATE.npmIntegrity
  ) {
    throw new Error("laz-perf lock identity is invalid");
  }
}

export function validateLasLazPublicSampleProbe(report) {
  if (
    report?.schema !==
      "bim-explorer-las-laz-public-sample-probe/1" ||
    report.status !== "passed-pre-admission-point-decode" ||
    report.asOf !== "2026-08-08" ||
    report.fixture?.fixtureId !== "loaders-gl-ripple-las-laz" ||
    report.fixture.repository !==
      "https://github.com/visgl/loaders.gl" ||
    report.fixture.commit !==
      "44e7a4e978a63fad0ee257fedb688826f5f279e5" ||
    report.fixture.entries?.las?.path !==
      "cpp/Model3DTiler/test/resources/ripple.las" ||
    report.fixture.entries.las.byteLength !== 347_061 ||
    report.fixture.entries.las.sha256 !==
      "dbe194dd8529300f341a591e0b2e2ac5" +
        "7a96880db6dffa120dc1a41465026852" ||
    report.fixture.entries.laz?.path !==
      "cpp/Model3DTiler/test/resources/ripple.laz" ||
    report.fixture.entries.laz.byteLength !== 53_952 ||
    report.fixture.entries.laz.sha256 !==
      "64cc16cf7b38d3ec3d13e96b7af66bf" +
        "887be2a5d35d55e86c41fd38fa79c9034" ||
    report.fixture.sourceRepositoryLicense !== "MIT" ||
    report.fixture.sampleRedistributed !== false ||
    report.fixture.testOnly !== true ||
    report.fixture.artifactTracked !== false ||
    report.fixture.releaseBundled !== false ||
    !same(report.decoder, LAZ_PERF_CANDIDATE) ||
    report.headers?.las?.signature !== "LASF" ||
    report.headers.las.formatVersion !== "1.2" ||
    report.headers.las.compressed !== false ||
    report.headers.las.pointDataOffset !== 227 ||
    report.headers.las.variableLengthRecordCount !== 0 ||
    report.headers?.laz?.signature !== "LASF" ||
    report.headers.laz.formatVersion !== "1.2" ||
    report.headers.laz.compressed !== true ||
    report.headers.laz.pointDataOffset !== 333 ||
    report.headers.laz.variableLengthRecordCount !== 1 ||
    report.headers.shared?.pointFormat !== 3 ||
    report.headers.shared.pointRecordLength !== 34 ||
    report.headers.shared.pointRecords !== 10_201 ||
    !same(report.headers.shared.scale, [
      1e-8,
      1e-8,
      1.7664101123809815e-9,
    ]) ||
    !same(report.headers.shared.offset, [
      -5,
      -5,
      -0.6664100289344788,
    ]) ||
    !same(report.headers.shared.bounds, {
      min: [-5, -5, -0.6664100289344788],
      max: [5, 5, 1.100000023841858],
    }) ||
    report.profile?.pointRecords !== 10_201 ||
    !same(report.profile.decodedBounds, {
      min: [-5, -5, -0.6664100289344788],
      max: [5, 5, 1.100000023388559],
    }) ||
    !same(report.profile.firstPosition, [
      -5,
      -5,
      -0.3533200030526521,
    ]) ||
    !same(report.profile.lastPosition, [
      5,
      5,
      -0.3533200030526521,
    ]) ||
    !same(report.profile.colorRange, {
      min: [0, 17_408, 0],
      max: [65_280, 50_944, 16_128],
    }) ||
    !same(report.profile.firstColor, [2_560, 30_464, 14_080]) ||
    !same(report.profile.lastColor, [2_560, 30_464, 14_080]) ||
    !same(report.profile.intensityRange, [0, 0]) ||
    !same(report.profile.classifications, [0]) ||
    report.profile.pointRecordSha256 !==
      "31124633910e8b01c3cbd7d159c85b7" +
        "140b0ed20438fee70f9570ad2420c026e" ||
    report.capabilities?.lasPointDecode !== true ||
    report.capabilities.lazPointDecode !== true ||
    report.capabilities.exactPointRecordParity !== true ||
    report.capabilities.float64Coordinates !== true ||
    report.capabilities.rgbAttributes !== true ||
    report.capabilities.crsAuthority !== false ||
    report.capabilities.workerCancellation !== false ||
    report.capabilities.boundedRenderer !== false ||
    report.capabilities.browserProductOpen !== false ||
    report.capabilities.vscodeProductOpen !== false ||
    report.cleanup?.wasmAllocationsReleased !== true ||
    report.cleanup.downloadBuffersCleared !== true ||
    report.decision?.formatAdmission !== false ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.productSupport !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error("LAS/LAZ public sample probe evidence is invalid");
  }
  return report;
}

export async function qualifyLasLazPublicSample() {
  await validateDecoderLock();
  const fixture = await acquirePublicLasLazFixture();
  let probe;
  try {
    probe = await probeLasLazPointRecords({
      lasBytes: fixture.bytes.las,
      lazBytes: fixture.bytes.laz,
    });
    const expected = fixture.manifest.expected;
    const sharedHeader = probe.headers.las;
    if (
      sharedHeader.signature !== expected.signature ||
      sharedHeader.formatVersion !== expected.formatVersion ||
      sharedHeader.pointFormat !== expected.pointFormat ||
      sharedHeader.pointRecordLength !==
        expected.pointRecordLength ||
      sharedHeader.pointRecords !== expected.pointRecords ||
      !same(sharedHeader.scale, expected.scale) ||
      !same(sharedHeader.offset, expected.offset) ||
      !same(sharedHeader.bounds, expected.headerBounds) ||
      !same(probe.profile.decodedBounds, expected.decodedBounds) ||
      !same(probe.profile.firstPosition, expected.firstPosition) ||
      !same(probe.profile.lastPosition, expected.lastPosition) ||
      !same(probe.profile.colorRange, expected.colorRange) ||
      !same(probe.profile.firstColor, expected.firstColor) ||
      !same(probe.profile.lastColor, expected.lastColor) ||
      !same(probe.profile.intensityRange, expected.intensityRange) ||
      !same(
        probe.profile.classifications,
        expected.classifications,
      ) ||
      probe.profile.pointRecordSha256 !==
        expected.pointRecordSha256 ||
      probe.exactPointRecordParity !== true
    ) {
      throw new Error(
        "public LAS/LAZ probe differs from its manifest",
      );
    }
  } finally {
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
  const manifest = fixture.manifest;
  const report = {
    schema: "bim-explorer-las-laz-public-sample-probe/1",
    status: "passed-pre-admission-point-decode",
    asOf: "2026-08-08",
    fixture: {
      fixtureId: manifest.fixtureId,
      repository: manifest.provenance.repository,
      commit: manifest.provenance.commit,
      entries: Object.fromEntries(
        ["las", "laz"].map((format) => [format, {
          path: manifest.provenance.paths[format],
          byteLength: manifest.entries[format].byteLength,
          sha256: manifest.entries[format].sha256,
        }]),
      ),
      sourceRepositoryLicense:
        manifest.use.sourceRepositoryLicense,
      sampleRedistributed: false,
      testOnly: true,
      artifactTracked: false,
      releaseBundled: false,
    },
    decoder: LAZ_PERF_CANDIDATE,
    headers: {
      las: {
        signature: probe.headers.las.signature,
        formatVersion: probe.headers.las.formatVersion,
        compressed: false,
        pointDataOffset: probe.headers.las.pointDataOffset,
        variableLengthRecordCount:
          probe.headers.las.variableLengthRecordCount,
      },
      laz: {
        signature: probe.headers.laz.signature,
        formatVersion: probe.headers.laz.formatVersion,
        compressed: true,
        pointDataOffset: probe.headers.laz.pointDataOffset,
        variableLengthRecordCount:
          probe.headers.laz.variableLengthRecordCount,
      },
      shared: {
        pointFormat: probe.headers.las.pointFormat,
        pointRecordLength: probe.headers.las.pointRecordLength,
        pointRecords: probe.headers.las.pointRecords,
        scale: probe.headers.las.scale,
        offset: probe.headers.las.offset,
        bounds: probe.headers.las.bounds,
      },
    },
    profile: probe.profile,
    capabilities: {
      lasPointDecode: true,
      lazPointDecode: true,
      exactPointRecordParity: true,
      float64Coordinates: true,
      rgbAttributes: true,
      crsAuthority: false,
      workerCancellation: false,
      boundedRenderer: false,
      browserProductOpen: false,
      vscodeProductOpen: false,
    },
    cleanup: {
      wasmAllocationsReleased:
        probe.cleanup.wasmAllocationsReleased,
      downloadBuffersCleared:
        fixture.bytes.las.every((value) => value === 0) &&
        fixture.bytes.laz.every((value) => value === 0),
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
      "the probe covers a paired LAS 1.2 point-format 3 sample only",
      "the sample has no qualified CRS or surveyed datum authority",
      "laz-perf runs as a qualification-only dev dependency, not a product runtime",
      "Browser Worker cancellation, memory budgets and malformed-input isolation are not qualified",
      "the bounded renderer has no point primitive and products do not open LAS or LAZ",
      "the downloaded sample files remain in an ignored digest cache and are not released",
      "license metadata is technical due diligence and is not legal advice"
    ],
  };
  return validateLasLazPublicSampleProbe(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyLasLazPublicSample();
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
