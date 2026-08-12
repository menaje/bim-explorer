import {
  identityMatrix,
  multiplyMatrices,
  nodeMatrix,
  transformedBounds,
  unionBounds,
} from "./math.mjs";
import {
  inspectBoundedPng,
} from "./png.mjs";
import {
  inspectBoundedJpeg,
} from "./jpeg.mjs";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const KHR_MESH_QUANTIZATION = "KHR_mesh_quantization";
const EXT_MESHOPT_COMPRESSION = "EXT_meshopt_compression";
const APPEARANCE_POLICIES = new Set([
  "strict",
  "bounded-omission",
]);
export const MESHOPT_DECODER_REQUIRED_MESSAGE =
  "EXT_meshopt_compression decoder is unavailable";
const COMPONENT_BYTES = new Map([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);
const DEFAULT_LIMITS = Object.freeze({
  maximumSourceBytes: 64 * 1024 * 1024,
  maximumJsonBytes: 4 * 1024 * 1024,
  maximumBufferBytes: 64 * 1024 * 1024,
  maximumMeshoptDecodedBytes: 64 * 1024 * 1024,
  maximumMeshoptCompressionRatio: 256,
  maximumTextures: 16,
  maximumDeclaredTextures: 1_024,
  maximumDeclaredImages: 1_024,
  maximumDeclaredSamplers: 1_024,
  maximumTextureSourceBytes: 8 * 1024 * 1024,
  maximumTextureDecodedBytes: 16 * 1024 * 1024,
  maximumProjectedTextureDecodedBytes: 8 * 1024 * 1024,
  maximumTextureDimension: 2_048,
  maximumTextureCompressionRatio: 256,
  maximumExternalResources: 16,
  maximumExternalResourceNameBytes: 128,
  maximumNodes: 4_096,
  maximumNodeDepth: 256,
  maximumMeshes: 4_096,
  maximumPrimitives: 16_384,
  maximumAccessors: 16_384,
  maximumBufferViews: 16_384,
  maximumVertices: 2_000_000,
  maximumTriangles: 4_000_000,
  maximumInstances: 100_000,
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
}

function arrayIndex(value, length, label) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= length
  ) {
    throw new RangeError(`${label} is outside its collection`);
  }
  return value;
}

function collection(value, limit, label, { nonEmpty = true } = {}) {
  if (
    !Array.isArray(value) ||
    (nonEmpty && value.length === 0) ||
    value.length > limit
  ) {
    throw new RangeError(`${label} exceeds the bounded profile`);
  }
  return value;
}

function validatedLimits(overrides = {}) {
  const value = plainRecord(overrides, "glTF limits");
  for (const key of Object.keys(value)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(`glTF limit ${key} is unsupported`);
    }
  }
  const limits = { ...DEFAULT_LIMITS, ...value };
  for (const [key, limit] of Object.entries(limits)) {
    positiveInteger(limit, `glTF limits.${key}`);
  }
  return limits;
}

function validatedAppearancePolicy(value) {
  if (!APPEARANCE_POLICIES.has(value)) {
    throw new TypeError(
      "glTF appearance policy must be strict or bounded-omission",
    );
  }
  return value;
}

function decodeJson(bytes, maximumJsonBytes, label) {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumJsonBytes) {
    throw new RangeError(`${label} exceeds the JSON byte limit`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  text = text.replace(/[\u0000\u0020]+$/u, "");
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  return plainRecord(document, label);
}

function parseContainer(bytes, limits) {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (
    bytes.byteLength >= 4 &&
    view.getUint32(0, true) === GLB_MAGIC
  ) {
    if (bytes.byteLength < 20) {
      throw new RangeError("GLB header or JSON chunk is truncated");
    }
    if (view.getUint32(4, true) !== 2) {
      throw new Error("GLB version is not 2");
    }
    if (view.getUint32(8, true) !== bytes.byteLength) {
      throw new RangeError("GLB declared length does not match input");
    }
    const chunks = [];
    let offset = 12;
    while (offset < bytes.byteLength) {
      if (offset + 8 > bytes.byteLength) {
        throw new RangeError("GLB chunk header is truncated");
      }
      const byteLength = view.getUint32(offset, true);
      const type = view.getUint32(offset + 4, true);
      offset += 8;
      if (
        byteLength === 0 ||
        byteLength % 4 !== 0 ||
        offset + byteLength > bytes.byteLength
      ) {
        throw new RangeError("GLB chunk length is invalid");
      }
      chunks.push({
        type,
        bytes: bytes.slice(offset, offset + byteLength),
      });
      offset += byteLength;
    }
    if (
      chunks.length === 0 ||
      chunks.length > 2 ||
      chunks[0].type !== JSON_CHUNK ||
      (chunks.length === 2 && chunks[1].type !== BIN_CHUNK)
    ) {
      throw new Error("GLB chunk profile is unsupported");
    }
    return {
      format: "glb",
      document: decodeJson(
        chunks[0].bytes,
        limits.maximumJsonBytes,
        "GLB JSON chunk",
      ),
      binaryChunk: chunks[1]?.bytes ?? null,
    };
  }
  return {
    format: "gltf",
    document: decodeJson(
      bytes,
      limits.maximumJsonBytes,
      "glTF document",
    ),
    binaryChunk: null,
  };
}

function decodeBase64(
  value,
  maximumBytes,
  label = "glTF buffer data URI",
) {
  if (
    value.length === 0 ||
    value.length > Math.ceil(maximumBytes / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
      .test(value)
  ) {
    throw new Error(`${label} has invalid base64`);
  }
  let binary;
  try {
    binary = globalThis.atob(value);
  } catch {
    throw new Error(`${label} has invalid base64`);
  }
  if (binary.length > maximumBytes) {
    throw new RangeError(`${label} exceeds its decoded byte limit`);
  }
  return Uint8Array.from(binary, (character) =>
    character.charCodeAt(0));
}

function externalResourceName(value, limits) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength >
      limits.maximumExternalResourceNameBytes ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:bin|jpe?g|png)$/u.test(value) ||
    [".bin", ".jpg", ".jpeg", ".png"].includes(value) ||
    value.includes("..")
  ) {
    throw new DOMException(
      "external glTF resource URI is outside the local bundle profile",
      "NotSupportedError",
    );
  }
  return value;
}

function externalResourceMap(values, limits) {
  if (!Array.isArray(values)) {
    throw new TypeError("glTF external resources must be an array");
  }
  if (values.length > limits.maximumExternalResources) {
    throw new RangeError(
      "glTF external resource count exceeds the limit",
    );
  }
  const resources = new Map();
  try {
    for (let index = 0; index < values.length; index += 1) {
      const value = plainRecord(
        values[index],
        `glTF external resources[${index}]`,
      );
      const uri = externalResourceName(value.uri, limits);
      if (
        !(value.bytes instanceof Uint8Array) ||
        value.bytes.byteLength === 0 ||
        value.bytes.byteLength > limits.maximumBufferBytes
      ) {
        throw new RangeError(
          `glTF external resource ${uri} exceeds its byte limit`,
        );
      }
      if (resources.has(uri)) {
        throw new Error("glTF external resource URI is duplicated");
      }
      resources.set(uri, Uint8Array.from(value.bytes));
    }
    return resources;
  } catch (error) {
    for (const bytes of resources.values()) {
      bytes.fill(0);
    }
    throw error;
  }
}

function loadBuffers(
  document,
  binaryChunk,
  format,
  limits,
  externalResources,
  placeholderBuffers = new Set(),
) {
  const buffers = collection(
    document.buffers,
    limits.maximumAccessors,
    "glTF buffers",
  );
  let totalBytes = 0;
  const usedExternalResources = new Set();
  const loaded = [];
  try {
    for (let index = 0; index < buffers.length; index += 1) {
      const bufferValue = buffers[index];
      const buffer = plainRecord(
        bufferValue,
        `glTF buffers[${index}]`,
      );
      positiveInteger(
        buffer.byteLength,
        `glTF buffers[${index}].byteLength`,
      );
      if (buffer.byteLength > limits.maximumBufferBytes) {
        throw new RangeError("glTF buffer exceeds its byte limit");
      }
      if (placeholderBuffers.has(index)) {
        if (buffer.uri !== undefined) {
          throw new DOMException(
            "EXT_meshopt_compression fallback bytes are unsupported",
            "NotSupportedError",
          );
        }
        if (format === "glb" && index === 0) {
          throw new Error(
            "EXT_meshopt_compression placeholder cannot be GLB buffer 0",
          );
        }
        loaded.push(null);
        continue;
      }
      let bytes;
      if (buffer.uri === undefined) {
        if (
          format !== "glb" ||
          index !== 0 ||
          binaryChunk === null
        ) {
          throw new Error("glTF external buffer URI is required");
        }
        if (
          binaryChunk.byteLength < buffer.byteLength ||
          binaryChunk.byteLength > buffer.byteLength + 3
        ) {
          throw new RangeError("GLB BIN chunk length is inconsistent");
        }
        bytes = binaryChunk.slice(0, buffer.byteLength);
      } else {
        if (typeof buffer.uri !== "string") {
          throw new TypeError("glTF buffer URI must be a string");
        }
        const match =
          /^data:application\/(?:octet-stream|gltf-buffer);base64,([A-Za-z0-9+/=]+)$/u
            .exec(buffer.uri);
        if (match !== null) {
          bytes = decodeBase64(match[1], limits.maximumBufferBytes);
        } else {
          const uri = externalResourceName(buffer.uri, limits);
          if (
            format !== "gltf" ||
            !uri.endsWith(".bin") ||
            !externalResources.has(uri)
          ) {
            throw new DOMException(
              "external glTF buffer URI is blocked",
              "NotSupportedError",
            );
          }
          bytes = externalResources.get(uri).slice();
          usedExternalResources.add(uri);
        }
        if (bytes.byteLength !== buffer.byteLength) {
          bytes.fill(0);
          throw new RangeError(
            "glTF data URI length does not match buffer.byteLength",
          );
        }
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > limits.maximumBufferBytes) {
        bytes.fill(0);
        throw new RangeError(
          "glTF aggregate buffer bytes exceed the limit",
        );
      }
      loaded.push(bytes);
    }
  } catch (error) {
    for (const bytes of loaded) {
      bytes?.fill(0);
    }
    throw error;
  }
  return {
    buffers: loaded,
    externalResourceBytes: [...externalResources.values()].reduce(
      (total, bytes) => total + bytes.byteLength,
      0,
    ),
    usedExternalResources,
  };
}

