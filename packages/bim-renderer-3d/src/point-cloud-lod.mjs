import {
  BIM_POINT_IDENTITY_AUTHORITY,
  BIM_POINT_RANGE_MAXIMUM_BYTES,
  BIM_POINT_RANGE_MAXIMUM_POINTS,
  BIM_POINT_RANGE_MEDIA_TYPE,
  decodeBimPointRange,
} from "./point-cloud.mjs";

export const BIM_POINT_HIERARCHY_CONTRACT =
  "bim-explorer-derived-point-hierarchy/0.1";
export const BIM_POINT_LOD_RANGE_RECEIPT =
  "bim-explorer-derived-point-lod-range-receipt/0.1";

const HEADER_BYTES = 48;
const POINT_STRIDE_BYTES = 16;
const SHA256 = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const DEFAULT_LEVEL_POINT_BUDGETS = Object.freeze([
  32_768,
  262_144,
]);
const DEFAULT_LIMITS = Object.freeze({
  maximumChunkCount: 65_536,
  maximumDepth: 6,
  maximumHierarchyBytes: 64 * 1024 * 1024,
  maximumMaterializedBytes: 40 * 1024 * 1024,
  maximumPoints: BIM_POINT_RANGE_MAXIMUM_POINTS,
  maximumPointsPerChunk: 65_536,
  maximumRangeBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
});

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ArrayBuffer.isView(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException(
      "operation aborted",
      "AbortError",
    );
  }
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function digest(bytes) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  const result = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes,
  );
  return bytesToHex(new Uint8Array(result));
}

function validatedLimits(overrides = {}) {
  const additions = plainRecord(
    overrides,
    "point hierarchy limits",
  );
  for (const key of Object.keys(additions)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(
        `point hierarchy limit ${key} is unsupported`,
      );
    }
  }
  const limits = { ...DEFAULT_LIMITS, ...additions };
  for (const [key, value] of Object.entries(limits)) {
    positiveInteger(value, `point hierarchy limits.${key}`);
  }
  if (
    limits.maximumDepth > DEFAULT_LIMITS.maximumDepth ||
    limits.maximumChunkCount > DEFAULT_LIMITS.maximumChunkCount ||
    limits.maximumHierarchyBytes >
      DEFAULT_LIMITS.maximumHierarchyBytes ||
    limits.maximumMaterializedBytes >
      DEFAULT_LIMITS.maximumMaterializedBytes ||
    limits.maximumPoints > BIM_POINT_RANGE_MAXIMUM_POINTS ||
    limits.maximumRangeBytes > BIM_POINT_RANGE_MAXIMUM_BYTES ||
    limits.maximumPointsPerChunk > limits.maximumPoints
  ) {
    throw new RangeError(
      "point hierarchy limits exceed the absolute profile",
    );
  }
  return Object.freeze(limits);
}

function validatedLevelBudgets(values, maximumPoints) {
  if (!Array.isArray(values) || values.length > 8) {
    throw new TypeError(
      "point hierarchy levelPointBudgets must be a bounded array",
    );
  }
  const budgets = [...new Set(values.map((value) => {
    positiveInteger(value, "point hierarchy level point budget");
    if (value > maximumPoints) {
      throw new RangeError(
        "point hierarchy level point budget exceeds its profile",
      );
    }
    return value;
  }))].sort((left, right) => left - right);
  return Object.freeze(budgets);
}

function validatedInput(value, limits) {
  const input = plainRecord(value, "point hierarchy input");
  const source = plainRecord(input.source, "point hierarchy source");
  const range = plainRecord(input.range, "point hierarchy range");
  if (
    !FINGERPRINT.test(source.fingerprint ?? "") ||
    typeof source.revisionId !== "string" ||
    source.revisionId.length === 0 ||
    source.semanticAuthority !== false
  ) {
    throw new TypeError("point hierarchy source identity is invalid");
  }
  if (
    typeof range.handleId !== "string" ||
    range.handleId.length === 0 ||
    range.mediaType !== BIM_POINT_RANGE_MEDIA_TYPE ||
    !SHA256.test(range.sha256 ?? "") ||
    !(range.bytes instanceof Uint8Array) ||
    range.bytes.byteLength <= HEADER_BYTES ||
    range.bytes.byteLength > limits.maximumRangeBytes
  ) {
    throw new TypeError("point hierarchy root range is invalid");
  }
  return Object.freeze({ range, source });
}

function hierarchyDepth(pointCount, maximumPointsPerChunk, maximumDepth) {
  let depth = 0;
  let cells = 1;
  while (
    depth < maximumDepth &&
    Math.ceil(pointCount / cells) > maximumPointsPerChunk
  ) {
    depth += 1;
    cells *= 8;
  }
  return depth;
}

