import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { probeLasHeader } from "./las-header-probe.mjs";

const require = createRequire(import.meta.url);
const lazPerfPackage = require("laz-perf/package.json");
const { create: createLazPerf } = require("laz-perf");

export const LAZ_PERF_CANDIDATE = Object.freeze({
  package: "laz-perf",
  version: "0.0.6",
  license: "Apache-2.0",
  npmIntegrity:
    "sha512-ZBqC+BBlofznDIY3SfjXDBVdIhYfz7bq8HAHztlw4XOnu++n" +
    "HiWtCGPgzpdeAhPkByc68DaKNy3E3rY4XrdRtQ==",
  sourceRepository: "https://github.com/hobuinc/laz-perf",
  sourceCommit: "0e1443a34669739ef8a3fd7eb2278d9d7e586a77",
  role: "qualification-only-dev-dependency",
});

if (
  lazPerfPackage.version !== LAZ_PERF_CANDIDATE.version ||
  lazPerfPackage.license !== LAZ_PERF_CANDIDATE.license
) {
  throw new Error("laz-perf candidate package metadata is invalid");
}

function createProfile() {
  return {
    points: 0,
    bounds: {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    },
    firstPosition: null,
    lastPosition: null,
    intensityRange: [Infinity, -Infinity],
    classifications: new Set(),
    colorRange: {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    },
    firstColor: null,
    lastColor: null,
  };
}

function observePoint(record, header, profile) {
  const view = new DataView(
    record.buffer,
    record.byteOffset,
    record.byteLength,
  );
  const position = [0, 1, 2].map((axis) =>
    view.getInt32(axis * 4, true) * header.scale[axis] +
      header.offset[axis]);
  profile.firstPosition ??= position;
  profile.lastPosition = position;
  for (let axis = 0; axis < 3; axis += 1) {
    profile.bounds.min[axis] = Math.min(
      profile.bounds.min[axis],
      position[axis],
    );
    profile.bounds.max[axis] = Math.max(
      profile.bounds.max[axis],
      position[axis],
    );
  }
  const intensity = view.getUint16(12, true);
  profile.intensityRange[0] = Math.min(
    profile.intensityRange[0],
    intensity,
  );
  profile.intensityRange[1] = Math.max(
    profile.intensityRange[1],
    intensity,
  );
  profile.classifications.add(view.getUint8(15));
  if (header.pointFormat === 2 || header.pointFormat === 3) {
    const colorOffset = header.pointFormat === 2 ? 20 : 28;
    const color = [0, 1, 2].map((channel) =>
      view.getUint16(colorOffset + channel * 2, true));
    profile.firstColor ??= color;
    profile.lastColor = color;
    for (let channel = 0; channel < 3; channel += 1) {
      profile.colorRange.min[channel] = Math.min(
        profile.colorRange.min[channel],
        color[channel],
      );
      profile.colorRange.max[channel] = Math.max(
        profile.colorRange.max[channel],
        color[channel],
      );
    }
  }
  profile.points += 1;
}

function freezeProfile(profile, digest) {
  if (
    profile.points === 0 ||
    profile.firstPosition === null ||
    profile.lastPosition === null ||
    profile.firstColor === null ||
    profile.lastColor === null
  ) {
    throw new Error("LAS/LAZ point profile is incomplete");
  }
  return Object.freeze({
    pointRecords: profile.points,
    decodedBounds: Object.freeze({
      min: Object.freeze([...profile.bounds.min]),
      max: Object.freeze([...profile.bounds.max]),
    }),
    firstPosition: Object.freeze([...profile.firstPosition]),
    lastPosition: Object.freeze([...profile.lastPosition]),
    intensityRange: Object.freeze([...profile.intensityRange]),
    classifications: Object.freeze(
      [...profile.classifications].sort((left, right) => left - right),
    ),
    colorRange: Object.freeze({
      min: Object.freeze([...profile.colorRange.min]),
      max: Object.freeze([...profile.colorRange.max]),
    }),
    firstColor: Object.freeze([...profile.firstColor]),
    lastColor: Object.freeze([...profile.lastColor]),
    pointRecordSha256: digest,
  });
}