function meshoptDecoder(value) {
  if (value === null || value === undefined) {
    throw new DOMException(
      MESHOPT_DECODER_REQUIRED_MESSAGE,
      "NotSupportedError",
    );
  }
  const decoder = plainRecord(value, "meshopt decoder");
  if (
    decoder.id !== "meshoptimizer" ||
    decoder.version !== "1.2.0" ||
    decoder.supported !== true ||
    typeof decoder.decodeGltfBuffer !== "function"
  ) {
    throw new TypeError("meshopt decoder capability is invalid");
  }
  return decoder;
}

function meshoptCompressionProfile(
  document,
  limits,
  extensionsRequired,
  decoderCapability,
) {
  const enabled = extensionsRequired.includes(
    EXT_MESHOPT_COMPRESSION,
  );
  const buffers = collection(
    document.buffers,
    limits.maximumAccessors,
    "glTF buffers",
  );
  const bufferViews = collection(
    document.bufferViews,
    limits.maximumBufferViews,
    "glTF bufferViews",
  );
  const fallbackMarkers = new Set();
  for (let index = 0; index < buffers.length; index += 1) {
    const buffer = plainRecord(
      buffers[index],
      `glTF buffers[${index}]`,
    );
    if (buffer.extensions === undefined) {
      continue;
    }
    const extensions = plainRecord(
      buffer.extensions,
      `glTF buffers[${index}].extensions`,
    );
    if (
      Object.keys(extensions).length !== 1 ||
      extensions[EXT_MESHOPT_COMPRESSION] === undefined
    ) {
      throw new DOMException(
        "glTF buffer extensions are unsupported",
        "NotSupportedError",
      );
    }
    const marker = plainRecord(
      extensions[EXT_MESHOPT_COMPRESSION],
      `glTF buffers[${index}] meshopt extension`,
    );
    if (
      Object.keys(marker).length !== 1 ||
      marker.fallback !== true
    ) {
      throw new Error("meshopt fallback buffer marker is invalid");
    }
    fallbackMarkers.add(index);
  }

  const views = new Map();
  const parentBuffers = new Set();
  const compressedBuffers = new Set();
  const rangesByBuffer = new Map();
  let compressedBytes = 0;
  let decodedBytes = 0;
  for (let index = 0; index < bufferViews.length; index += 1) {
    const bufferView = plainRecord(
      bufferViews[index],
      `glTF bufferViews[${index}]`,
    );
    if (bufferView.extensions === undefined) {
      continue;
    }
    const extensions = plainRecord(
      bufferView.extensions,
      `glTF bufferViews[${index}].extensions`,
    );
    if (
      Object.keys(extensions).length !== 1 ||
      extensions[EXT_MESHOPT_COMPRESSION] === undefined
    ) {
      throw new DOMException(
        "glTF bufferView extensions are unsupported",
        "NotSupportedError",
      );
    }
    if (!enabled) {
      throw new Error(
        "EXT_meshopt_compression must be a required extension",
      );
    }
    const extension = plainRecord(
      extensions[EXT_MESHOPT_COMPRESSION],
      `glTF bufferViews[${index}] meshopt extension`,
    );
    const supportedFields = new Set([
      "buffer",
      "byteLength",
      "byteOffset",
      "byteStride",
      "count",
      "filter",
      "mode",
    ]);
    if (
      Object.keys(extension).some((field) =>
        !supportedFields.has(field))
    ) {
      throw new TypeError("meshopt bufferView fields are invalid");
    }
    const parentBuffer = arrayIndex(
      bufferView.buffer,
      buffers.length,
      `glTF bufferViews[${index}] fallback buffer`,
    );
    const compressedBuffer = arrayIndex(
      extension.buffer,
      buffers.length,
      `glTF bufferViews[${index}] compressed buffer`,
    );
    const parentOffset = bufferView.byteOffset ?? 0;
    const compressedOffset = extension.byteOffset ?? 0;
    for (const [value, label, allowZero] of [
      [bufferView.byteLength, "bufferView.byteLength", false],
      [parentOffset, "bufferView.byteOffset", true],
      [extension.byteLength, "extension.byteLength", false],
      [compressedOffset, "extension.byteOffset", true],
      [extension.byteStride, "extension.byteStride", false],
      [extension.count, "extension.count", false],
    ]) {
      if (
        !Number.isSafeInteger(value) ||
        value < (allowZero ? 0 : 1)
      ) {
        throw new RangeError(`meshopt ${label} is invalid`);
      }
    }
    const mode = extension.mode;
    const filter = extension.filter ?? "NONE";
    if (!["ATTRIBUTES", "TRIANGLES", "INDICES"].includes(mode)) {
      throw new DOMException(
        "meshopt compression mode is unsupported",
        "NotSupportedError",
      );
    }
    if (filter !== "NONE") {
      throw new DOMException(
        "meshopt compression filter is unsupported",
        "NotSupportedError",
      );
    }
    if (
      (bufferView.byteStride !== undefined &&
        bufferView.byteStride !== extension.byteStride) ||
      extension.count * extension.byteStride !==
        bufferView.byteLength ||
      (mode === "ATTRIBUTES" &&
        (extension.byteStride % 4 !== 0 ||
          extension.byteStride > 252)) ||
      (mode !== "ATTRIBUTES" &&
        ![2, 4].includes(extension.byteStride)) ||
      (mode === "TRIANGLES" && extension.count % 3 !== 0)
    ) {
      throw new RangeError("meshopt bufferView layout is invalid");
    }
    const parent = plainRecord(
      buffers[parentBuffer],
      `glTF buffers[${parentBuffer}]`,
    );
    const compressed = plainRecord(
      buffers[compressedBuffer],
      `glTF buffers[${compressedBuffer}]`,
    );
    positiveInteger(
      parent.byteLength,
      `glTF buffers[${parentBuffer}].byteLength`,
    );
    positiveInteger(
      compressed.byteLength,
      `glTF buffers[${compressedBuffer}].byteLength`,
    );
    if (
      parentOffset + bufferView.byteLength > parent.byteLength ||
      compressedOffset + extension.byteLength >
        compressed.byteLength
    ) {
      throw new RangeError("meshopt bufferView range is invalid");
    }
    const ratio = bufferView.byteLength / extension.byteLength;
    decodedBytes += bufferView.byteLength;
    compressedBytes += extension.byteLength;
    if (
      decodedBytes > limits.maximumMeshoptDecodedBytes ||
      ratio > limits.maximumMeshoptCompressionRatio
    ) {
      throw new RangeError(
        "meshopt decoded bytes exceed the bounded profile",
      );
    }
    const ranges = rangesByBuffer.get(compressedBuffer) ?? [];
    const end = compressedOffset + extension.byteLength;
    if (ranges.some((range) =>
      compressedOffset < range.end && end > range.start)) {
      throw new Error("meshopt compressed buffer ranges overlap");
    }
    ranges.push({ start: compressedOffset, end });
    rangesByBuffer.set(compressedBuffer, ranges);
    parentBuffers.add(parentBuffer);
    compressedBuffers.add(compressedBuffer);
    views.set(index, {
      compressedBuffer,
      compressedByteLength: extension.byteLength,
      compressedOffset,
      count: extension.count,
      decodedByteLength: bufferView.byteLength,
      filter,
      mode,
      stride: extension.byteStride,
    });
  }
  if (!enabled) {
    if (fallbackMarkers.size > 0) {
      throw new Error(
        "EXT_meshopt_compression fallback is not declared",
      );
    }
    return null;
  }
  if (views.size === 0) {
    throw new Error(
      "EXT_meshopt_compression has no compressed bufferView",
    );
  }
  for (const index of parentBuffers) {
    const buffer = buffers[index];
    if (
      buffer.uri !== undefined ||
      compressedBuffers.has(index) ||
      bufferViews.some((view, viewIndex) =>
        view.buffer === index && !views.has(viewIndex))
    ) {
      throw new DOMException(
        "meshopt fallback buffer profile is unsupported",
        "NotSupportedError",
      );
    }
  }
  for (const index of fallbackMarkers) {
    if (!parentBuffers.has(index)) {
      throw new Error("meshopt fallback buffer is unused");
    }
  }
  return {
    compressedBytes,
    decodedBytes,
    decoder: meshoptDecoder(decoderCapability),
    fallbackMarkers,
    placeholderBuffers: parentBuffers,
    views,
  };
}