function cellCoordinate(value, minimum, maximum, grid) {
  const span = maximum - minimum;
  if (!(span > 0)) {
    return 0;
  }
  return Math.min(
    grid - 1,
    Math.max(0, Math.floor(((value - minimum) / span) * grid)),
  );
}

function pointCell(view, pointIndex, decoded, grid) {
  const offset = HEADER_BYTES + pointIndex * POINT_STRIDE_BYTES;
  const x = cellCoordinate(
    view.getFloat32(offset, true),
    decoded.relativeBounds.min[0],
    decoded.relativeBounds.max[0],
    grid,
  );
  const y = cellCoordinate(
    view.getFloat32(offset + 4, true),
    decoded.relativeBounds.min[1],
    decoded.relativeBounds.max[1],
    grid,
  );
  const z = cellCoordinate(
    view.getFloat32(offset + 8, true),
    decoded.relativeBounds.min[2],
    decoded.relativeBounds.max[2],
    grid,
  );
  return x + grid * (y + grid * z);
}

function octreePath(cell, depth, grid) {
  if (depth === 0) {
    return "r";
  }
  const plane = grid * grid;
  const z = Math.floor(cell / plane);
  const remainder = cell - z * plane;
  const y = Math.floor(remainder / grid);
  const x = remainder - y * grid;
  const path = [];
  for (let bit = depth - 1; bit >= 0; bit -= 1) {
    const octant =
      ((x >> bit) & 1) |
      (((y >> bit) & 1) << 1) |
      (((z >> bit) & 1) << 2);
    path.push(octant);
  }
  return `r/${path.join("/")}`;
}

function chunkBounds(view, order, start, count, origin) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < count; offset += 1) {
    const pointIndex = order[start + offset];
    const pointOffset =
      HEADER_BYTES + pointIndex * POINT_STRIDE_BYTES;
    for (let axis = 0; axis < 3; axis += 1) {
      const coordinate =
        origin[axis] + view.getFloat32(pointOffset + axis * 4, true);
      minimum[axis] = Math.min(minimum[axis], coordinate);
      maximum[axis] = Math.max(maximum[axis], coordinate);
    }
  }
  return Object.freeze({
    min: Object.freeze(minimum),
    max: Object.freeze(maximum),
  });
}

function buildSpatialIndex(bytes, decoded, limits) {
  const depth = hierarchyDepth(
    decoded.pointCount,
    limits.maximumPointsPerChunk,
    limits.maximumDepth,
  );
  const grid = 2 ** depth;
  const cellCount = grid ** 3;
  const counts = new Uint32Array(cellCount);
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  for (let pointIndex = 0; pointIndex < decoded.pointCount; pointIndex += 1) {
    counts[pointCell(view, pointIndex, decoded, grid)] += 1;
  }
  const offsets = new Uint32Array(cellCount + 1);
  for (let cell = 0; cell < cellCount; cell += 1) {
    offsets[cell + 1] = offsets[cell] + counts[cell];
  }
  const cursors = offsets.slice(0, cellCount);
  const order = new Uint32Array(decoded.pointCount);
  for (let pointIndex = 0; pointIndex < decoded.pointCount; pointIndex += 1) {
    const cell = pointCell(view, pointIndex, decoded, grid);
    order[cursors[cell]] = pointIndex;
    cursors[cell] += 1;
  }
  cursors.fill(0);
  const chunks = [];
  for (let cell = 0; cell < cellCount; cell += 1) {
    const cellPoints = counts[cell];
    if (cellPoints === 0) {
      continue;
    }
    const pages = Math.ceil(
      cellPoints / limits.maximumPointsPerChunk,
    );
    for (let page = 0; page < pages; page += 1) {
      const start =
        offsets[cell] + page * limits.maximumPointsPerChunk;
      const count = Math.min(
        limits.maximumPointsPerChunk,
        offsets[cell + 1] - start,
      );
      const path = octreePath(cell, depth, grid);
      chunks.push(Object.freeze({
        bounds: chunkBounds(
          view,
          order,
          start,
          count,
          decoded.origin,
        ),
        count,
        id: pages === 1 ? path : `${path}:p${page}`,
        start,
      }));
    }
  }
  counts.fill(0);
  offsets.fill(0);
  if (chunks.length === 0 || chunks.length > limits.maximumChunkCount) {
    order.fill(0);
    throw new RangeError(
      "point hierarchy chunk count exceeds its bounded profile",
    );
  }
  return Object.freeze({ depth, grid, order, chunks });
}

