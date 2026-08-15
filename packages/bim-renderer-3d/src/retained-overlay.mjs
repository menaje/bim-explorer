export const BIM_RETAINED_OVERLAY_PACKET_SCHEMA =
  "bim-explorer-retained-overlay-packet/0.1";
export const BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE =
  "application/vnd.bim-explorer.retained-overlay-delta.v1";
export const BIM_RETAINED_OVERLAY_DELTA_RECEIPT =
  "bim-explorer-retained-overlay-delta-receipt/0.1";
export const BIM_RETAINED_OVERLAY_CHECKPOINT_RECEIPT =
  "bim-explorer-retained-overlay-checkpoint-receipt/0.1";

const MAGIC = "BEXOVL01";
const VERSION = 1;
const HEADER_BYTES = 24;
const MAXIMUM_IDENTIFIER_LENGTH = 512;
const LOCAL_PATH_PATTERN =
  /(?:file:|\/(?:Users|Volumes|private|tmp|home)\/|[A-Z]:\\|\\\\)/iu;
const OPERATION_KINDS = new Set(["upsert", "tombstone"]);
const OPERATION_ASPECTS = new Set([
  "entity",
  "geometry",
  "identity",
  "style",
  "transform",
]);

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

function exactKeys(value, allowed, label) {
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new TypeError(`${label}.${key} is unsupported`);
    }
  }
}

function boundedString(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAXIMUM_IDENTIFIER_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    LOCAL_PATH_PATTERN.test(value) ||
    value.startsWith("/") ||
    value.includes("\\")
  ) {
    throw new TypeError(`${label} must be a bounded path-free string`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((component) =>
      typeof component !== "number" || !Number.isFinite(component))
  ) {
    throw new TypeError(`${label} must contain ${length} finite numbers`);
  }
  return Object.freeze([...value]);
}

function bounds(value, label) {
  const item = plainRecord(value, label);
  exactKeys(item, ["min", "max"], label);
  const min = finiteVector(item.min, 3, `${label}.min`);
  const max = finiteVector(item.max, 3, `${label}.max`);
  if (min.some((component, axis) => component >= max[axis])) {
    throw new RangeError(`${label} must have positive extent`);
  }
  return Object.freeze({ min, max });
}

function transform(value, label) {
  return finiteVector(value, 16, label);
}

function color(value, label) {
  const result = finiteVector(value, 4, label);
  if (result.some((component) => component < 0 || component > 1)) {
    throw new RangeError(`${label} components must be between zero and one`);
  }
  return result;
}

function typedValues(value, Type, multiple, label) {
  const input = value instanceof Type
    ? value
    : Array.isArray(value)
      ? new Type(value)
      : null;
  if (
    input === null ||
    input.length === 0 ||
    input.length % multiple !== 0
  ) {
    throw new TypeError(
      `${label} must be a non-empty ${Type.name} multiple of ${multiple}`,
    );
  }
  return input;
}

function validateGeometry(value, label) {
  const geometry = plainRecord(value, label);
  exactKeys(geometry, ["positions", "normals", "indices"], label);
  const positions = typedValues(
    geometry.positions,
    Float32Array,
    3,
    `${label}.positions`,
  );
  const normals = typedValues(
    geometry.normals,
    Float32Array,
    3,
    `${label}.normals`,
  );
  const indices = typedValues(
    geometry.indices,
    Uint32Array,
    3,
    `${label}.indices`,
  );
  if (
    normals.length !== positions.length ||
    positions.some((component) => !Number.isFinite(component)) ||
    normals.some((component) => !Number.isFinite(component))
  ) {
    throw new TypeError(`${label} positions and normals are invalid`);
  }
  const vertexCount = positions.length / 3;
  if (indices.some((index) => index >= vertexCount)) {
    throw new RangeError(`${label} contains an out-of-range index`);
  }
  const vertices = new Float32Array(vertexCount * 6);
  for (let index = 0; index < vertexCount; index += 1) {
    vertices.set(positions.subarray(index * 3, index * 3 + 3), index * 6);
    vertices.set(normals.subarray(index * 3, index * 3 + 3), index * 6 + 3);
  }
  return {
    indices: Uint32Array.from(indices),
    vertices,
    vertexCount,
  };
}