function decodeMeshoptBufferViews(
  document,
  buffers,
  profile,
  ownedBuffers,
) {
  if (profile === null) {
    return;
  }
  for (const [viewIndex, item] of profile.views) {
    const sourceBuffer = buffers[item.compressedBuffer];
    if (!(sourceBuffer instanceof Uint8Array)) {
      throw new Error("meshopt compressed buffer is unavailable");
    }
    const source = sourceBuffer.subarray(
      item.compressedOffset,
      item.compressedOffset + item.compressedByteLength,
    );
    const decoded = new Uint8Array(item.decodedByteLength);
    try {
      profile.decoder.decodeGltfBuffer(
        decoded,
        item.count,
        item.stride,
        source,
        item.mode,
        item.filter,
      );
    } catch {
      decoded.fill(0);
      throw new Error("meshopt compressed buffer is malformed");
    }
    const bufferView = document.bufferViews[viewIndex];
    bufferView.buffer = buffers.length;
    bufferView.byteOffset = 0;
    bufferView.byteLength = decoded.byteLength;
    delete bufferView.extensions;
    buffers.push(decoded);
    ownedBuffers.push(decoded);
  }
}

function accessorLayout(
  document,
  buffers,
  accessorIndex,
  {
    allowNormalized = false,
    componentType,
    type,
    label,
    meshoptViews = null,
    vertexAttribute = false,
  },
) {
  const accessors = collection(
    document.accessors,
    DEFAULT_LIMITS.maximumAccessors,
    "glTF accessors",
  );
  const bufferViews = collection(
    document.bufferViews,
    DEFAULT_LIMITS.maximumBufferViews,
    "glTF bufferViews",
  );
  const accessor = plainRecord(
    accessors[arrayIndex(
      accessorIndex,
      accessors.length,
      `${label} accessor`,
    )],
    `${label} accessor`,
  );
  if (
    accessor.componentType !== componentType ||
    accessor.type !== type ||
    (
      accessor.normalized !== undefined &&
      typeof accessor.normalized !== "boolean"
    ) ||
    (accessor.normalized === true && !allowNormalized) ||
    accessor.sparse !== undefined
  ) {
    throw new Error(`${label} accessor profile is unsupported`);
  }
  positiveInteger(accessor.count, `${label} accessor.count`);
  const viewIndex = arrayIndex(
    accessor.bufferView,
    bufferViews.length,
    `${label} bufferView`,
  );
  const bufferView = plainRecord(
    bufferViews[viewIndex],
    `${label} bufferView`,
  );
  const bufferIndex = arrayIndex(
    bufferView.buffer,
    buffers.length,
    `${label} buffer`,
  );
  const byteOffset = bufferView.byteOffset ?? 0;
  const accessorOffset = accessor.byteOffset ?? 0;
  const componentBytes = COMPONENT_BYTES.get(componentType);
  const components = type === "VEC3"
    ? 3
    : type === "VEC2"
      ? 2
      : 1;
  const elementBytes = componentBytes * components;
  const stride = bufferView.byteStride ?? elementBytes;
  if (
    !Number.isSafeInteger(byteOffset) ||
    byteOffset < 0 ||
    !Number.isSafeInteger(accessorOffset) ||
    accessorOffset < 0 ||
    !Number.isSafeInteger(bufferView.byteLength) ||
    bufferView.byteLength <= 0 ||
    !Number.isSafeInteger(stride) ||
    stride < elementBytes ||
    stride > 252 ||
    stride % componentBytes !== 0 ||
    byteOffset % componentBytes !== 0 ||
    accessorOffset % componentBytes !== 0 ||
    (
      vertexAttribute &&
      (
        stride % 4 !== 0 ||
        (byteOffset + accessorOffset) % 4 !== 0
      )
    ) ||
    accessorOffset + stride * (accessor.count - 1) +
      elementBytes > bufferView.byteLength ||
    byteOffset + bufferView.byteLength > buffers[bufferIndex].byteLength
  ) {
    throw new RangeError(`${label} accessor byte layout is invalid`);
  }
  return {
    accessor,
    buffer: buffers[bufferIndex],
    meshopt: meshoptViews?.get(viewIndex) ?? null,
    offset: byteOffset + accessorOffset,
    stride,
    viewIndex,
  };
}

function normalizedInteger(value, componentType) {
  if (componentType === 5120) {
    return Math.max(value / 127, -1);
  }
  if (componentType === 5121) {
    return value / 255;
  }
  if (componentType === 5122) {
    return Math.max(value / 32_767, -1);
  }
  if (componentType === 5123) {
    return value / 65_535;
  }
  throw new TypeError("glTF normalized component type is unsupported");
}

function readVec3(
  document,
  buffers,
  index,
  label,
  {
    meshQuantization = false,
    meshoptViews = null,
    semantic,
  },
) {
  const accessors = collection(
    document.accessors,
    DEFAULT_LIMITS.maximumAccessors,
    "glTF accessors",
  );
  const accessor = plainRecord(
    accessors[arrayIndex(index, accessors.length, `${label} accessor`)],
    `${label} accessor`,
  );
  const normalized = accessor.normalized === true;
  const floatProfile =
    accessor.componentType === 5126 && !normalized;
  const quantizedPosition =
    semantic === "POSITION" &&
    meshQuantization &&
    [5120, 5121, 5122, 5123].includes(
      accessor.componentType,
    );
  const quantizedNormal =
    semantic === "NORMAL" &&
    meshQuantization &&
    normalized &&
    [5120, 5122].includes(accessor.componentType);
  if (
    accessor.type !== "VEC3" ||
    (!floatProfile && !quantizedPosition && !quantizedNormal)
  ) {
    throw new Error(`${label} accessor profile is unsupported`);
  }
  const layout = accessorLayout(
    document,
    buffers,
    index,
    {
      allowNormalized: quantizedPosition || quantizedNormal,
      componentType: accessor.componentType,
      type: "VEC3",
      label,
      meshoptViews,
      vertexAttribute: true,
    },
  );
  if (
    layout.meshopt !== null &&
    layout.meshopt.mode !== "ATTRIBUTES"
  ) {
    throw new Error(`${label} meshopt mode is not ATTRIBUTES`);
  }
  const result = new Float32Array(layout.accessor.count * 3);
  const view = new DataView(
    layout.buffer.buffer,
    layout.buffer.byteOffset,
    layout.buffer.byteLength,
  );
  const componentBytes = COMPONENT_BYTES.get(
    accessor.componentType,
  );
  const read = accessor.componentType === 5120
    ? (offset) => view.getInt8(offset)
    : accessor.componentType === 5121
      ? (offset) => view.getUint8(offset)
      : accessor.componentType === 5122
        ? (offset) => view.getInt16(offset, true)
        : accessor.componentType === 5123
          ? (offset) => view.getUint16(offset, true)
          : (offset) => view.getFloat32(offset, true);
  for (let item = 0; item < layout.accessor.count; item += 1) {
    const offset = layout.offset + item * layout.stride;
    for (let component = 0; component < 3; component += 1) {
      const raw = read(offset + component * componentBytes);
      const value = normalized
        ? normalizedInteger(raw, accessor.componentType)
        : raw;
      if (!Number.isFinite(value)) {
        throw new Error(`${label} contains a non-finite value`);
      }
      result[item * 3 + component] = value;
    }
    if (quantizedNormal) {
      const resultOffset = item * 3;
      const length = Math.hypot(
        result[resultOffset],
        result[resultOffset + 1],
        result[resultOffset + 2],
      );
      if (length < Number.EPSILON) {
        throw new RangeError(`${label} contains a zero normal`);
      }
      result[resultOffset] /= length;
      result[resultOffset + 1] /= length;
      result[resultOffset + 2] /= length;
    }
  }
  return result;
}

function readTexcoords(
  document,
  buffers,
  index,
  label,
  meshoptViews = null,
) {
  const accessors = collection(
    document.accessors,
    DEFAULT_LIMITS.maximumAccessors,
    "glTF accessors",
  );
  const accessor = plainRecord(
    accessors[arrayIndex(index, accessors.length, `${label} accessor`)],
    `${label} accessor`,
  );
  const normalizedIntegerProfile =
    accessor.normalized === true &&
    [5121, 5123].includes(accessor.componentType);
  const floatProfile =
    accessor.componentType === 5126 &&
    accessor.normalized !== true;
  if (
    accessor.type !== "VEC2" ||
    (!floatProfile && !normalizedIntegerProfile)
  ) {
    throw new Error(`${label} accessor profile is unsupported`);
  }
  const layout = accessorLayout(
    document,
    buffers,
    index,
    {
      allowNormalized: normalizedIntegerProfile,
      componentType: accessor.componentType,
      type: "VEC2",
      label,
      meshoptViews,
      vertexAttribute: true,
    },
  );
  if (
    layout.meshopt !== null &&
    layout.meshopt.mode !== "ATTRIBUTES"
  ) {
    throw new Error(`${label} meshopt mode is not ATTRIBUTES`);
  }
  const result = new Float32Array(layout.accessor.count * 2);
  const view = new DataView(
    layout.buffer.buffer,
    layout.buffer.byteOffset,
    layout.buffer.byteLength,
  );
  const componentBytes = COMPONENT_BYTES.get(
    accessor.componentType,
  );
  const read = accessor.componentType === 5121
    ? (offset) => view.getUint8(offset)
    : accessor.componentType === 5123
      ? (offset) => view.getUint16(offset, true)
      : (offset) => view.getFloat32(offset, true);
  for (let item = 0; item < layout.accessor.count; item += 1) {
    const offset = layout.offset + item * layout.stride;
    for (let component = 0; component < 2; component += 1) {
      const raw = read(offset + component * componentBytes);
      const value = normalizedIntegerProfile
        ? normalizedInteger(raw, accessor.componentType)
        : raw;
      if (!Number.isFinite(value)) {
        throw new Error(`${label} contains a non-finite value`);
      }
      result[item * 2 + component] = value;
    }
  }
  return result;
}