function levelsFor(pointCount, chunks, budgets) {
  const strides = [];
  for (const budget of [...budgets, pointCount]) {
    const stride = Math.max(1, Math.ceil(pointCount / budget));
    if (!strides.includes(stride)) {
      strides.push(stride);
    }
  }
  strides.sort((left, right) => right - left);
  return Object.freeze(strides.map((stride, index) => {
    const points = chunks.reduce(
      (total, chunk) => total + Math.ceil(chunk.count / stride),
      0,
    );
    return Object.freeze({
      fullDetail: stride === 1,
      id: `lod:${index}`,
      index,
      pointCount: points,
      rangeBytes: HEADER_BYTES + points * POINT_STRIDE_BYTES,
      stride,
    });
  }));
}

function publicChunk(chunk) {
  return Object.freeze({
    bounds: chunk.bounds,
    id: chunk.id,
    pointCount: chunk.count,
  });
}

function stableManifestSeed({
  chunks,
  depth,
  levels,
  range,
  source,
}) {
  return {
    contract: BIM_POINT_HIERARCHY_CONTRACT,
    chunking: "derived-octree-leaf-pages",
    chunks: chunks.map(publicChunk),
    depth,
    identity: {
      authority: BIM_POINT_IDENTITY_AUTHORITY,
      rangeHandleId: range.handleId,
      rangeSha256: range.sha256,
      scope: "source-revision-and-root-range-digest",
    },
    levels,
    source: {
      fingerprint: source.fingerprint,
      revisionId: source.revisionId,
      semanticAuthority: false,
    },
  };
}

function selectedChunks(chunks, chunkIds) {
  if (chunkIds === undefined) {
    return chunks;
  }
  if (
    !Array.isArray(chunkIds) ||
    chunkIds.length === 0 ||
    chunkIds.length > chunks.length
  ) {
    throw new TypeError("point LOD chunkIds are invalid");
  }
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const unique = new Set();
  const selected = chunkIds.map((id) => {
    if (typeof id !== "string" || unique.has(id) || !byId.has(id)) {
      throw new TypeError("point LOD chunkIds are invalid");
    }
    unique.add(id);
    return byId.get(id);
  });
  return Object.freeze(selected);
}

export class DerivedPointCloudHierarchy {
  #busy = false;
  #bytes;
  #chunks;
  #disposed = false;
  #levels;
  #limits;
  #materializedBytes = 0;
  #order;
  #range;
  #reads = 0;

  constructor({
    bytes,
    chunks,
    levels,
    limits,
    manifest,
    order,
    range,
  }) {
    this.#bytes = bytes;
    this.#chunks = chunks;
    this.#levels = levels;
    this.#limits = limits;
    this.#order = order;
    this.#range = range;
    this.manifest = manifest;
  }

  get state() {
    const retainedBytes = this.#disposed
      ? 0
      : this.#bytes.byteLength + this.#order.byteLength;
    return Object.freeze({
      disposed: this.#disposed,
      hierarchyId: this.manifest.hierarchyId,
      indexBytes: this.#disposed ? 0 : this.#order.byteLength,
      materializedBytes: this.#materializedBytes,
      reads: this.#reads,
      retainedBytes,
      rootRangeBytes: this.#disposed ? 0 : this.#bytes.byteLength,
    });
  }