function float32LittleEndianBytes(values) {
  const bytes = new Uint8Array(
    values.length * Float32Array.BYTES_PER_ELEMENT,
  );
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      values[index],
      true,
    );
  }
  return bytes;
}

function uint32LittleEndianBytes(values) {
  const bytes = new Uint8Array(
    values.length * Uint32Array.BYTES_PER_ELEMENT,
  );
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(
      index * Uint32Array.BYTES_PER_ELEMENT,
      values[index],
      true,
    );
  }
  return bytes;
}

function manifestEntry(value, index, binaryParts, binaryOffset) {
  const label = `retained overlay entry ${index}`;
  const entry = plainRecord(value, label);
  exactKeys(entry, [
    "operationId",
    "kind",
    "aspect",
    "renderId",
    "pickId",
    "nativeId",
    "externalIdentityToken",
    "bounds",
    "transform",
    "color",
    "visible",
    "geometry",
  ], label);
  const kind = boundedString(entry.kind, `${label}.kind`);
  const aspect = boundedString(entry.aspect, `${label}.aspect`);
  if (!OPERATION_KINDS.has(kind) || !OPERATION_ASPECTS.has(aspect)) {
    throw new TypeError(`${label} operation is unsupported`);
  }
  const result = {
    operationId: boundedString(entry.operationId, `${label}.operationId`),
    kind,
    aspect,
    renderId: boundedString(entry.renderId, `${label}.renderId`),
    bounds: bounds(entry.bounds, `${label}.bounds`),
  };
  if (kind === "tombstone") {
    if (
      aspect !== "entity" ||
      [
        "pickId",
        "nativeId",
        "externalIdentityToken",
        "transform",
        "color",
        "visible",
        "geometry",
      ].some((field) => entry[field] !== null && entry[field] !== undefined)
    ) {
      throw new TypeError(`${label} tombstone carries unsupported data`);
    }
    return { manifest: result, nextOffset: binaryOffset };
  }
  if (entry.pickId !== null && entry.pickId !== undefined) {
    result.pickId = boundedString(entry.pickId, `${label}.pickId`);
  }
  if (entry.nativeId !== null && entry.nativeId !== undefined) {
    result.nativeId = boundedString(entry.nativeId, `${label}.nativeId`);
  }
  if (
    entry.externalIdentityToken !== null &&
    entry.externalIdentityToken !== undefined
  ) {
    result.externalIdentityToken = boundedString(
      entry.externalIdentityToken,
      `${label}.externalIdentityToken`,
    );
  }
  if (entry.transform !== null && entry.transform !== undefined) {
    result.transform = transform(entry.transform, `${label}.transform`);
  }
  if (entry.color !== null && entry.color !== undefined) {
    result.color = color(entry.color, `${label}.color`);
  }
  if (entry.visible !== null && entry.visible !== undefined) {
    if (typeof entry.visible !== "boolean") {
      throw new TypeError(`${label}.visible must be boolean`);
    }
    result.visible = entry.visible;
  }
  if (entry.geometry !== null && entry.geometry !== undefined) {
    if (!["entity", "geometry"].includes(aspect)) {
      throw new TypeError(`${label} aspect cannot carry geometry`);
    }
    const geometry = validateGeometry(entry.geometry, `${label}.geometry`);
    const vertexBytes = float32LittleEndianBytes(geometry.vertices);
    const indexBytes = uint32LittleEndianBytes(geometry.indices);
    result.geometry = {
      vertexOffset: binaryOffset,
      vertexByteLength: vertexBytes.byteLength,
      vertexCount: geometry.vertexCount,
      indexOffset: binaryOffset + vertexBytes.byteLength,
      indexByteLength: indexBytes.byteLength,
      indexCount: geometry.indices.length,
    };
    binaryParts.push(vertexBytes, indexBytes);
    binaryOffset += vertexBytes.byteLength + indexBytes.byteLength;
  }
  const required = aspect === "geometry" || aspect === "entity";
  if (
    required &&
    (
      result.geometry === undefined ||
      result.pickId === undefined ||
      result.nativeId === undefined ||
      result.externalIdentityToken === undefined ||
      result.transform === undefined ||
      result.color === undefined ||
      result.visible === undefined
    )
  ) {
    throw new TypeError(`${label} geometry upsert is incomplete`);
  }
  if (aspect === "transform" && result.transform === undefined) {
    throw new TypeError(`${label} transform upsert is incomplete`);
  }
  if (
    aspect === "style" &&
    result.color === undefined &&
    result.visible === undefined
  ) {
    throw new TypeError(`${label} style upsert is incomplete`);
  }
  if (
    aspect === "identity" &&
    result.pickId === undefined &&
    result.nativeId === undefined &&
    result.externalIdentityToken === undefined
  ) {
    throw new TypeError(`${label} identity upsert is incomplete`);
  }
  return { manifest: result, nextOffset: binaryOffset };
}