function readIndices(
  document,
  buffers,
  index,
  vertexCount,
  label,
  meshoptViews = null,
) {
  const accessors = collection(
    document.accessors,
    DEFAULT_LIMITS.maximumAccessors,
    "glTF accessors",
  );
  const accessor = plainRecord(
    accessors[arrayIndex(index, accessors.length, `${label} accessor`)],
    `${label} accessor`,
  );
  if (![5121, 5123, 5125].includes(accessor.componentType)) {
    throw new Error(`${label} component type is unsupported`);
  }
  const layout = accessorLayout(
    document,
    buffers,
    index,
    {
      componentType: accessor.componentType,
      type: "SCALAR",
      label,
      meshoptViews,
    },
  );
  if (
    layout.meshopt !== null &&
    !["TRIANGLES", "INDICES"].includes(layout.meshopt.mode)
  ) {
    throw new Error(`${label} meshopt mode is not index data`);
  }
  if (layout.accessor.count % 3 !== 0) {
    throw new Error(`${label} count is not triangles`);
  }
  const result = new Uint32Array(layout.accessor.count);
  const view = new DataView(
    layout.buffer.buffer,
    layout.buffer.byteOffset,
    layout.buffer.byteLength,
  );
  const getter = accessor.componentType === 5121
    ? (offset) => view.getUint8(offset)
    : accessor.componentType === 5123
      ? (offset) => view.getUint16(offset, true)
      : (offset) => view.getUint32(offset, true);
  for (let item = 0; item < layout.accessor.count; item += 1) {
    const value = getter(layout.offset + item * layout.stride);
    if (value >= vertexCount) {
      throw new RangeError(`${label} contains an out-of-range index`);
    }
    result[item] = value;
  }
  return result;
}

function localBounds(positions) {
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(
        bounds.min[axis],
        positions[offset + axis],
      );
      bounds.max[axis] = Math.max(
        bounds.max[axis],
        positions[offset + axis],
      );
    }
  }
  return bounds;
}

