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
const DEFAULT_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "gltf",
  "public-khronos-box",
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateManifest(value) {
  const manifest = plainRecord(value, "public glTF manifest");
  const provenance = plainRecord(
    manifest.provenance,
    "public glTF provenance",
  );
  const entry = plainRecord(
    manifest.entry,
    "public glTF entry",
  );
  const license = plainRecord(
    manifest.license,
    "public glTF license",
  );
  const tracking = plainRecord(
    manifest.tracking,
    "public glTF tracking",
  );
  if (
    manifest.schema !== "bim-explorer-public-gltf-fixture/1" ||
    typeof manifest.fixtureId !== "string" ||
    manifest.fixtureId.length === 0 ||
    provenance.repository !==
      "https://github.com/KhronosGroup/glTF-Sample-Assets" ||
    !COMMIT.test(provenance.commit ?? "") ||
    typeof provenance.path !== "string" ||
    !provenance.path.endsWith(".glb") ||
    entry.name !== "Box.glb" ||
    entry.mediaType !== "model/gltf-binary" ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength <= 0 ||
    !SHA256.test(entry.sha256 ?? "") ||
    typeof entry.rawUrl !== "string" ||
    !entry.rawUrl.startsWith(
      "https://raw.githubusercontent.com/KhronosGroup/" +
      "glTF-Sample-Assets/",
    ) ||
    !entry.rawUrl.includes(provenance.commit) ||
    license.spdx !== "CC-BY-4.0" ||
    typeof license.attribution !== "string" ||
    license.attribution.length === 0 ||
    tracking.cacheRoot !== ".gltf-cache/public-gltf" ||
    tracking.artifactTracked !== false ||
    tracking.releaseBundled !== false ||
    tracking.networkAtRuntime !== false
  ) {
    throw new Error("public glTF manifest is invalid");
  }
  return Object.freeze(structuredClone(manifest));
}

export async function loadPublicGltfFixtureManifest(
  manifestPath = DEFAULT_MANIFEST,
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

export async function acquirePublicGltfFixture({
  cacheRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  manifestPath = DEFAULT_MANIFEST,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("public glTF acquisition requires fetch");
  }
  const manifest = await loadPublicGltfFixtureManifest(
    manifestPath,
  );
  const root = cacheRoot ?? path.join(
    ROOT,
    manifest.tracking.cacheRoot,
  );
  const cachePath = path.join(
    root,
    `${manifest.entry.sha256}.glb`,
  );
  if (!force) {
    const cached = await verifiedCache(cachePath, manifest);
    if (cached !== null) {
      return {
        manifest,
        bytes: cached,
        cachePath,
        receipt: Object.freeze({
          schema: "bim-explorer-public-gltf-acquisition/1",
          fixtureId: manifest.fixtureId,
          byteLength: cached.byteLength,
          sha256: manifest.entry.sha256,
          cacheHit: true,
          artifactTracked: false,
          releaseBundled: false,
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
    throw new Error("public glTF download failed");
  }
  const contentLength = response.headers?.get?.("content-length");
  if (
    contentLength !== null &&
    contentLength !== undefined &&
    Number(contentLength) !== manifest.entry.byteLength
  ) {
    throw new RangeError(
      "public glTF Content-Length does not match manifest",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== manifest.entry.byteLength ||
    sha256(bytes) !== manifest.entry.sha256
  ) {
    bytes.fill(0);
    throw new Error("public glTF digest does not match manifest");
  }
  await mkdir(root, { recursive: true });
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
  return {
    manifest,
    bytes,
    cachePath,
    receipt: Object.freeze({
      schema: "bim-explorer-public-gltf-acquisition/1",
      fixtureId: manifest.fixtureId,
      byteLength: bytes.byteLength,
      sha256: manifest.entry.sha256,
      cacheHit: false,
      artifactTracked: false,
      releaseBundled: false,
    }),
  };
}
