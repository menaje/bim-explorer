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
export const PUBLIC_LAS_LAZ_FIXTURE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "las-laz",
  "public-loaders-gl-ripple",
  "manifest.json",
);
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const FORMATS = Object.freeze(["las", "laz"]);

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
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(keys)) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateEntry(entry, format, provenance) {
  const value = plainRecord(entry, `public ${format} entry`);
  exactKeys(value, [
    "name",
    "mediaType",
    "byteLength",
    "sha256",
    "rawUrl",
    "compressed",
  ], `public ${format} entry`);
  const expectedUrl =
    "https://raw.githubusercontent.com/visgl/loaders.gl/" +
    `${provenance.commit}/${provenance.paths[format]}`;
  const expected = format === "las" ? {
    name: "ripple.las",
    byteLength: 347_061,
    sha256:
      "dbe194dd8529300f341a591e0b2e2ac5" +
      "7a96880db6dffa120dc1a41465026852",
    compressed: false,
  } : {
    name: "ripple.laz",
    byteLength: 53_952,
    sha256:
      "64cc16cf7b38d3ec3d13e96b7af66bf" +
      "887be2a5d35d55e86c41fd38fa79c9034",
    compressed: true,
  };
  if (
    value.name !== expected.name ||
    value.mediaType !== "application/octet-stream" ||
    value.byteLength !== expected.byteLength ||
    value.sha256 !== expected.sha256 ||
    !SHA256.test(value.sha256 ?? "") ||
    value.rawUrl !== expectedUrl ||
    value.compressed !== expected.compressed
  ) {
    throw new Error(`public ${format} entry is invalid`);
  }
  return value;
}