function createTextureResolver(
  document,
  format,
  limits,
  externalResources,
  buffers,
  appearancePolicy,
) {
  const omissionEnabled =
    appearancePolicy === "bounded-omission";
  const textures = collection(
    document.textures ?? [],
    omissionEnabled
      ? limits.maximumDeclaredTextures
      : limits.maximumTextures,
    "glTF textures",
    { nonEmpty: false },
  );
  const images = collection(
    document.images ?? [],
    omissionEnabled
      ? limits.maximumDeclaredImages
      : limits.maximumTextures,
    "glTF images",
    { nonEmpty: false },
  );
  const samplers = collection(
    document.samplers ?? [],
    omissionEnabled
      ? limits.maximumDeclaredSamplers
      : limits.maximumTextures,
    "glTF samplers",
    { nonEmpty: false },
  );
  const bufferViews = collection(
    document.bufferViews ?? [],
    limits.maximumBufferViews,
    "glTF bufferViews",
    { nonEmpty: false },
  );
  const bufferDeclarations = collection(
    document.buffers ?? [],
    limits.maximumAccessors,
    "glTF buffers",
    { nonEmpty: false },
  );
  const projected = [];
  const projectedByTexture = new Map();
  const omittedExternalImages = new Set();
  const omittedImageBytes = new Map();
  const omittedImageIndices = new Set();
  const omittedMaterialIndices = new Set();
  const omittedReasons = new Map();
  const omittedRoles = new Map();
  const omittedTextureIndices = new Set();
  const usedExternalImages = new Set();
  const usedExternalBufferViewImages = new Set();
  const usedEmbeddedImages = new Set();
  const embeddedStorageProfiles = new Set();
  let decodedBytes = 0;
  let embeddedImageBytes = 0;
  let omittedTextureReferences = 0;
  let sourceBytes = 0;

  const increment = (map, key) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  const recordOmission = ({
    imageIndex = null,
    materialIndex,
    reason,
    role,
    sourceByteLength = 0,
    textureIndex = null,
  }) => {
    omittedMaterialIndices.add(materialIndex);
    increment(omittedReasons, reason);
    increment(omittedRoles, role);
    if (textureIndex !== null) {
      omittedTextureIndices.add(textureIndex);
      omittedTextureReferences += 1;
    }
    if (imageIndex !== null) {
      omittedImageIndices.add(imageIndex);
      if (!omittedImageBytes.has(imageIndex)) {
        omittedImageBytes.set(imageIndex, sourceByteLength);
      }
    }
  };

  const embeddedImage = (image, imageIndex) => {
    if (typeof image.uri === "string") {
      const mediaType = image.uri.startsWith("data:image/png;base64,")
        ? "image/png"
        : image.uri.startsWith("data:image/jpeg;base64,")
          ? "image/jpeg"
          : null;
      if (mediaType === null) {
        return null;
      }
      const prefix = `data:${mediaType};base64,`;
      if (
        image.mimeType !== undefined &&
        image.mimeType !== mediaType
      ) {
        throw new DOMException(
          "glTF embedded image MIME type is inconsistent",
          "NotSupportedError",
        );
      }
      return {
        bytes: decodeBase64(
          image.uri.slice(prefix.length),
          limits.maximumTextureSourceBytes,
          `glTF images[${imageIndex}] ${
            mediaType === "image/png" ? "PNG" : "JPEG"
          } data URI`,
        ),
        mediaType,
        owned: true,
        storage: "data-uri",
      };
    }
    if (image.bufferView === undefined) {
      return null;
    }
    if (!["image/png", "image/jpeg"].includes(image.mimeType)) {
      return null;
    }
    const mediaLabel = image.mimeType === "image/png" ? "PNG" : "JPEG";
    const viewIndex = arrayIndex(
      image.bufferView,
      bufferViews.length,
      `glTF images[${imageIndex}].bufferView`,
    );
    const bufferView = plainRecord(
      bufferViews[viewIndex],
      `glTF bufferViews[${viewIndex}]`,
    );
    if (
      bufferView.byteStride !== undefined ||
      bufferView.target !== undefined ||
      bufferView.extensions !== undefined
    ) {
      throw new DOMException(
        `glTF embedded ${mediaLabel} bufferView profile is unsupported`,
        "NotSupportedError",
      );
    }
    const bufferIndex = arrayIndex(
      bufferView.buffer,
      buffers.length,
      `glTF bufferViews[${viewIndex}].buffer`,
    );
    let storage;
    if (format === "glb") {
      storage = "glb-buffer-view";
    } else {
      const bufferDeclaration = plainRecord(
        bufferDeclarations[bufferIndex],
        `glTF buffers[${bufferIndex}]`,
      );
      const uri = bufferDeclaration.uri;
      let externalUri;
      try {
        externalUri = externalResourceName(uri, limits);
      } catch {
        throw new DOMException(
          `${mediaLabel} image bufferView requires a local external buffer`,
          "NotSupportedError",
        );
      }
      if (
        !externalUri.endsWith(".bin") ||
        !externalResources.has(externalUri)
      ) {
        throw new DOMException(
          `${mediaLabel} image bufferView requires a local external buffer`,
          "NotSupportedError",
        );
      }
      storage = "gltf-external-buffer-view";
    }
    const buffer = buffers[bufferIndex];
    const byteOffset = bufferView.byteOffset ?? 0;
    const byteLength = bufferView.byteLength;
    if (
      !(buffer instanceof Uint8Array) ||
      !Number.isSafeInteger(byteOffset) ||
      byteOffset < 0 ||
      !Number.isSafeInteger(byteLength) ||
      byteLength <= 0 ||
      byteLength > limits.maximumTextureSourceBytes ||
      byteOffset + byteLength > buffer.byteLength
    ) {
      throw new RangeError(
        `glTF embedded ${mediaLabel} bufferView range is invalid`,
      );
    }
    for (const [accessorIndex, accessorValue] of
      (document.accessors ?? []).entries()) {
      const accessor = plainRecord(
        accessorValue,
        `glTF accessors[${accessorIndex}]`,
      );
      const accessorViewIndex = arrayIndex(
        accessor.bufferView,
        bufferViews.length,
        `glTF accessors[${accessorIndex}].bufferView`,
      );
      const accessorView = plainRecord(
        bufferViews[accessorViewIndex],
        `glTF bufferViews[${accessorViewIndex}]`,
      );
      if (accessorViewIndex === viewIndex) {
        throw new Error(
          `glTF embedded ${mediaLabel} bufferView is also used by an accessor`,
        );
      }
      const accessorOffset = accessorView.byteOffset ?? 0;
      const accessorLength = accessorView.byteLength;
      if (
        accessorView.buffer === bufferIndex &&
        Number.isSafeInteger(accessorOffset) &&
        Number.isSafeInteger(accessorLength) &&
        byteOffset < accessorOffset + accessorLength &&
        byteOffset + byteLength > accessorOffset
      ) {
        throw new Error(
          `glTF embedded ${mediaLabel} bufferView overlaps accessor bytes`,
        );
      }
    }
    return {
      bytes: buffer.slice(byteOffset, byteOffset + byteLength),
      mediaType: image.mimeType,
      owned: true,
      storage,
    };
  };

  const resolveSampler = (index, label) => {
    if (index === undefined) {
      return Object.freeze({
        magFilter: 9729,
        minFilter: 9987,
        wrapS: 10497,
        wrapT: 10497,
      });
    }
    const sampler = plainRecord(
      samplers[arrayIndex(index, samplers.length, `${label} sampler`)],
      `${label} sampler`,
    );
    if (sampler.extensions !== undefined) {
      throw new DOMException(
        "glTF texture sampler extensions are unsupported",
        "NotSupportedError",
      );
    }
    const result = {
      magFilter: sampler.magFilter ?? 9729,
      minFilter: sampler.minFilter ?? 9987,
      wrapS: sampler.wrapS ?? 10497,
      wrapT: sampler.wrapT ?? 10497,
    };
    if (
      ![9728, 9729].includes(result.magFilter) ||
      ![9728, 9729, 9984, 9985, 9986, 9987]
        .includes(result.minFilter) ||
      ![33071, 33648, 10497].includes(result.wrapS) ||
      ![33071, 33648, 10497].includes(result.wrapT)
    ) {
      throw new RangeError("glTF texture sampler is invalid");
    }
    return Object.freeze(result);
  };

  const omitFeature = ({ materialIndex, reason, role }) => {
    if (!omissionEnabled) {
      throw new DOMException(
        "glTF material appearance profile is unsupported",
        "NotSupportedError",
      );
    }
    recordOmission({ materialIndex, reason, role });
  };

  const validateOmittedImage = (bytes, mediaType) => {
    try {
      (
        mediaType === "image/png"
          ? inspectBoundedPng
          : inspectBoundedJpeg
      )(bytes, {
        maximumCompressionRatio:
          limits.maximumTextureCompressionRatio,
        maximumDecodedBytes: limits.maximumTextureDecodedBytes,
        maximumDimension: limits.maximumTextureDimension,
        maximumSourceBytes: limits.maximumTextureSourceBytes,
      });
    } catch (error) {
      if (error?.name !== "NotSupportedError") {
        throw error;
      }
    }
  };

  const omitTexture = (
    value,
    label,
    {
      cacheProjection = false,
      materialIndex,
      reason,
      role,
    },
  ) => {
    if (!omissionEnabled) {
      throw new DOMException(
        "glTF textured material profile is unsupported",
        "NotSupportedError",
      );
    }
    const info = plainRecord(value, `${label} texture info`);
    const texCoord = info.texCoord ?? 0;
    if (
      !Number.isSafeInteger(texCoord) ||
      texCoord < 0
    ) {
      throw new TypeError(`${label} texture coordinates are invalid`);
    }
    if (info.extensions !== undefined) {
      plainRecord(info.extensions, `${label} texture extensions`);
    }
    const textureIndex = arrayIndex(
      info.index,
      textures.length,
      `${label} texture`,
    );
    const texture = plainRecord(
      textures[textureIndex],
      `glTF textures[${textureIndex}]`,
    );
    if (texture.extensions !== undefined) {
      plainRecord(
        texture.extensions,
        `glTF textures[${textureIndex}].extensions`,
      );
    }
    resolveSampler(
      texture.sampler,
      `glTF textures[${textureIndex}]`,
    );
    const imageIndex = arrayIndex(
      texture.source,
      images.length,
      `glTF textures[${textureIndex}].source`,
    );
    const image = plainRecord(
      images[imageIndex],
      `glTF images[${imageIndex}]`,
    );
    const embedded = embeddedImage(image, imageIndex);
    let bytes = embedded?.bytes ?? null;
    let mediaType = embedded?.mediaType ?? null;
    let uri = null;
    try {
      if (bytes === null) {
        uri = externalResourceName(image.uri, limits);
        mediaType = uri.endsWith(".png")
          ? "image/png"
          : uri.endsWith(".jpg") || uri.endsWith(".jpeg")
            ? "image/jpeg"
            : null;
        if (
          format !== "gltf" ||
          mediaType === null ||
          (
            image.mimeType !== undefined &&
            image.mimeType !== mediaType
          ) ||
          !externalResources.has(uri)
        ) {
          throw new DOMException(
            "glTF omitted image is outside the bounded image profile",
            "NotSupportedError",
          );
        }
        bytes = externalResources.get(uri);
        omittedExternalImages.add(uri);
      } else if (
        embedded.storage === "gltf-external-buffer-view"
      ) {
        usedExternalBufferViewImages.add(imageIndex);
      }
      validateOmittedImage(bytes, mediaType);
      recordOmission({
        imageIndex,
        materialIndex,
        reason,
        role,
        sourceByteLength: bytes.byteLength,
        textureIndex,
      });
      if (cacheProjection) {
        projectedByTexture.set(textureIndex, null);
      }
      return null;
    } finally {
      if (embedded?.owned === true) {
        embedded.bytes.fill(0);
      }
    }
  };

  const resolve = (value, label, {
    materialIndex,
    role = "baseColorTexture",
  } = {}) => {
    const info = plainRecord(value, `${label} texture info`);
    const texCoord = info.texCoord ?? 0;
    if (
      info.extensions !== undefined ||
      !Number.isSafeInteger(texCoord) ||
      texCoord < 0 ||
      (omissionEnabled && texCoord !== 0)
    ) {
      if (omissionEnabled) {
        return omitTexture(value, label, {
          cacheProjection: true,
          materialIndex,
          reason: "unsupported-texture-coordinate-profile",
          role,
        });
      }
      throw new DOMException(
        "glTF base color texture transform is unsupported",
        "NotSupportedError",
      );
    }
    const sourceTextureIndex = arrayIndex(
      info.index,
      textures.length,
      `${label} texture`,
    );
    if (projectedByTexture.has(sourceTextureIndex)) {
      const cached = projectedByTexture.get(sourceTextureIndex);
      if (cached !== null) {
        if (texCoord !== 0) {
          throw new DOMException(
            "only glTF TEXCOORD_0 is supported",
            "NotSupportedError",
          );
        }
        return cached;
      }
    }
    const texture = plainRecord(
      textures[sourceTextureIndex],
      `glTF textures[${sourceTextureIndex}]`,
    );
    if (texture.extensions !== undefined) {
      if (omissionEnabled) {
        return omitTexture(value, label, {
          cacheProjection: true,
          materialIndex,
          reason: "unsupported-texture-extension",
          role,
        });
      }
      throw new DOMException(
        "glTF texture extensions are unsupported",
        "NotSupportedError",
      );
    }
    const imageIndex = arrayIndex(
      texture.source,
      images.length,
      `glTF textures[${sourceTextureIndex}].source`,
    );
    const image = plainRecord(
      images[imageIndex],
      `glTF images[${imageIndex}]`,
    );
    if (texCoord !== 0) {
      throw new DOMException(
        "only glTF TEXCOORD_0 is supported",
        "NotSupportedError",
      );
    }
    const embedded = embeddedImage(image, imageIndex);
    let bytes = embedded?.bytes ?? null;
    let mediaType = embedded?.mediaType ?? null;
    let sourceKind = embedded?.storage ?? "external-resource";
    let uri = null;
    if (bytes === null) {
      uri = externalResourceName(image.uri, limits);
      mediaType = uri.endsWith(".png")
        ? "image/png"
        : uri.endsWith(".jpg") || uri.endsWith(".jpeg")
          ? "image/jpeg"
          : null;
      if (
        format !== "gltf" ||
        mediaType === null ||
        (
          image.mimeType !== undefined &&
          image.mimeType !== mediaType
        ) ||
        !externalResources.has(uri)
      ) {
        throw new DOMException(
          "glTF base color image is outside the bounded image profile",
          "NotSupportedError",
        );
      }
      bytes = externalResources.get(uri);
    }
    try {
      let imageProfile;
      try {
        imageProfile = (
          mediaType === "image/png"
            ? inspectBoundedPng
            : inspectBoundedJpeg
        )(bytes, {
          maximumCompressionRatio:
            limits.maximumTextureCompressionRatio,
          maximumDecodedBytes: limits.maximumTextureDecodedBytes,
          maximumDimension: limits.maximumTextureDimension,
          maximumSourceBytes: limits.maximumTextureSourceBytes,
        });
      } catch (error) {
        if (
          omissionEnabled &&
          error?.name === "NotSupportedError"
        ) {
          if (uri === null) {
            if (sourceKind === "gltf-external-buffer-view") {
              usedExternalBufferViewImages.add(imageIndex);
            }
          } else {
            omittedExternalImages.add(uri);
          }
          recordOmission({
            imageIndex,
            materialIndex,
            reason: "unsupported-image-profile",
            role,
            sourceByteLength: bytes.byteLength,
            textureIndex: sourceTextureIndex,
          });
          projectedByTexture.set(sourceTextureIndex, null);
          return null;
        }
        throw error;
      }
      const nextDecodedBytes =
        decodedBytes + imageProfile.decodedBytes;
      const nextSourceBytes = sourceBytes + bytes.byteLength;
      if (
        projected.length >= limits.maximumTextures ||
        nextDecodedBytes > limits.maximumTextureDecodedBytes ||
        nextSourceBytes > limits.maximumTextureSourceBytes ||
        (
          omissionEnabled &&
          nextDecodedBytes >
            limits.maximumProjectedTextureDecodedBytes
        )
      ) {
        if (omissionEnabled) {
          if (uri === null) {
            if (sourceKind === "gltf-external-buffer-view") {
              usedExternalBufferViewImages.add(imageIndex);
            }
          } else {
            omittedExternalImages.add(uri);
          }
          recordOmission({
            imageIndex,
            materialIndex,
            reason: "projection-budget",
            role,
            sourceByteLength: bytes.byteLength,
            textureIndex: sourceTextureIndex,
          });
          projectedByTexture.set(sourceTextureIndex, null);
          return null;
        }
        throw new RangeError(
          "glTF textures exceed the bounded profile",
        );
      }
      decodedBytes = nextDecodedBytes;
      sourceBytes = nextSourceBytes;
      const result = Object.freeze({
        bytes: Uint8Array.from(bytes),
        decodedBytes: imageProfile.decodedBytes,
        height: imageProfile.height,
        index: projected.length,
        mediaType: imageProfile.mediaType,
        sampler: resolveSampler(
          texture.sampler,
          `glTF textures[${sourceTextureIndex}]`,
        ),
        sourceImageIndex: imageIndex,
        sourceKind,
        sourceTextureIndex,
        ...(uri === null ? {} : { uri }),
        width: imageProfile.width,
      });
      projected.push(result);
      projectedByTexture.set(sourceTextureIndex, result);
      if (uri === null) {
        if (!usedEmbeddedImages.has(imageIndex)) {
          embeddedImageBytes += bytes.byteLength;
        }
        usedEmbeddedImages.add(imageIndex);
        embeddedStorageProfiles.add(sourceKind);
        if (sourceKind === "gltf-external-buffer-view") {
          usedExternalBufferViewImages.add(imageIndex);
        }
      } else {
        usedExternalImages.add(uri);
      }
      return result;
    } finally {
      if (embedded?.owned === true) {
        bytes.fill(0);
      }
    }
  };

  const finalize = (usedExternalBuffers) => {
    const declaredExternalImages = new Set();
    const declaredEmbeddedImages = new Set();
    const declaredEmbeddedMediaTypes = new Set();
    for (const [index, imageValue] of images.entries()) {
      const image = plainRecord(
        imageValue,
        `glTF images[${index}]`,
      );
      if (
        typeof image.uri === "string" &&
        !image.uri.startsWith("data:")
      ) {
        const uri = externalResourceName(image.uri, limits);
        if (!/\.(?:jpe?g|png)$/u.test(uri)) {
          throw new DOMException(
            "external glTF image URI is unsupported",
            "NotSupportedError",
          );
        }
        declaredExternalImages.add(uri);
      } else if (
        (typeof image.uri === "string" &&
          /^(?:data:image\/(?:jpeg|png);base64,)/u.test(image.uri)) ||
        (image.bufferView !== undefined &&
          ["image/png", "image/jpeg"].includes(image.mimeType))
      ) {
        declaredEmbeddedImages.add(index);
        declaredEmbeddedMediaTypes.add(
          image.mimeType ?? (
            image.uri.startsWith("data:image/png;")
              ? "image/png"
              : "image/jpeg"
          ),
        );
      }
    }
    const accountedExternalImages = new Set([
      ...usedExternalImages,
      ...omittedExternalImages,
    ]);
    const accountedEmbeddedImages = new Set([
      ...usedEmbeddedImages,
      ...[...omittedImageIndices].filter((imageIndex) =>
        declaredEmbeddedImages.has(imageIndex)),
    ]);
    if (
      declaredExternalImages.size !==
        accountedExternalImages.size ||
      [...declaredExternalImages].some((uri) =>
        !accountedExternalImages.has(uri))
    ) {
      throw new DOMException(
        "external glTF images require bounded base color projection",
        "NotSupportedError",
      );
    }
    if (
      declaredEmbeddedImages.size !==
        accountedEmbeddedImages.size ||
      [...declaredEmbeddedImages].some((index) =>
        !accountedEmbeddedImages.has(index))
    ) {
      const label = declaredEmbeddedMediaTypes.size === 1 &&
          declaredEmbeddedMediaTypes.has("image/png")
        ? "embedded PNG images"
        : declaredEmbeddedMediaTypes.size === 1 &&
            declaredEmbeddedMediaTypes.has("image/jpeg")
          ? "embedded JPEG images"
          : "embedded PNG/JPEG images";
      throw new DOMException(
        `${label} require bounded base color projection`,
        "NotSupportedError",
      );
    }
    const used = new Set([
      ...usedExternalBuffers,
      ...usedExternalImages,
      ...omittedExternalImages,
    ]);
    if (
      used.size !== externalResources.size ||
      [...externalResources.keys()].some((uri) => !used.has(uri))
    ) {
      throw new Error("glTF bundle contains an unused external resource");
    }
    const totalEmbeddedImageBytes = [
      ...omittedImageBytes,
    ].reduce(
      (total, [imageIndex, byteLength]) =>
        total + (
          usedEmbeddedImages.has(imageIndex) ||
          !declaredEmbeddedImages.has(imageIndex)
            ? 0
            : byteLength
        ),
      embeddedImageBytes,
    );
    const sortedCounts = (map) => Object.freeze(
      Object.fromEntries(
        [...map].sort(([left], [right]) =>
          left.localeCompare(right)),
      ),
    );
    const omissionCount = [...omittedRoles.values()].reduce(
      (total, count) => total + count,
      0,
    );
    return Object.freeze({
      decodedBytes,
      embeddedImageBytes: totalEmbeddedImageBytes,
      embeddedImageResources: accountedEmbeddedImages.size,
      embeddedStorageProfiles: Object.freeze(
        [...embeddedStorageProfiles].sort(),
      ),
      externalImageResources: accountedExternalImages.size,
      externalBufferViewImageResources:
        usedExternalBufferViewImages.size,
      externalResourceUris: Object.freeze([...used].sort()),
      omissions: omissionCount === 0
        ? null
        : Object.freeze({
            schema:
              "bim-explorer-gltf-appearance-omissions/1",
            policy: appearancePolicy,
            declaredImages: images.length,
            declaredTextures: textures.length,
            projectedTextures: projected.length,
            materialFeatures: omissionCount,
            materials: omittedMaterialIndices.size,
            textureReferences: omittedTextureReferences,
            uniqueImages: omittedImageIndices.size,
            uniqueTextures: omittedTextureIndices.size,
            sourceBytes: [...omittedImageBytes.values()].reduce(
              (total, byteLength) => total + byteLength,
              0,
            ),
            reasons: sortedCounts(omittedReasons),
            roles: sortedCounts(omittedRoles),
          }),
      sourceBytes,
      textures: Object.freeze(projected),
    });
  };

  const dispose = () => {
    for (const texture of projected) {
      texture.bytes.fill(0);
    }
  };

  return Object.freeze({
    appearancePolicy,
    dispose,
    finalize,
    omitFeature,
    omitTexture,
    resolve,
  });
}