function copyBytes(target, offset, source) {
  target.set(source, offset);
  return offset + source.byteLength;
}

export function encodeBimRetainedOverlayPacket({
  deltaId,
  sourceId,
  layerId,
  fromRevisionId,
  toRevisionId,
  sequence,
  entries,
} = {}) {
  for (const [label, value] of Object.entries({
    deltaId,
    sourceId,
    layerId,
    fromRevisionId,
    toRevisionId,
  })) {
    boundedString(value, `retained overlay packet.${label}`);
  }
  positiveInteger(sequence, "retained overlay packet.sequence");
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 4096) {
    throw new RangeError("retained overlay packet entries exceed their bound");
  }
  const binaryParts = [];
  let binaryByteLength = 0;
  const manifestEntries = entries.map((entry, index) => {
    const result = manifestEntry(
      entry,
      index,
      binaryParts,
      binaryByteLength,
    );
    binaryByteLength = result.nextOffset;
    return result.manifest;
  });
  const manifest = {
    schema: BIM_RETAINED_OVERLAY_PACKET_SCHEMA,
    deltaId,
    sourceId,
    layerId,
    fromRevisionId,
    toRevisionId,
    sequence,
    entries: manifestEntries,
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const padding = (4 - manifestBytes.byteLength % 4) % 4;
  const bytes = new Uint8Array(
    HEADER_BYTES + manifestBytes.byteLength + padding + binaryByteLength,
  );
  bytes.set(new TextEncoder().encode(MAGIC), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, VERSION, true);
  view.setUint32(12, manifestBytes.byteLength, true);
  view.setUint32(16, binaryByteLength, true);
  view.setUint32(20, entries.length, true);
  let offset = copyBytes(bytes, HEADER_BYTES, manifestBytes) + padding;
  for (const part of binaryParts) {
    offset = copyBytes(bytes, offset, part);
  }
  if (offset !== bytes.byteLength) {
    throw new Error("retained overlay packet byte accounting failed");
  }
  return bytes;
}

function jsonManifest(bytes, manifestByteLength) {
  let value;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(HEADER_BYTES, HEADER_BYTES + manifestByteLength),
      ),
    );
  } catch {
    throw new Error("retained overlay packet manifest is invalid UTF-8 JSON");
  }
  return plainRecord(value, "retained overlay packet manifest");
}

