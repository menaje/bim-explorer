import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import {
  measureWebIfcPerformance,
  WEB_IFC_PERFORMANCE_REPORT,
} from "../../adapters/web-ifc/src/measure-performance.mjs";
import {
  ensurePublicIfcFixture,
  extractPinnedZipEntry,
  loadPublicIfcFixtureManifest,
} from "../../scripts/public-ifc-fixture.mjs";
import {
  syntheticIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^
        (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function singleEntryZip(name, content) {
  const nameBytes = Buffer.from(name, "utf8");
  const compressed = deflateRawSync(content);
  const checksum = crc32(content);
  const flags = 0x0800;
  const method = 8;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.byteLength, 18);
  local.writeUInt32LE(content.byteLength, 22);
  local.writeUInt16LE(nameBytes.byteLength, 26);

  const localRecord = Buffer.concat([
    local,
    nameBytes,
    compressed,
  ]);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.byteLength, 20);
  central.writeUInt32LE(content.byteLength, 24);
  central.writeUInt16LE(nameBytes.byteLength, 28);
  const centralRecord = Buffer.concat([
    central,
    nameBytes,
  ]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.byteLength, 12);
  end.writeUInt32LE(localRecord.byteLength, 16);
  return Buffer.concat([
    localRecord,
    centralRecord,
    end,
  ]);
}

async function compactManifest(content) {
  const manifest = JSON.parse(JSON.stringify(
    await loadPublicIfcFixtureManifest(),
  ));
  const archive = singleEntryZip(manifest.entry.name, content);
  Object.assign(manifest.archive, {
    byteLength: archive.byteLength,
    sha256: sha256(archive),
    maxDownloadBytes: archive.byteLength + 1024,
  });
  Object.assign(manifest.entry, {
    byteLength: content.byteLength,
    sha256: sha256(content),
    maxExtractedBytes: content.byteLength + 1024,
  });
  return {
    archive,
    manifest,
  };
}

test("public IFC manifest pins provenance, license and byte identities", async () => {
  const manifest = await loadPublicIfcFixtureManifest();
  assert.equal(
    manifest.fixtureId,
    "public-schependomlaan-complete-ifc2x3",
  );
  assert.equal(manifest.provenance.license, "CC-BY-4.0");
  assert.equal(manifest.redistribution.rightsVerified, true);
  assert.equal(manifest.redistribution.bundlingApproved, false);
  assert.equal(manifest.tracking.artifactCommitted, false);
  assert.equal(manifest.ifc.profileAdmission, false);
  assert.equal(manifest.archive.byteLength, 8_873_221);
  assert.equal(manifest.entry.byteLength, 46_766_968);
});

test("public IFC acquisition verifies and reuses a private cache entry", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-public-fixture-test-"),
  );
  const content = Buffer.from(
    "ISO-10303-21;\nHEADER;\nENDSEC;\nEND-ISO-10303-21;\n",
    "utf8",
  );
  const { archive, manifest } = await compactManifest(content);
  let fetches = 0;
  const fetchImplementation = async () => {
    fetches += 1;
    return new Response(archive, {
      headers: {
        "content-length": String(archive.byteLength),
      },
      status: 200,
    });
  };
  try {
    assert.deepEqual(
      extractPinnedZipEntry(archive, manifest),
      content,
    );
    const first = await ensurePublicIfcFixture({
      cacheRoot: temporary,
      fetchImplementation,
      manifest,
    });
    const second = await ensurePublicIfcFixture({
      cacheRoot: temporary,
      fetchImplementation,
      manifest,
    });
    assert.equal(fetches, 1);
    assert.equal(first.receipt.cacheHit, false);
    assert.equal(second.receipt.cacheHit, true);
    assert.deepEqual(await readFile(first.input), content);
    assert.doesNotMatch(
      JSON.stringify(first.receipt),
      new RegExp(temporary.replaceAll("\\", "\\\\"), "u"),
    );
  } finally {
    await rm(temporary, {
      force: true,
      recursive: true,
    });
  }
});

test("compact web-ifc performance report measures an isolated source", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-performance-report-test-"),
  );
  const input = path.join(temporary, "source.ifc");
  try {
    await writeFile(input, syntheticIfc(), "utf8");
    const report = await measureWebIfcPerformance(
      input,
      "synthetic-performance-report",
    );
    assert.equal(report.schema, WEB_IFC_PERFORMANCE_REPORT);
    assert.equal(report.source.schema, "IFC4");
    assert.equal(report.semantics.projects, 1);
    assert.equal(report.semantics.walls, 1);
    assert.equal(report.geometry.products, 1);
    assert.equal(report.geometry.triangles, 12);
    assert.ok(
      report.resources.processMemoryBytes.maximumResidentSetSize > 0,
    );
    assert.equal(report.cleanup.modelClosed, true);
    assert.equal(report.cleanup.engineDisposed, true);
    assert.doesNotMatch(
      JSON.stringify(report),
      /\/Volumes\/|\/Users\/|[A-Z]:\\/u,
    );
  } finally {
    await rm(temporary, {
      force: true,
      recursive: true,
    });
  }
});