function materialProjection(
  document,
  index,
  textureResolver,
  limits,
) {
  if (index === undefined) {
    return Object.freeze({
      color: Object.freeze([1, 1, 1, 1]),
      texture: null,
    });
  }
  const materials = collection(
    document.materials,
    limits.maximumPrimitives,
    "glTF materials",
    { nonEmpty: false },
  );
  const material = plainRecord(
    materials[arrayIndex(index, materials.length, "glTF material")],
    "glTF material",
  );
  const pbr = material.pbrMetallicRoughness === undefined
    ? null
    : plainRecord(
        material.pbrMetallicRoughness,
        "glTF material pbrMetallicRoughness",
      );
  const color =
    pbr?.baseColorFactor ??
    [1, 1, 1, 1];
  if (
    !Array.isArray(color) ||
    color.length !== 4 ||
    color.some((value) =>
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1)
  ) {
    throw new TypeError("glTF material baseColorFactor is invalid");
  }
  const alphaProfileSupported =
    (material.alphaMode ?? "OPAQUE") === "OPAQUE" &&
    color[3] === 1 &&
    material.alphaCutoff === undefined;
  let texture = null;
  if (pbr?.baseColorTexture !== undefined) {
    texture =
      textureResolver.appearancePolicy === "bounded-omission" &&
      !alphaProfileSupported
        ? textureResolver.omitTexture(
            pbr.baseColorTexture,
            "glTF material baseColorTexture",
            {
              cacheProjection: true,
              materialIndex: index,
              reason: "unsupported-alpha-profile",
              role: "baseColorTexture",
            },
          )
        : textureResolver.resolve(
            pbr.baseColorTexture,
            "glTF material baseColorTexture",
            {
              materialIndex: index,
              role: "baseColorTexture",
            },
          );
  }
  if (
    texture !== null &&
    textureResolver.appearancePolicy === "strict" &&
    (
      (material.alphaMode ?? "OPAQUE") !== "OPAQUE" ||
      color[3] !== 1 ||
      material.alphaCutoff !== undefined ||
      material.extensions !== undefined ||
      pbr.extensions !== undefined ||
      pbr.metallicRoughnessTexture !== undefined ||
      material.normalTexture !== undefined ||
      material.occlusionTexture !== undefined ||
      material.emissiveTexture !== undefined
    )
  ) {
    throw new DOMException(
      "glTF textured material profile is unsupported",
      "NotSupportedError",
    );
  }
  if (textureResolver.appearancePolicy === "bounded-omission") {
    for (const [role, value, label] of [
      [
        "metallicRoughnessTexture",
        pbr?.metallicRoughnessTexture,
        "glTF material metallicRoughnessTexture",
      ],
      [
        "normalTexture",
        material.normalTexture,
        "glTF material normalTexture",
      ],
      [
        "occlusionTexture",
        material.occlusionTexture,
        "glTF material occlusionTexture",
      ],
      [
        "emissiveTexture",
        material.emissiveTexture,
        "glTF material emissiveTexture",
      ],
    ]) {
      if (value !== undefined) {
        textureResolver.omitTexture(value, label, {
          materialIndex: index,
          reason: "unsupported-material-role",
          role,
        });
      }
    }
    for (const [owner, prefix] of [
      [material.extensions, "material"],
      [pbr?.extensions, "pbr"],
    ]) {
      if (owner === undefined) {
        continue;
      }
      const extensions = plainRecord(
        owner,
        `glTF ${prefix} extensions`,
      );
      for (const [name, extensionValue] of
        Object.entries(extensions)) {
        const extension = plainRecord(
          extensionValue,
          `glTF ${prefix} extension ${name}`,
        );
        textureResolver.omitFeature({
          materialIndex: index,
          reason: "unsupported-material-extension",
          role: `extension:${name}`,
        });
        for (const [field, role] of [
          ["transmissionTexture", "transmissionTexture"],
          ["thicknessTexture", "thicknessTexture"],
        ]) {
          if (extension[field] !== undefined) {
            textureResolver.omitTexture(
              extension[field],
              `glTF ${name}.${field}`,
              {
                materialIndex: index,
                reason: "unsupported-material-extension-role",
                role,
              },
            );
          }
        }
      }
    }
  }
  return Object.freeze({
    color: Object.freeze([...color]),
    texture,
  });
}

