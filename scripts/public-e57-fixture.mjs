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
export const PUBLIC_E57_FIXTURE_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "e57",
  "public-libe57-coloured-cube",
  "manifest.json",
);
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

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

function validateManifest(value) {
  const manifest = plainRecord(value, "public E57 manifest");
  exactKeys(manifest, [
    "schema",
    "fixtureId",
    "format",
    "purpose",
    "provenance",
    "entry",
    "license",
    "tracking",
    "expected",
  ], "public E57 manifest");
  const provenance = plainRecord(
    manifest.provenance,
    "public E57 provenance",
  );
  const entry = plainRecord(manifest.entry, "public E57 entry");
  const license = plainRecord(
    manifest.license,
    "public E57 license",
  );
  const tracking = plainRecord(
    manifest.tracking,
    "public E57 tracking",
  );
  const expected = plainRecord(
    manifest.expected,
    "public E57 expected profile",
  );
  const expectedRawUrl =
    "https://raw.githubusercontent.com/asmaloney/" +
    "libE57Format-test-data/" +
    `${provenance.commit}/${provenance.path}`;
  const expectedSourcePage =
    "https://github.com/asmaloney/libE57Format-test-data/blob/" +
    `${provenance.commit}/${provenance.path}`;
  if (
    manifest.schema !== "bim-explorer-public-e57-fixture/1" ||
    manifest.fixtureId !==
      "libe57format-coloured-cube-float-e57" ||
    manifest.format !== "e57" ||
    typeof manifest.purpose !== "string" ||
    manifest.purpose.length === 0 ||
    provenance.repository !==
      "https://github.com/asmaloney/libE57Format-test-data" ||
    !COMMIT.test(provenance.commit ?? "") ||
    provenance.path !== "self/ColouredCubeFloat.e57" ||
    provenance.sourcePage !== expectedSourcePage ||
    entry.name !== "ColouredCubeFloat.e57" ||
    entry.mediaType !== "application/octet-stream" ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength <= 48 ||
    entry.byteLength > 8 * 1024 * 1024 ||
    !SHA256.test(entry.sha256 ?? "") ||
    entry.rawUrl !== expectedRawUrl ||
    license.spdx !== "CC0-1.0" ||
    license.url !==
      "https://github.com/asmaloney/libE57Format-test-data/blob/" +
        `${provenance.commit}/LICENSE` ||
    license.scope !== "self directory test data" ||
    tracking.cacheRoot !==
      ".bim-explorer-cache/public-reference/e57" ||
    tracking.artifactTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.testOnly !== true ||
    tracking.networkAtRuntime !== false ||
    expected.signature !== "ASTM-E57" ||
    expected.formatVersion !== "1.0" ||
    expected.physicalLength !== entry.byteLength ||
    expected.pageSize !== 1024 ||
    expected.pages !== 116 ||
    expected.xmlPhysicalOffset !== 115_824 ||
    expected.xmlLogicalLength !== 1_932 ||
    expected.data3DScans !== 1 ||
    expected.pointRecords !== 7_680 ||
    JSON.stringify(expected.coordinateFields) !==
      JSON.stringify([
        "cartesianX",
        "cartesianY",
        "cartesianZ",
      ]) ||
    JSON.stringify(expected.colorFields) !==
      JSON.stringify(["colorRed", "colorGreen", "colorBlue"]) ||
    JSON.stringify(expected.coordinateBounds) !==
      JSON.stringify({
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      }) ||
    JSON.stringify(expected.firstPoint) !==
      JSON.stringify({
        position: [
          -0.5,
          -0.4990559220314026,
          0.07136291265487671,
        ],
        color: [0, 0, 255],
      }) ||
    JSON.stringify(expected.lastPoint) !==
      JSON.stringify({
        position: [
          0.16827905178070068,
          -0.00394439697265625,
          0.5,
        ],
        color: [255, 0, 0],
      }) ||
    expected.dataPackets !== 3 ||
    expected.indexPackets !== 1 ||
    expected.pointRangeByteLength !== 122_928 ||
    expected.pointRangePayloadBytes !== 122_880 ||
    expected.pointRangeSha256 !==
      "dcc6868c55c79a51d315bfc4b287ca38" +
        "f8217e3d572554ef56b0da77359cd6aa"
  ) {
    throw new Error("public E57 manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicE57FixtureManifest(
  manifestPath = PUBLIC_E57_FIXTURE_MANIFEST,
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

export async function acquirePublicE57Fixture({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  manifestPath = PUBLIC_E57_FIXTURE_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("public E57 acquisition requires fetch");
  }
  const manifest = await loadPublicE57FixtureManifest(manifestPath);
  const root = cacheRoot ?? path.join(
    ROOT,
    manifest.tracking.cacheRoot,
  );
  const cachePath = path.join(
    root,
    `${manifest.entry.sha256}.e57`,
  );
  if (!force) {
    const cached = await verifiedCache(cachePath, manifest);
    if (cached !== null) {
      return {
        manifest,
        bytes: cached,
        cachePath,
        receipt: Object.freeze({
          schema: "bim-explorer-public-e57-acquisition/1",
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
    throw new Error("public E57 download failed");
  }
  const contentLength = response.headers?.get?.("content-length");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    Number(contentLength) !== manifest.entry.byteLength
  ) {
    throw new RangeError(
      "public E57 Content-Length does not match manifest",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== manifest.entry.byteLength ||
    sha256(bytes) !== manifest.entry.sha256
  ) {
    bytes.fill(0);
    throw new Error("public E57 digest does not match manifest");
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
      schema: "bim-explorer-public-e57-acquisition/1",
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
