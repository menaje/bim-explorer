import {
  identityMatrix,
  multiplyMatrices,
  nodeMatrix,
  transformedBounds,
  unionBounds,
} from "./math.mjs";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = new Map([
  [5121, 1],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);
const DEFAULT_LIMITS = Object.freeze({
  maximumSourceBytes: 64 * 1024 * 1024,
  maximumJsonBytes: 4 * 1024 * 1024,
  maximumBufferBytes: 64 * 1024 * 1024,
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

function decodeBase64(value, maximumBytes) {
  if (
    value.length === 0 ||
    value.length > Math.ceil(maximumBytes / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
      .test(value)
  ) {
    throw new Error("glTF buffer data URI has invalid base64");
  }
  let binary;
  try {
    binary = globalThis.atob(value);
  } catch {
    throw new Error("glTF buffer data URI has invalid base64");
  }
  if (binary.length > maximumBytes) {
    throw new RangeError("glTF decoded buffer exceeds its byte limit");
  }
  return Uint8Array.from(binary, (character) =>
    character.charCodeAt(0));
}

function loadBuffers(document, binaryChunk, format, limits) {
  const buffers = collection(
    document.buffers,
    limits.maximumAccessors,
    "glTF buffers",
  );
  let totalBytes = 0;
  return buffers.map((bufferValue, index) => {
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
      if (match === null) {
        throw new DOMException(
          "external glTF buffer URI is blocked",
          "NotSupportedError",
        );
      }
      bytes = decodeBase64(match[1], limits.maximumBufferBytes);
      if (bytes.byteLength !== buffer.byteLength) {
        throw new RangeError(
          "glTF data URI length does not match buffer.byteLength",
        );
      }
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > limits.maximumBufferBytes) {
      throw new RangeError("glTF aggregate buffer bytes exceed the limit");
    }
    return bytes;
  });
}

function accessorLayout(
  document,
  buffers,
  accessorIndex,
  {
    componentType,
    type,
    label,
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
    accessor.normalized === true ||
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
  const components = type === "VEC3" ? 3 : 1;
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
    accessorOffset + stride * (accessor.count - 1) +
      elementBytes > bufferView.byteLength ||
    byteOffset + bufferView.byteLength > buffers[bufferIndex].byteLength
  ) {
    throw new RangeError(`${label} accessor byte layout is invalid`);
  }
  return {
    accessor,
    buffer: buffers[bufferIndex],
    offset: byteOffset + accessorOffset,
    stride,
  };
}

function readVec3(document, buffers, index, label) {
  const layout = accessorLayout(
    document,
    buffers,
    index,
    { componentType: 5126, type: "VEC3", label },
  );
  const result = new Float32Array(layout.accessor.count * 3);
  const view = new DataView(
    layout.buffer.buffer,
    layout.buffer.byteOffset,
    layout.buffer.byteLength,
  );
  for (let item = 0; item < layout.accessor.count; item += 1) {
    const offset = layout.offset + item * layout.stride;
    for (let component = 0; component < 3; component += 1) {
      const value = view.getFloat32(offset + component * 4, true);
      if (!Number.isFinite(value)) {
        throw new Error(`${label} contains a non-finite value`);
      }
      result[item * 3 + component] = value;
    }
  }
  return result;
}

function readIndices(document, buffers, index, vertexCount, label) {
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
    },
  );
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

function materialColor(document, index) {
  if (index === undefined) {
    return [1, 1, 1, 1];
  }
  const materials = collection(
    document.materials,
    DEFAULT_LIMITS.maximumPrimitives,
    "glTF materials",
    { nonEmpty: false },
  );
  const material = plainRecord(
    materials[arrayIndex(index, materials.length, "glTF material")],
    "glTF material",
  );
  const color =
    material.pbrMetallicRoughness?.baseColorFactor ??
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
  return [...color];
}

function primitiveRecord(
  document,
  buffers,
  meshIndex,
  primitiveIndex,
  limits,
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
  );
  const normals = readVec3(
    document,
    buffers,
    attributes.NORMAL,
    `${label} NORMAL`,
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
  const indices = readIndices(
    document,
    buffers,
    primitive.indices,
    positions.length / 3,
    `${label} indices`,
  );
  return {
    key: `${meshIndex}:${primitiveIndex}`,
    meshIndex,
    primitiveIndex,
    positions,
    normals,
    indices,
    bounds: localBounds(positions),
    color: materialColor(document, primitive.material),
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

function validateAsset(document) {
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
  if (
    document.extensionsRequired !== undefined &&
    (
      !Array.isArray(document.extensionsRequired) ||
      document.extensionsRequired.length > 0
    )
  ) {
    throw new DOMException(
      "required glTF extensions are unsupported",
      "NotSupportedError",
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
  return asset;
}

export function parseGltfReferenceProfile(
  input,
  { limits: limitOverrides = {} } = {},
) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("glTF input must be a Uint8Array");
  }
  const limits = validatedLimits(limitOverrides);
  if (
    input.byteLength === 0 ||
    input.byteLength > limits.maximumSourceBytes
  ) {
    throw new RangeError("glTF input exceeds the source byte limit");
  }
  const bytes = Uint8Array.from(input);
  const ownedBuffers = [];
  try {
    const {
      format,
      document,
      binaryChunk,
    } = parseContainer(bytes, limits);
    const asset = validateAsset(document);
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
    const buffers = loadBuffers(
      document,
      binaryChunk,
      format,
      limits,
    );
    ownedBuffers.push(...buffers);
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
        sourceBytes: input.byteLength,
      },
      extensionsUsed: Array.isArray(document.extensionsUsed)
        ? [...document.extensionsUsed]
        : [],
    };
  } finally {
    bytes.fill(0);
    for (const buffer of ownedBuffers) {
      buffer.fill(0);
    }
  }
}