function binaryGeometry(bytes, binaryStart, value, label) {
  const geometry = plainRecord(value, label);
  exactKeys(geometry, [
    "vertexOffset",
    "vertexByteLength",
    "vertexCount",
    "indexOffset",
    "indexByteLength",
    "indexCount",
  ], label);
  for (const field of Object.keys(geometry)) {
    if (!Number.isSafeInteger(geometry[field]) || geometry[field] < 0) {
      throw new TypeError(`${label}.${field} must be a safe integer`);
    }
  }
  if (
    geometry.vertexCount <= 0 ||
    geometry.indexCount <= 0 ||
    geometry.indexCount % 3 !== 0 ||
    geometry.vertexByteLength !==
      geometry.vertexCount * 6 * Float32Array.BYTES_PER_ELEMENT ||
    geometry.indexByteLength !==
      geometry.indexCount * Uint32Array.BYTES_PER_ELEMENT ||
    geometry.indexOffset !==
      geometry.vertexOffset + geometry.vertexByteLength
  ) {
    throw new Error(`${label} byte layout is invalid`);
  }
  const vertexStart = binaryStart + geometry.vertexOffset;
  const vertexEnd = vertexStart + geometry.vertexByteLength;
  const indexStart = binaryStart + geometry.indexOffset;
  const indexEnd = indexStart + geometry.indexByteLength;
  if (
    vertexStart % 4 !== 0 ||
    indexStart % 4 !== 0 ||
    vertexEnd > bytes.byteLength ||
    indexEnd > bytes.byteLength
  ) {
    throw new RangeError(`${label} exceeds the packet payload`);
  }
  const vertices = new Float32Array(
    geometry.vertexByteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  const vertexView = new DataView(
    bytes.buffer,
    bytes.byteOffset + vertexStart,
    geometry.vertexByteLength,
  );
  for (let index = 0; index < vertices.length; index += 1) {
    vertices[index] = vertexView.getFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      true,
    );
  }
  const indices = new Uint32Array(geometry.indexCount);
  const indexView = new DataView(
    bytes.buffer,
    bytes.byteOffset + indexStart,
    geometry.indexByteLength,
  );
  for (let index = 0; index < indices.length; index += 1) {
    indices[index] = indexView.getUint32(
      index * Uint32Array.BYTES_PER_ELEMENT,
      true,
    );
  }
  if (
    vertices.some((component) => !Number.isFinite(component)) ||
    indices.some((index) => index >= geometry.vertexCount)
  ) {
    throw new Error(`${label} geometry values are invalid`);
  }
  return Object.freeze({
    vertices,
    indices,
    vertexCount: geometry.vertexCount,
    indexCount: geometry.indexCount,
    triangles: geometry.indexCount / 3,
    byteLength: geometry.vertexByteLength + geometry.indexByteLength,
  });
}

function decodedEntry(value, index, bytes, binaryStart) {
  const label = `retained overlay packet entry ${index}`;
  const entry = plainRecord(value, label);
  exactKeys(entry, [
    "operationId",
    "kind",
    "aspect",
    "renderId",
    "pickId",
    "nativeId",
    "externalIdentityToken",
    "bounds",
    "transform",
    "color",
    "visible",
    "geometry",
  ], label);
  const kind = boundedString(entry.kind, `${label}.kind`);
  const aspect = boundedString(entry.aspect, `${label}.aspect`);
  if (!OPERATION_KINDS.has(kind) || !OPERATION_ASPECTS.has(aspect)) {
    throw new TypeError(`${label} operation is unsupported`);
  }
  const result = {
    operationId: boundedString(entry.operationId, `${label}.operationId`),
    kind,
    aspect,
    renderId: boundedString(entry.renderId, `${label}.renderId`),
    bounds: bounds(entry.bounds, `${label}.bounds`),
    pickId: entry.pickId === undefined
      ? null
      : boundedString(entry.pickId, `${label}.pickId`),
    nativeId: entry.nativeId === undefined
      ? null
      : boundedString(entry.nativeId, `${label}.nativeId`),
    externalIdentityToken: entry.externalIdentityToken === undefined
      ? null
      : boundedString(
        entry.externalIdentityToken,
        `${label}.externalIdentityToken`,
      ),
    transform: entry.transform === undefined
      ? null
      : transform(entry.transform, `${label}.transform`),
    color: entry.color === undefined
      ? null
      : color(entry.color, `${label}.color`),
    visible: entry.visible === undefined ? null : entry.visible,
    geometry: entry.geometry === undefined
      ? null
      : binaryGeometry(bytes, binaryStart, entry.geometry, `${label}.geometry`),
  };
  if (result.visible !== null && typeof result.visible !== "boolean") {
    throw new TypeError(`${label}.visible must be boolean`);
  }
  if (kind === "tombstone") {
    if (
      aspect !== "entity" ||
      result.pickId !== null ||
      result.nativeId !== null ||
      result.externalIdentityToken !== null ||
      result.transform !== null ||
      result.color !== null ||
      result.visible !== null ||
      result.geometry !== null
    ) {
      throw new TypeError(`${label} tombstone carries unsupported data`);
    }
    return Object.freeze(result);
  }
  if (
    ["entity", "geometry"].includes(aspect) &&
    [
      result.pickId,
      result.nativeId,
      result.externalIdentityToken,
      result.transform,
      result.color,
      result.visible,
      result.geometry,
    ].some((item) => item === null)
  ) {
    throw new TypeError(`${label} geometry upsert is incomplete`);
  }
  if (aspect === "transform" && result.transform === null) {
    throw new TypeError(`${label} transform upsert is incomplete`);
  }
  if (aspect === "style" && result.color === null && result.visible === null) {
    throw new TypeError(`${label} style upsert is incomplete`);
  }
  if (
    aspect === "identity" &&
    result.pickId === null &&
    result.nativeId === null &&
    result.externalIdentityToken === null
  ) {
    throw new TypeError(`${label} identity upsert is incomplete`);
  }
  return Object.freeze(result);
}