function decodeLas(bytes, header) {
  if (header.compressed) {
    throw new TypeError("uncompressed LAS input is required");
  }
  const hash = createHash("sha256");
  const profile = createProfile();
  for (let index = 0; index < header.pointRecords; index += 1) {
    const offset =
      header.pointDataOffset + index * header.pointRecordLength;
    const record = bytes.subarray(
      offset,
      offset + header.pointRecordLength,
    );
    hash.update(record);
    observePoint(record, header, profile);
  }
  return freezeProfile(profile, hash.digest("hex"));
}

async function decodeLaz(
  bytes,
  header,
  moduleFactory = createLazPerf,
) {
  if (!header.compressed) {
    throw new TypeError("compressed LAZ input is required");
  }
  const module = await moduleFactory();
  if (
    typeof module?._malloc !== "function" ||
    typeof module?._free !== "function" ||
    typeof module?.LASZip !== "function" ||
    !(module.HEAPU8 instanceof Uint8Array)
  ) {
    throw new TypeError("laz-perf module contract is invalid");
  }
  let filePointer = 0;
  let pointPointer = 0;
  let decoder = null;
  let wasmAllocationsReleased = false;
  const hash = createHash("sha256");
  const profile = createProfile();
  try {
    filePointer = module._malloc(bytes.byteLength);
    if (!Number.isSafeInteger(filePointer) || filePointer <= 0) {
      throw new Error("laz-perf input allocation failed");
    }
    module.HEAPU8.set(bytes, filePointer);
    decoder = new module.LASZip();
    decoder.open(filePointer, bytes.byteLength);
    const pointRecords = decoder.getCount();
    const pointRecordLength = decoder.getPointLength();
    const pointFormat = decoder.getPointFormat();
    if (
      pointRecords !== header.pointRecords ||
      pointRecordLength !== header.pointRecordLength ||
      pointFormat !== header.pointFormat
    ) {
      throw new Error("LAZ decoded profile differs from its header");
    }
    pointPointer = module._malloc(pointRecordLength);
    if (!Number.isSafeInteger(pointPointer) || pointPointer <= 0) {
      throw new Error("laz-perf point allocation failed");
    }
    for (let index = 0; index < pointRecords; index += 1) {
      decoder.getPoint(pointPointer);
      const record = module.HEAPU8.subarray(
        pointPointer,
        pointPointer + pointRecordLength,
      );
      hash.update(record);
      observePoint(record, header, profile);
    }
  } finally {
    if (pointPointer > 0) {
      module.HEAPU8.fill(
        0,
        pointPointer,
        pointPointer + header.pointRecordLength,
      );
      module._free(pointPointer);
    }
    if (decoder !== null) {
      decoder.delete();
    }
    if (filePointer > 0) {
      module.HEAPU8.fill(
        0,
        filePointer,
        filePointer + bytes.byteLength,
      );
      module._free(filePointer);
    }
    wasmAllocationsReleased = true;
  }
  return Object.freeze({
    profile: freezeProfile(profile, hash.digest("hex")),
    cleanup: Object.freeze({ wasmAllocationsReleased }),
  });
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function probeLasLazPointRecords({
  lasBytes,
  lazBytes,
  moduleFactory,
}) {
  const lasHeader = probeLasHeader(lasBytes);
  const lazHeader = probeLasHeader(lazBytes);
  if (
    lasHeader.compressed !== false ||
    lazHeader.compressed !== true ||
    lasHeader.formatVersion !== lazHeader.formatVersion ||
    lasHeader.pointFormat !== lazHeader.pointFormat ||
    lasHeader.pointRecordLength !== lazHeader.pointRecordLength ||
    lasHeader.pointRecords !== lazHeader.pointRecords ||
    !same(lasHeader.scale, lazHeader.scale) ||
    !same(lasHeader.offset, lazHeader.offset) ||
    !same(lasHeader.bounds, lazHeader.bounds)
  ) {
    throw new Error("LAS/LAZ paired headers are not equivalent");
  }
  const lasProfile = decodeLas(lasBytes, lasHeader);
  const lazResult = await decodeLaz(
    lazBytes,
    lazHeader,
    moduleFactory,
  );
  if (!same(lasProfile, lazResult.profile)) {
    throw new Error("LAS and decoded LAZ point records differ");
  }
  return Object.freeze({
    headers: Object.freeze({ las: lasHeader, laz: lazHeader }),
    profile: lasProfile,
    exactPointRecordParity: true,
    cleanup: lazResult.cleanup,
    decoder: LAZ_PERF_CANDIDATE,
  });
}