  async readLevel(levelId, { chunkIds, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("point hierarchy is disposed");
    }
    if (this.#busy) {
      throw invalidState("point hierarchy read is in progress");
    }
    const level = this.#levels.find((item) => item.id === levelId);
    if (level === undefined) {
      throw new RangeError("point hierarchy level is unavailable");
    }
    const chunks = selectedChunks(this.#chunks, chunkIds);
    this.#busy = true;
    let bytes = null;
    let pointIndices = null;
    try {
      aborted(signal);
      const allChunks = chunks.length === this.#chunks.length &&
        chunks.every((chunk, index) => chunk === this.#chunks[index]);
      const rootPassThrough = level.fullDetail && allChunks;
      const pointCount = rootPassThrough
        ? this.manifest.sourcePointCount
        : chunks.reduce(
            (total, chunk) =>
              total + Math.ceil(chunk.count / level.stride),
            0,
          );
      const rangeBytes = HEADER_BYTES + pointCount * POINT_STRIDE_BYTES;
      const identityMapBytes = rootPassThrough ? 0 : pointCount * 4;
      if (
        rangeBytes + identityMapBytes >
          this.#limits.maximumMaterializedBytes
      ) {
        throw new RangeError(
          "point LOD materialization exceeds its byte limit",
        );
      }
      if (rootPassThrough) {
        bytes = this.#bytes.slice();
      } else {
        bytes = new Uint8Array(rangeBytes);
        bytes.set(this.#bytes.subarray(0, HEADER_BYTES));
        new DataView(bytes.buffer).setUint32(12, pointCount, true);
        pointIndices = new Uint32Array(pointCount);
        let outputIndex = 0;
        for (const chunk of chunks) {
          for (
            let localIndex = 0;
            localIndex < chunk.count;
            localIndex += level.stride
          ) {
            const pointIndex = this.#order[chunk.start + localIndex];
            const sourceOffset =
              HEADER_BYTES + pointIndex * POINT_STRIDE_BYTES;
            bytes.set(
              this.#bytes.subarray(
                sourceOffset,
                sourceOffset + POINT_STRIDE_BYTES,
              ),
              HEADER_BYTES + outputIndex * POINT_STRIDE_BYTES,
            );
            pointIndices[outputIndex] = pointIndex;
            outputIndex += 1;
          }
        }
        if (outputIndex !== pointCount) {
          throw new Error("point LOD materialization count drifted");
        }
      }
      aborted(signal);
      const sha256 = rootPassThrough
        ? this.#range.sha256
        : await digest(bytes);
      const selectionSha256 = await digest(new TextEncoder().encode(
        chunks.map((chunk) => chunk.id).join("\n"),
      ));
      this.#reads += 1;
      this.#materializedBytes += rangeBytes + identityMapBytes;
      const lod = Object.freeze({
        chunkCount: chunks.length,
        fullDetail: level.fullDetail,
        hierarchyId: this.manifest.hierarchyId,
        levelId: level.id,
        levelIndex: level.index,
        pointCount,
        selectionSha256,
        stride: level.stride,
      });
      return Object.freeze({
        range: {
          byteLength: bytes.byteLength,
          bytes,
          handleId: rootPassThrough
            ? this.#range.handleId
            : `range:point-lod:${this.manifest.digest.slice(0, 16)}:` +
              `${level.index}:${selectionSha256.slice(0, 16)}`,
          identityRangeHandleId: this.#range.handleId,
          identityRangeSha256: this.#range.sha256,
          lod,
          mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
          pointIndices,
          sha256,
          sourcePointCount: this.manifest.sourcePointCount,
        },
        receipt: Object.freeze({
          schema: BIM_POINT_LOD_RANGE_RECEIPT,
          identityMapBytes,
          level: lod,
          rangeBytes,
          rootRangeSha256: this.#range.sha256,
        }),
      });
    } catch (error) {
      bytes?.fill(0);
      pointIndices?.fill(0);
      throw error;
    } finally {
      this.#busy = false;
    }
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#busy) {
      throw invalidState("point hierarchy read is in progress");
    }
    this.#bytes.fill(0);
    this.#order.fill(0);
    this.#disposed = true;
    return true;
  }
}

export async function createDerivedPointCloudHierarchy(
  inputValue,
  {
    levelPointBudgets = DEFAULT_LEVEL_POINT_BUDGETS,
    limits: limitOverrides = {},
    signal,
  } = {},
) {
  const limits = validatedLimits(limitOverrides);
  const input = validatedInput(inputValue, limits);
  const budgets = validatedLevelBudgets(
    levelPointBudgets,
    limits.maximumPoints,
  );
  const bytes = input.range.bytes.slice();
  let order = null;
  try {
    aborted(signal);
    const rootDigest = await digest(bytes);
    if (rootDigest !== input.range.sha256) {
      throw new Error(
        "point hierarchy root range digest does not match",
      );
    }
    const decoded = decodeBimPointRange(bytes, {
      maximumPayloadBytes: limits.maximumRangeBytes - HEADER_BYTES,
      maximumPoints: limits.maximumPoints,
    });
    const index = buildSpatialIndex(bytes, decoded, limits);
    order = index.order;
    const retainedBytes = bytes.byteLength + order.byteLength;
    if (retainedBytes > limits.maximumHierarchyBytes) {
      throw new RangeError(
        "point hierarchy retained bytes exceed their limit",
      );
    }
    const levels = levelsFor(
      decoded.pointCount,
      index.chunks,
      budgets,
    );
    const seed = stableManifestSeed({
      chunks: index.chunks,
      depth: index.depth,
      levels,
      range: input.range,
      source: input.source,
    });
    const manifestDigest = await digest(
      new TextEncoder().encode(JSON.stringify(seed)),
    );
    const manifest = Object.freeze({
      ...seed,
      digest: manifestDigest,
      hierarchyId: `point-hierarchy:${manifestDigest.slice(0, 24)}`,
      initialLevelId: levels[0].id,
      sourcePointCount: decoded.pointCount,
    });
    return new DerivedPointCloudHierarchy({
      bytes,
      chunks: index.chunks,
      levels,
      limits,
      manifest,
      order,
      range: Object.freeze({
        byteLength: bytes.byteLength,
        handleId: input.range.handleId,
        mediaType: input.range.mediaType,
        sha256: input.range.sha256,
      }),
    });
  } catch (error) {
    bytes.fill(0);
    order?.fill(0);
    throw error;
  }
}