function primitiveRecord(
  document,
  buffers,
  meshIndex,
  primitiveIndex,
  limits,
  extensionsRequired,
  meshoptViews,
  textureResolver,
) {
  const mesh = plainRecord(
    document.meshes[meshIndex],
    `glTF meshes[${meshIndex}]`,
  );
  const primitives = collection(
    mesh.primitives,
    limits.maximumPrimitives,
    `glTF meshes[${meshIndex}].primitives`,
  );
  const primitive = plainRecord(
    primitives[primitiveIndex],
    `glTF mesh ${meshIndex} primitive ${primitiveIndex}`,
  );
  const label = `glTF mesh ${meshIndex} primitive ${primitiveIndex}`;
  if (
    (primitive.mode ?? 4) !== 4 ||
    primitive.indices === undefined ||
    primitive.targets !== undefined ||
    primitive.extensions !== undefined
  ) {
    throw new DOMException(
      `${label} uses an unsupported primitive profile`,
      "NotSupportedError",
    );
  }
  const attributes = plainRecord(
    primitive.attributes,
    `${label}.attributes`,
  );
  if (
    attributes.POSITION === undefined ||
    attributes.NORMAL === undefined
  ) {
    throw new Error(`${label} requires POSITION and NORMAL`);
  }
  const positions = readVec3(
    document,
    buffers,
    attributes.POSITION,
    `${label} POSITION`,
    {
      meshQuantization:
        extensionsRequired.includes(KHR_MESH_QUANTIZATION),
      meshoptViews,
      semantic: "POSITION",
    },
  );
  const normals = readVec3(
    document,
    buffers,
    attributes.NORMAL,
    `${label} NORMAL`,
    {
      meshQuantization:
        extensionsRequired.includes(KHR_MESH_QUANTIZATION),
      meshoptViews,
      semantic: "NORMAL",
    },
  );
  if (
    positions.length !== normals.length ||
    positions.length === 0
  ) {
    throw new Error(`${label} vertex attribute counts do not match`);
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    if (
      Math.hypot(
        normals[offset],
        normals[offset + 1],
        normals[offset + 2],
      ) < Number.EPSILON
    ) {
      throw new RangeError(`${label} contains a zero normal`);
    }
  }
  const material = materialProjection(
    document,
    primitive.material,
    textureResolver,
    limits,
  );
  if (
    material.texture !== null &&
    attributes.TEXCOORD_0 === undefined
  ) {
    throw new Error(`${label} requires TEXCOORD_0`);
  }
  const texcoords = material.texture === null
    ? null
    : readTexcoords(
        document,
        buffers,
        attributes.TEXCOORD_0,
        `${label} TEXCOORD_0`,
        meshoptViews,
      );
  if (
    material.texture !== null &&
    (
      texcoords.length / 2 !== positions.length / 3
    )
  ) {
    throw new Error(
      `${label} texture coordinate counts do not match`,
    );
  }
  const indices = readIndices(
    document,
    buffers,
    primitive.indices,
    positions.length / 3,
    `${label} indices`,
    meshoptViews,
  );
  return {
    key: `${meshIndex}:${primitiveIndex}`,
    meshIndex,
    primitiveIndex,
    positions,
    normals,
    indices,
    bounds: localBounds(positions),
    color: material.color,
    texcoords,
    textureIndex: material.texture?.index ?? null,
  };
}

function boundedName(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError("glTF node name must be a bounded string");
  }
  return value;
}

function validateAsset(document, limits) {
  const asset = plainRecord(document.asset, "glTF asset");
  if (asset.version !== "2.0") {
    throw new DOMException(
      "only glTF 2.0 is supported",
      "NotSupportedError",
    );
  }
  if (
    asset.minVersion !== undefined &&
    asset.minVersion !== "2.0"
  ) {
    throw new DOMException(
      "glTF minVersion is unsupported",
      "NotSupportedError",
    );
  }
  const extensionList = (value, label) => {
    if (value === undefined) {
      return [];
    }
    if (
      !Array.isArray(value) ||
      value.length > 64 ||
      value.some((name) =>
        typeof name !== "string" ||
        name.length === 0 ||
        name.length > 128 ||
        !/^[A-Z][A-Z0-9]*_[A-Za-z0-9_]+$/u.test(name)) ||
      new Set(value).size !== value.length
    ) {
      throw new TypeError(`${label} is invalid`);
    }
    return [...value];
  };
  const extensionsUsed = extensionList(
    document.extensionsUsed,
    "glTF extensionsUsed",
  );
  const extensionsRequired = extensionList(
    document.extensionsRequired,
    "glTF extensionsRequired",
  );
  if (
    extensionsRequired.some((name) =>
      ![
        KHR_MESH_QUANTIZATION,
        EXT_MESHOPT_COMPRESSION,
      ].includes(name))
  ) {
    throw new DOMException(
      "required glTF extensions are unsupported",
      "NotSupportedError",
    );
  }
  if (
    extensionsRequired.some((name) =>
      !extensionsUsed.includes(name))
  ) {
    throw new Error(
      "required glTF extension is not declared as used",
    );
  }
  if (
    extensionsUsed.includes(KHR_MESH_QUANTIZATION) &&
    !extensionsRequired.includes(KHR_MESH_QUANTIZATION)
  ) {
    throw new Error(
      "KHR_mesh_quantization must be a required extension",
    );
  }
  if (
    extensionsUsed.includes(EXT_MESHOPT_COMPRESSION) &&
    !extensionsRequired.includes(EXT_MESHOPT_COMPRESSION)
  ) {
    throw new Error(
      "EXT_meshopt_compression must be a required extension",
    );
  }
  for (const field of ["animations", "skins"]) {
    if (
      document[field] !== undefined &&
      (
        !Array.isArray(document[field]) ||
        document[field].length > 0
      )
    ) {
      throw new DOMException(
        `glTF ${field} are unsupported`,
        "NotSupportedError",
      );
    }
  }
  if (document.images !== undefined) {
    const images = collection(
      document.images,
      limits.maximumPrimitives,
      "glTF images",
      { nonEmpty: false },
    );
    const imageBufferViews = collection(
      document.bufferViews ?? [],
      limits.maximumBufferViews,
      "glTF bufferViews",
      { nonEmpty: false },
    );
    for (let index = 0; index < images.length; index += 1) {
      const image = plainRecord(
        images[index],
        `glTF images[${index}]`,
      );
      const hasUri = image.uri !== undefined;
      const hasBufferView = image.bufferView !== undefined;
      if (hasUri === hasBufferView) {
        throw new TypeError(
          "glTF image requires exactly one URI or bufferView",
        );
      }
      if (hasUri) {
        if (
          typeof image.uri !== "string" ||
          image.uri.length === 0
        ) {
          throw new TypeError("glTF image URI is invalid");
        }
        const dataImage =
          /^data:(image\/[A-Za-z0-9.+-]+);base64,/u.exec(
            image.uri,
          );
        if (
          dataImage !== null &&
          image.mimeType !== undefined &&
          image.mimeType !== dataImage[1]
        ) {
          throw new Error("glTF image MIME type is inconsistent");
        }
        if (
          dataImage === null
        ) {
          const uri = externalResourceName(image.uri, limits);
          if (!/\.(?:jpe?g|png)$/u.test(uri)) {
            throw new DOMException(
              "external glTF image URI is unsupported",
              "NotSupportedError",
            );
          }
        }
      } else {
        arrayIndex(
          image.bufferView,
          imageBufferViews.length,
          `glTF images[${index}].bufferView`,
        );
        if (![
          "image/png",
          "image/jpeg",
        ].includes(image.mimeType)) {
          throw new DOMException(
            "glTF embedded image MIME or bufferView is unsupported",
            "NotSupportedError",
          );
        }
      }
    }
  }
  return {
    asset,
    extensionsRequired,
    extensionsUsed,
  };
}