export function decodeBimRetainedOverlayPacket(
  bytes,
  {
    maximumBytes = 8 * 1024 * 1024,
    maximumEntries = 4096,
  } = {},
) {
  positiveInteger(maximumBytes, "retained overlay maximumBytes");
  positiveInteger(maximumEntries, "retained overlay maximumEntries");
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("retained overlay packet must be a Uint8Array");
  }
  if (bytes.byteLength < HEADER_BYTES || bytes.byteLength > maximumBytes) {
    throw new RangeError("retained overlay packet exceeds its byte bound");
  }
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) {
    throw new Error("retained overlay packet magic is invalid");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const manifestByteLength = view.getUint32(12, true);
  const binaryByteLength = view.getUint32(16, true);
  const entryCount = view.getUint32(20, true);
  if (view.getUint32(8, true) !== VERSION) {
    throw new Error("retained overlay packet version is unsupported");
  }
  if (entryCount === 0 || entryCount > maximumEntries) {
    throw new RangeError("retained overlay packet entries exceed their bound");
  }
  const padding = (4 - manifestByteLength % 4) % 4;
  const binaryStart = HEADER_BYTES + manifestByteLength + padding;
  if (
    manifestByteLength === 0 ||
    binaryStart + binaryByteLength !== bytes.byteLength ||
    bytes.subarray(HEADER_BYTES + manifestByteLength, binaryStart)
      .some((value) => value !== 0)
  ) {
    throw new Error("retained overlay packet byte layout is invalid");
  }
  const manifest = jsonManifest(bytes, manifestByteLength);
  exactKeys(manifest, [
    "schema",
    "deltaId",
    "sourceId",
    "layerId",
    "fromRevisionId",
    "toRevisionId",
    "sequence",
    "entries",
  ], "retained overlay packet manifest");
  if (manifest.schema !== BIM_RETAINED_OVERLAY_PACKET_SCHEMA) {
    throw new Error("retained overlay packet schema is unsupported");
  }
  for (const field of [
    "deltaId",
    "sourceId",
    "layerId",
    "fromRevisionId",
    "toRevisionId",
  ]) {
    boundedString(manifest[field], `retained overlay packet.${field}`);
  }
  positiveInteger(manifest.sequence, "retained overlay packet.sequence");
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== entryCount) {
    throw new Error("retained overlay packet entry count is inconsistent");
  }
  const entries = Object.freeze(
    manifest.entries.map((entry, index) =>
      decodedEntry(entry, index, bytes, binaryStart)),
  );
  const usedRanges = manifest.entries.flatMap((entry) =>
    entry.geometry === undefined
      ? []
      : [{
          start: entry.geometry.vertexOffset,
          end:
            entry.geometry.indexOffset +
            entry.geometry.indexByteLength,
        }]);
  usedRanges.sort((left, right) => left.start - right.start);
  if (
    usedRanges.some((range, index) =>
      range.start !== (index === 0 ? 0 : usedRanges[index - 1].end)) ||
    (usedRanges.at(-1)?.end ?? 0) !== binaryByteLength
  ) {
    throw new Error("retained overlay packet geometry ranges are not canonical");
  }
  return Object.freeze({
    schema: BIM_RETAINED_OVERLAY_PACKET_SCHEMA,
    mediaType: BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
    byteLength: bytes.byteLength,
    binaryByteLength,
    deltaId: manifest.deltaId,
    sourceId: manifest.sourceId,
    layerId: manifest.layerId,
    fromRevisionId: manifest.fromRevisionId,
    toRevisionId: manifest.toRevisionId,
    sequence: manifest.sequence,
    entries,
  });
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256BimRetainedOverlayPacket(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("retained overlay digest input must be a Uint8Array");
  }
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  return bytesToHex(new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes),
  ));
}