function validateManifest(value) {
  const manifest = plainRecord(
    value,
    "public LAS/LAZ manifest",
  );
  exactKeys(manifest, [
    "schema",
    "fixtureId",
    "format",
    "purpose",
    "provenance",
    "entries",
    "use",
    "tracking",
    "expected",
  ], "public LAS/LAZ manifest");
  const provenance = plainRecord(
    manifest.provenance,
    "public LAS/LAZ provenance",
  );
  const paths = plainRecord(provenance.paths, "public fixture paths");
  const sourcePages = plainRecord(
    provenance.sourcePages,
    "public fixture source pages",
  );
  const entries = plainRecord(
    manifest.entries,
    "public LAS/LAZ entries",
  );
  const use = plainRecord(manifest.use, "public fixture use");
  const tracking = plainRecord(
    manifest.tracking,
    "public LAS/LAZ tracking",
  );
  const expected = plainRecord(
    manifest.expected,
    "public LAS/LAZ expected profile",
  );
  exactKeys(provenance, [
    "repository",
    "commit",
    "paths",
    "sourcePages",
  ], "public LAS/LAZ provenance");
  exactKeys(paths, FORMATS, "public fixture paths");
  exactKeys(sourcePages, FORMATS, "public fixture source pages");
  exactKeys(entries, FORMATS, "public LAS/LAZ entries");
  for (const format of FORMATS) {
    const expectedPage =
      "https://github.com/visgl/loaders.gl/blob/" +
      `${provenance.commit}/${paths[format]}`;
    if (sourcePages[format] !== expectedPage) {
      throw new Error(`public ${format} source page is invalid`);
    }
    validateEntry(entries[format], format, provenance);
  }
  if (
    manifest.schema !==
      "bim-explorer-public-las-laz-fixture/1" ||
    manifest.fixtureId !== "loaders-gl-ripple-las-laz" ||
    manifest.format !== "las-laz" ||
    typeof manifest.purpose !== "string" ||
    manifest.purpose.length === 0 ||
    provenance.repository !==
      "https://github.com/visgl/loaders.gl" ||
    provenance.commit !==
      "44e7a4e978a63fad0ee257fedb688826f5f279e5" ||
    !COMMIT.test(provenance.commit ?? "") ||
    paths.las !== "cpp/Model3DTiler/test/resources/ripple.las" ||
    paths.laz !== "cpp/Model3DTiler/test/resources/ripple.laz" ||
    use.sourceRepositoryLicense !== "MIT" ||
    use.licenseUrl !==
      "https://github.com/visgl/loaders.gl/blob/" +
        `${provenance.commit}/LICENSE` ||
    use.sampleRedistributed !== false ||
    use.testOnly !== true ||
    tracking.cacheRoot !==
      ".bim-explorer-cache/public-reference/las-laz" ||
    tracking.artifactTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.testOnly !== true ||
    tracking.networkAtRuntime !== false ||
    expected.signature !== "LASF" ||
    expected.formatVersion !== "1.2" ||
    expected.pointFormat !== 3 ||
    expected.pointRecordLength !== 34 ||
    expected.pointRecords !== 10_201 ||
    !same(expected.scale, [
      1e-8,
      1e-8,
      1.7664101123809815e-9,
    ]) ||
    !same(expected.offset, [
      -5,
      -5,
      -0.6664100289344788,
    ]) ||
    !same(expected.headerBounds, {
      min: [-5, -5, -0.6664100289344788],
      max: [5, 5, 1.100000023841858],
    }) ||
    !same(expected.decodedBounds, {
      min: [-5, -5, -0.6664100289344788],
      max: [5, 5, 1.100000023388559],
    }) ||
    !same(expected.firstPosition, [
      -5,
      -5,
      -0.3533200030526521,
    ]) ||
    !same(expected.lastPosition, [
      5,
      5,
      -0.3533200030526521,
    ]) ||
    !same(expected.colorRange, {
      min: [0, 17_408, 0],
      max: [65_280, 50_944, 16_128],
    }) ||
    !same(expected.firstColor, [2_560, 30_464, 14_080]) ||
    !same(expected.lastColor, [2_560, 30_464, 14_080]) ||
    !same(expected.intensityRange, [0, 0]) ||
    !same(expected.classifications, [0]) ||
    expected.pointRecordSha256 !==
      "31124633910e8b01c3cbd7d159c85b7" +
        "140b0ed20438fee70f9570ad2420c026e"
  ) {
    throw new Error("public LAS/LAZ manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicLasLazFixtureManifest(
  manifestPath = PUBLIC_LAS_LAZ_FIXTURE_MANIFEST,
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

async function acquireEntry({
  cacheRoot,
  entry,
  fetchImpl,
  force,
  format,
}) {
  const cachePath = path.join(
    cacheRoot,
    `${entry.sha256}.${format}`,
  );
  if (!force) {
    const cached = await verifiedCache(cachePath, entry);
    if (cached !== null) {
      return { bytes: cached, cachePath, cacheHit: true };
    }
  }
  const response = await fetchImpl(entry.rawUrl, {
    redirect: "follow",
  });
  if (
    response === null ||
    response.ok !== true ||
    typeof response.arrayBuffer !== "function"
  ) {
    throw new Error(`public ${format} download failed`);
  }
  const contentLength = response.headers?.get?.("content-length");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    Number(contentLength) !== entry.byteLength
  ) {
    throw new RangeError(
      `public ${format} Content-Length does not match manifest`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== entry.byteLength ||
    sha256(bytes) !== entry.sha256
  ) {
    bytes.fill(0);
    throw new Error(
      `public ${format} digest does not match manifest`,
    );
  }
  await mkdir(cacheRoot, { recursive: true });
  const temporary =
    `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, bytes, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, cachePath);
  } finally {
    await rm(temporary, { force: true });
  }
  return { bytes, cachePath, cacheHit: false };
}

export async function acquirePublicLasLazFixture({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  manifestPath = PUBLIC_LAS_LAZ_FIXTURE_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("public LAS/LAZ acquisition requires fetch");
  }
  const manifest = await loadPublicLasLazFixtureManifest(
    manifestPath,
  );
  const root = cacheRoot ?? path.join(
    ROOT,
    manifest.tracking.cacheRoot,
  );
  const acquired = {};
  try {
    for (const format of FORMATS) {
      acquired[format] = await acquireEntry({
        cacheRoot: root,
        entry: manifest.entries[format],
        fetchImpl,
        force,
        format,
      });
    }
  } catch (error) {
    for (const item of Object.values(acquired)) {
      item.bytes.fill(0);
    }
    throw error;
  }
  return {
    manifest,
    bytes: Object.freeze({
      las: acquired.las.bytes,
      laz: acquired.laz.bytes,
    }),
    cachePaths: Object.freeze({
      las: acquired.las.cachePath,
      laz: acquired.laz.cachePath,
    }),
    receipt: Object.freeze({
      schema: "bim-explorer-public-las-laz-acquisition/1",
      fixtureId: manifest.fixtureId,
      entries: Object.freeze(Object.fromEntries(
        FORMATS.map((format) => [format, Object.freeze({
          byteLength: manifest.entries[format].byteLength,
          sha256: manifest.entries[format].sha256,
          cacheHit: acquired[format].cacheHit,
        })]),
      )),
      artifactTracked: false,
      releaseBundled: false,
      sampleRedistributed: false,
      testOnly: true,
    }),
  };
}
