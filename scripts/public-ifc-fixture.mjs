import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PUBLIC_IFC_MANIFEST = path.join(
  ROOT,
  "fixtures",
  "ifc",
  "public-schependomlaan",
  "manifest.json",
);
const SHA256 = /^[0-9a-f]{64}$/u;
const FIXTURE_ID = /^[a-z0-9][a-z0-9-]+$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_END = 0x06054b50;
const MAX_ZIP_COMMENT_BYTES = 65_535;

export class PublicIfcFixtureError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = "PublicIfcFixtureError";
    this.code = "BIM_EXPLORER_PUBLIC_IFC_FIXTURE_FAILED";
    this.receipt = Object.freeze(receipt);
  }
}

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

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateBudget(value, label, includeRss) {
  const budget = plainRecord(value, label);
  const fields = [
    "timeoutMs",
    "maxInitializationMs",
    "maxOpenMs",
    "maxInspectionMs",
    "maxTotalMs",
    "maxWallClockMs",
    "maxWasmHeapCapacityBytes",
  ];
  if (includeRss) {
    fields.push("maxProcessRssBytes");
  }
  for (const field of fields) {
    positiveInteger(budget[field], `${label}.${field}`);
  }
}

export function validatePublicIfcFixtureManifest(value) {
  const manifest = plainRecord(value, "public IFC fixture manifest");
  const provenance = plainRecord(manifest.provenance, "provenance");
  const tracking = plainRecord(manifest.tracking, "tracking");
  const redistribution = plainRecord(
    manifest.redistribution,
    "redistribution",
  );
  const archive = plainRecord(manifest.archive, "archive");
  const entry = plainRecord(manifest.entry, "entry");
  const ifc = plainRecord(manifest.ifc, "ifc");
  const expected = plainRecord(manifest.expected, "expected");

  if (
    manifest.schema !==
      "bim-explorer-public-ifc-fixture-manifest/1" ||
    manifest.kind !== "third-party-public-performance" ||
    !FIXTURE_ID.test(manifest.fixtureId ?? "")
  ) {
    throw new Error("unsupported public IFC fixture manifest");
  }
  if (
    provenance.repository !==
      "buildingsmart-community/Community-Sample-Test-Files" ||
    !COMMIT.test(provenance.commit ?? "") ||
    provenance.license !== "CC-BY-4.0" ||
    provenance.attribution !== "(C) original authors" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(provenance.verifiedAt ?? "")
  ) {
    throw new Error("public IFC provenance is incomplete");
  }
  const sourceUrl = new URL(provenance.sourceUrl);
  const sourcePage = new URL(provenance.sourcePage);
  const licensePage = new URL(provenance.licensePage);
  const pinnedPrefix =
    `/${provenance.repository}/${provenance.commit}/`;
  if (
    sourceUrl.protocol !== "https:" ||
    sourceUrl.hostname !== "raw.githubusercontent.com" ||
    !sourceUrl.pathname.startsWith(pinnedPrefix) ||
    sourcePage.protocol !== "https:" ||
    sourcePage.hostname !== "github.com" ||
    !sourcePage.pathname.startsWith(
      `/${provenance.repository}/blob/${provenance.commit}/`,
    ) ||
    licensePage.protocol !== "https:" ||
    licensePage.hostname !== "github.com" ||
    licensePage.pathname !==
      `/${provenance.repository}/blob/${provenance.commit}/LICENSE`
  ) {
    throw new Error("public IFC source must be pinned to the verified commit");
  }
  if (
    tracking.artifactCommitted !== false ||
    tracking.downloadOnDemand !== true ||
    tracking.archivePersisted !== false ||
    tracking.cacheRoot !== ".ifc-cache/public-ifc" ||
    redistribution.thirdPartyContent !== true ||
    redistribution.customerContent !== false ||
    redistribution.rightsVerified !== true ||
    redistribution.bundlingApproved !== false ||
    redistribution.noticeRequired !== true
  ) {
    throw new Error("public IFC tracking and redistribution policy mismatch");
  }
  if (
    archive.format !== "ifczip" ||
    archive.entries !== 1 ||
    !SHA256.test(archive.sha256 ?? "") ||
    !SHA256.test(entry.sha256 ?? "") ||
    entry.name !== "IFC-gebouw.ifc"
  ) {
    throw new Error("public IFC archive identity is invalid");
  }
  for (const [measurement, label] of [
    [archive.byteLength, "archive.byteLength"],
    [archive.maxDownloadBytes, "archive.maxDownloadBytes"],
    [entry.byteLength, "entry.byteLength"],
    [entry.maxExtractedBytes, "entry.maxExtractedBytes"],
  ]) {
    positiveInteger(measurement, label);
  }
  if (
    archive.byteLength > archive.maxDownloadBytes ||
    entry.byteLength > entry.maxExtractedBytes ||
    ifc.schema !== "IFC2X3" ||
    ifc.profileAdmission !== false
  ) {
    throw new Error("public IFC size or profile boundary is invalid");
  }
  for (const [field, count] of Object.entries(expected)) {
    positiveInteger(count, `expected.${field}`);
  }
  validateBudget(manifest.nodeBudget, "nodeBudget", true);
  validateBudget(manifest.browserBudget, "browserBudget", false);
  if (
    !Array.isArray(manifest.qualificationUse) ||
    manifest.qualificationUse.length === 0 ||
    !Array.isArray(manifest.notQualified) ||
    manifest.notQualified.length === 0
  ) {
    throw new Error("public IFC qualification boundary is incomplete");
  }
  return manifest;
}