export function parseGltfReferenceProfile(
  input,
  {
    appearancePolicy: appearancePolicyValue = "strict",
    limits: limitOverrides = {},
    meshoptDecoder: decoderCapability = null,
    resources: externalResourceValues = [],
  } = {},
) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("glTF input must be a Uint8Array");
  }
  const appearancePolicy = validatedAppearancePolicy(
    appearancePolicyValue,
  );
  const limits = validatedLimits(limitOverrides);
  if (
    input.byteLength === 0 ||
    input.byteLength > limits.maximumSourceBytes
  ) {
    throw new RangeError("glTF input exceeds the source byte limit");
  }
  const bytes = Uint8Array.from(input);
  const ownedBuffers = [];
  let appearance = null;
  let textureResolver = null;
  const externalResources = externalResourceMap(
    externalResourceValues,
    limits,
  );
  try {
    const aggregateSourceBytes = [...externalResources.values()].reduce(
      (total, resource) => total + resource.byteLength,
      input.byteLength,
    );
    if (aggregateSourceBytes > limits.maximumSourceBytes) {
      throw new RangeError(
        "glTF source bundle exceeds the source byte limit",
      );
    }
    const {
      format,
      document,
      binaryChunk,
    } = parseContainer(bytes, limits);
    const {
      asset,
      extensionsRequired,
      extensionsUsed,
    } = validateAsset(document, limits);
    const compression = meshoptCompressionProfile(
      document,
      limits,
      extensionsRequired,
      decoderCapability,
    );
    const nodes = collection(
      document.nodes,
      limits.maximumNodes,
      "glTF nodes",
    );
    const meshes = collection(
      document.meshes,
      limits.maximumMeshes,
      "glTF meshes",
    );
    collection(
      document.accessors,
      limits.maximumAccessors,
      "glTF accessors",
    );
    collection(
      document.bufferViews,
      limits.maximumBufferViews,
      "glTF bufferViews",
    );
    const scenes = collection(
      document.scenes,
      limits.maximumNodes,
      "glTF scenes",
    );
    const sceneIndex = document.scene ?? 0;
    const scene = plainRecord(
      scenes[arrayIndex(
        sceneIndex,
        scenes.length,
        "glTF default scene",
      )],
      "glTF default scene",
    );
    const roots = collection(
      scene.nodes,
      limits.maximumNodes,
      "glTF scene roots",
    );
    const loadedBuffers = loadBuffers(
      document,
      binaryChunk,
      format,
      limits,
      externalResources,
      compression?.placeholderBuffers,
    );
    const buffers = loadedBuffers.buffers;
    ownedBuffers.push(
      ...buffers.filter((buffer) => buffer instanceof Uint8Array),
    );
    decodeMeshoptBufferViews(
      document,
      buffers,
      compression,
      ownedBuffers,
    );
    textureResolver = createTextureResolver(
      document,
      format,
      limits,
      externalResources,
      buffers,
      appearancePolicy,
    );
    const records = new Map();
    const occurrences = [];
    const parentByNode = new Map();
    const visiting = new Set();
    const visited = new Set();
    let vertices = 0;
    let triangles = 0;
    const bounds = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };

    const visit = (nodeIndex, parentMatrix, depth, parentIndex) => {
      arrayIndex(nodeIndex, nodes.length, "glTF node");
      if (depth > limits.maximumNodeDepth) {
        throw new RangeError("glTF node depth exceeds the limit");
      }
      if (visiting.has(nodeIndex)) {
        throw new Error("glTF node graph contains a cycle");
      }
      if (parentByNode.has(nodeIndex)) {
        throw new Error("glTF node has more than one parent");
      }
      parentByNode.set(nodeIndex, parentIndex);
      if (visited.has(nodeIndex)) {
        throw new Error("glTF node occurs more than once");
      }
      visiting.add(nodeIndex);
      const node = plainRecord(
        nodes[nodeIndex],
        `glTF nodes[${nodeIndex}]`,
      );
      if (
        node.skin !== undefined ||
        node.weights !== undefined ||
        node.extensions !== undefined
      ) {
        throw new DOMException(
          `glTF nodes[${nodeIndex}] uses an unsupported profile`,
          "NotSupportedError",
        );
      }
      const world = multiplyMatrices(
        parentMatrix,
        nodeMatrix(node, `glTF nodes[${nodeIndex}]`),
      );
      if (node.mesh !== undefined) {
        const meshIndex = arrayIndex(
          node.mesh,
          meshes.length,
          `glTF nodes[${nodeIndex}].mesh`,
        );
        const mesh = plainRecord(
          meshes[meshIndex],
          `glTF meshes[${meshIndex}]`,
        );
        const primitives = collection(
          mesh.primitives,
          limits.maximumPrimitives,
          `glTF meshes[${meshIndex}].primitives`,
        );
        for (
          let primitiveIndex = 0;
          primitiveIndex < primitives.length;
          primitiveIndex += 1
        ) {
          const key = `${meshIndex}:${primitiveIndex}`;
          let record = records.get(key);
          if (record === undefined) {
            record = primitiveRecord(
              document,
              buffers,
              meshIndex,
              primitiveIndex,
              limits,
              extensionsRequired,
              compression?.views ?? null,
              textureResolver,
            );
            vertices += record.positions.length / 3;
            triangles += record.indices.length / 3;
            if (
              vertices > limits.maximumVertices ||
              triangles > limits.maximumTriangles ||
              records.size + 1 > limits.maximumPrimitives
            ) {
              throw new RangeError(
                "glTF geometry exceeds the bounded profile",
              );
            }
            records.set(key, record);
          }
          const occurrenceBounds = transformedBounds(
            world,
            record.bounds,
          );
          unionBounds(bounds, occurrenceBounds);
          occurrences.push({
            nativeId:
              `node:${nodeIndex}/mesh:${meshIndex}/primitive:` +
              `${primitiveIndex}`,
            name: boundedName(
              node.name,
              `glTF node ${nodeIndex} primitive ${primitiveIndex}`,
            ),
            nodeIndex,
            meshIndex,
            primitiveIndex,
            geometryKey: key,
            transform: world,
            color: record.color,
            bounds: occurrenceBounds,
          });
          if (occurrences.length > limits.maximumInstances) {
            throw new RangeError(
              "glTF instances exceed the bounded profile",
            );
          }
        }
      }
      const children = node.children ?? [];
      if (
        !Array.isArray(children) ||
        children.length > limits.maximumNodes ||
        new Set(children).size !== children.length
      ) {
        throw new RangeError(
          `glTF nodes[${nodeIndex}].children is invalid`,
        );
      }
      for (const child of children) {
        visit(child, world, depth + 1, nodeIndex);
      }
      visiting.delete(nodeIndex);
      visited.add(nodeIndex);
    };

    for (const root of roots) {
      visit(root, identityMatrix(), 0, null);
    }
    if (occurrences.length === 0 || records.size === 0) {
      throw new Error("glTF default scene has no supported geometry");
    }
    appearance = textureResolver.finalize(
      loadedBuffers.usedExternalResources,
    );
    return {
      format,
      asset: {
        version: asset.version,
        generator:
          typeof asset.generator === "string" &&
          asset.generator.length <= 256
            ? asset.generator
            : null,
      },
      records: [...records.values()],
      textures: [...appearance.textures],
      occurrences,
      bounds,
      statistics: {
        nodes: visited.size,
        meshes: new Set(
          occurrences.map((item) => item.meshIndex),
        ).size,
        geometryRecords: records.size,
        instances: occurrences.length,
        vertices,
        triangles,
        sourceBytes: aggregateSourceBytes,
      },
      resourceBundle: {
        documentBytes: input.byteLength,
        externalResourceBytes:
          loadedBuffers.externalResourceBytes,
        externalResources:
          appearance.externalResourceUris.length,
        ...(
          appearance.externalImageResources === 0 &&
          appearance.externalBufferViewImageResources === 0
          ? {}
          : {
              externalBufferResources:
                loadedBuffers.usedExternalResources.size,
              ...(appearance.externalImageResources === 0
                ? {}
                : {
                    externalImageResources:
                      appearance.externalImageResources,
                  }),
              ...(appearance.externalBufferViewImageResources === 0
                ? {}
                : {
                    externalBufferViewImageResources:
                      appearance.externalBufferViewImageResources,
                  }),
            }),
        ...(appearance.embeddedImageResources === 0
          ? {}
          : {
              embeddedImageBytes:
                appearance.embeddedImageBytes,
              embeddedImageResources:
                appearance.embeddedImageResources,
            }),
      },
      externalResourceUris:
        appearance.externalResourceUris,
      appearance: appearance.textures.length === 0
        ? null
        : {
            profile: appearance.textures.every(
              (texture) => texture.mediaType === "image/png",
            )
              ? "base-color-texture-png-opaque-v0.1"
              : "base-color-texture-opaque-v0.2",
            textureCoordinateSet: 0,
            textureSourceBytes: appearance.sourceBytes,
            textureDecodedBytes: appearance.decodedBytes,
            textures: appearance.textures.length,
            imageMediaTypes: [...new Set(
              appearance.textures.map(
                (texture) => texture.mediaType,
              ),
            )].sort(),
            ...(appearance.embeddedImageResources === 0
              ? {}
              : {
                  imageStorageProfiles:
                    appearance.embeddedStorageProfiles,
                }),
            colorSpace: "srgb-to-linear-webgl2",
          },
      appearanceOmissions: appearance.omissions,
      compression: compression === null
        ? null
        : {
            extension: EXT_MESHOPT_COMPRESSION,
            bufferViews: compression.views.size,
            compressedBytes: compression.compressedBytes,
            decodedBytes: compression.decodedBytes,
            decoder: {
              id: compression.decoder.id,
              version: compression.decoder.version,
              runtime: compression.decoder.runtime,
            },
            fallbackBuffers: compression.placeholderBuffers.size,
            fallbackMarkers: compression.fallbackMarkers.size,
            filters: [...new Set(
              [...compression.views.values()].map((item) =>
                item.filter),
            )].sort(),
            modes: [...new Set(
              [...compression.views.values()].map((item) =>
                item.mode),
            )].sort(),
          },
      extensionsRequired,
      extensionsUsed,
    };
  } finally {
    if (appearance === null) {
      textureResolver?.dispose();
    }
    bytes.fill(0);
    for (const resource of externalResources.values()) {
      resource.fill(0);
    }
    for (const buffer of ownedBuffers) {
      buffer.fill(0);
    }
  }
}