export async function loadPublicIfcFixtureManifest(
  manifestFile = PUBLIC_IFC_MANIFEST,
) {
  return validatePublicIfcFixtureManifest(
    JSON.parse(await readFile(manifestFile, "utf8")),
  );
}

function findZipEnd(bytes) {
  const minimum = Math.max(
    0,
    bytes.length - 22 - MAX_ZIP_COMMENT_BYTES,
  );
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END) {
      return offset;
    }
  }
  throw new PublicIfcFixtureError("ZIP end record is unavailable", {
    outcome: "invalid-archive",
  });
}

export function extractPinnedZipEntry(archiveBytes, manifestValue) {
  const manifest = validatePublicIfcFixtureManifest(manifestValue);
  const bytes = Buffer.isBuffer(archiveBytes)
    ? archiveBytes
    : Buffer.from(
      archiveBytes.buffer,
      archiveBytes.byteOffset,
      archiveBytes.byteLength,
    );
  if (
    bytes.byteLength !== manifest.archive.byteLength ||
    digest(bytes) !== manifest.archive.sha256
  ) {
    throw new PublicIfcFixtureError("archive digest mismatch", {
      outcome: "archive-identity-mismatch",
    });
  }

  const endOffset = findZipEnd(bytes);
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(endOffset + 8);
  const entries = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  const commentLength = bytes.readUInt16LE(endOffset + 20);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== 1 ||
    entries !== manifest.archive.entries ||
    endOffset + 22 + commentLength !== bytes.length ||
    centralOffset + centralSize !== endOffset ||
    centralSize < 46 ||
    bytes.readUInt32LE(centralOffset) !== ZIP_CENTRAL_FILE
  ) {
    throw new PublicIfcFixtureError("unsupported ZIP archive layout", {
      outcome: "invalid-archive-layout",
    });
  }

  const flags = bytes.readUInt16LE(centralOffset + 8);
  const method = bytes.readUInt16LE(centralOffset + 10);
  const compressedSize = bytes.readUInt32LE(centralOffset + 20);
  const extractedSize = bytes.readUInt32LE(centralOffset + 24);
  const nameLength = bytes.readUInt16LE(centralOffset + 28);
  const extraLength = bytes.readUInt16LE(centralOffset + 30);
  const entryCommentLength = bytes.readUInt16LE(centralOffset + 32);
  const entryDisk = bytes.readUInt16LE(centralOffset + 34);
  const localOffset = bytes.readUInt32LE(centralOffset + 42);
  const centralEnd =
    centralOffset + 46 + nameLength + extraLength + entryCommentLength;
  const centralName = bytes
    .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
    .toString("utf8");
  if (
    centralEnd !== endOffset ||
    entryDisk !== 0 ||
    flags & 0x0001 ||
    flags & 0x0040 ||
    method !== 8 ||
    extractedSize !== manifest.entry.byteLength ||
    extractedSize > manifest.entry.maxExtractedBytes ||
    compressedSize > manifest.archive.maxDownloadBytes ||
    centralName !== manifest.entry.name ||
    localOffset + 30 > centralOffset ||
    bytes.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE
  ) {
    throw new PublicIfcFixtureError("unsupported ZIP entry", {
      outcome: "invalid-archive-entry",
    });
  }

  const localFlags = bytes.readUInt16LE(localOffset + 6);
  const localMethod = bytes.readUInt16LE(localOffset + 8);
  const localNameLength = bytes.readUInt16LE(localOffset + 26);
  const localExtraLength = bytes.readUInt16LE(localOffset + 28);
  const localName = bytes
    .subarray(localOffset + 30, localOffset + 30 + localNameLength)
    .toString("utf8");
  const compressedStart =
    localOffset + 30 + localNameLength + localExtraLength;
  const compressedEnd = compressedStart + compressedSize;
  if (
    localFlags !== flags ||
    localMethod !== method ||
    localName !== manifest.entry.name ||
    compressedEnd > centralOffset
  ) {
    throw new PublicIfcFixtureError("ZIP local entry mismatch", {
      outcome: "invalid-local-entry",
    });
  }

  let extracted;
  try {
    extracted = inflateRawSync(
      bytes.subarray(compressedStart, compressedEnd),
      {
        maxOutputLength: manifest.entry.maxExtractedBytes,
      },
    );
  } catch {
    throw new PublicIfcFixtureError("ZIP entry could not be extracted", {
      outcome: "extraction-failed",
    });
  }
  if (
    extracted.byteLength !== manifest.entry.byteLength ||
    digest(extracted) !== manifest.entry.sha256
  ) {
    throw new PublicIfcFixtureError("extracted IFC digest mismatch", {
      outcome: "entry-identity-mismatch",
    });
  }
  return extracted;
}

async function downloadArchive(manifest, fetchImplementation) {
  let response;
  try {
    response = await fetchImplementation(manifest.provenance.sourceUrl, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new PublicIfcFixtureError("public IFC download failed", {
      outcome: "download-failed",
    });
  }
  const contentLength = response.headers.get("content-length");
  if (
    !response.ok ||
    (
      contentLength !== null &&
      Number(contentLength) !== manifest.archive.byteLength
    ) ||
    response.body === null
  ) {
    throw new PublicIfcFixtureError("public IFC response mismatch", {
      outcome: "download-response-mismatch",
      status: response.status,
    });
  }
  const chunks = [];
  let received = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > manifest.archive.maxDownloadBytes) {
        throw new PublicIfcFixtureError(
          "public IFC download exceeded its byte budget",
          {
            outcome: "download-limit",
            receivedBytes: received,
          },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const archive = Buffer.concat(chunks, received);
  if (
    archive.byteLength !== manifest.archive.byteLength ||
    digest(archive) !== manifest.archive.sha256
  ) {
    throw new PublicIfcFixtureError("downloaded archive digest mismatch", {
      outcome: "archive-identity-mismatch",
      receivedBytes: archive.byteLength,
    });
  }
  return archive;
}

async function verifiedCachedIfc(cacheFile, manifest) {
  const metadata = await stat(cacheFile);
  if (
    !metadata.isFile() ||
    metadata.size !== manifest.entry.byteLength
  ) {
    throw new PublicIfcFixtureError("cached IFC identity mismatch", {
      outcome: "cache-identity-mismatch",
    });
  }
  const bytes = await readFile(cacheFile);
  if (digest(bytes) !== manifest.entry.sha256) {
    throw new PublicIfcFixtureError("cached IFC digest mismatch", {
      outcome: "cache-identity-mismatch",
    });
  }
  return bytes;
}

function safeReceipt(manifest, cacheHit) {
  return {
    schema: "bim-explorer-public-ifc-fetch-receipt/1",
    outcome: "verified",
    fixtureId: manifest.fixtureId,
    cacheHit,
    source: {
      repository: manifest.provenance.repository,
      commit: manifest.provenance.commit,
      archiveBytes: manifest.archive.byteLength,
      archiveSha256: manifest.archive.sha256,
    },
    entry: {
      byteLength: manifest.entry.byteLength,
      sha256: manifest.entry.sha256,
      schema: manifest.ifc.schema,
    },
    policy: {
      archivePersisted: false,
      artifactCommitted: false,
      customerContent: false,
      bundlingApproved: false,
    },
  };
}

export async function ensurePublicIfcFixture({
  cacheRoot,
  fetchImplementation = fetch,
  manifest: manifestValue,
} = {}) {
  const manifest = manifestValue === undefined
    ? await loadPublicIfcFixtureManifest()
    : validatePublicIfcFixtureManifest(manifestValue);
  const root = path.resolve(
    cacheRoot ?? path.join(ROOT, manifest.tracking.cacheRoot),
  );
  const directory = path.join(root, manifest.fixtureId);
  const cacheFile = path.join(
    directory,
    `${manifest.entry.sha256}.ifc`,
  );
  try {
    await verifiedCachedIfc(cacheFile, manifest);
    return {
      input: cacheFile,
      receipt: safeReceipt(manifest, true),
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const archive = await downloadArchive(manifest, fetchImplementation);
  const extracted = extractPinnedZipEntry(archive, manifest);
  await mkdir(directory, {
    mode: 0o700,
    recursive: true,
  });
  const temporary = path.join(
    directory,
    `.${manifest.fixtureId}-${process.pid}-${randomUUID()}.tmp`,
  );
  await writeFile(temporary, extracted, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    try {
      await link(temporary, cacheFile);
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }
  } finally {
    await unlink(temporary);
  }
  await verifiedCachedIfc(cacheFile, manifest);
  return {
    input: cacheFile,
    receipt: safeReceipt(manifest, false),
  };
}
