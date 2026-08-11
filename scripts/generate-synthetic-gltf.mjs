import { deflateSync } from "node:zlib";

function aligned(value, multiple = 4) {
  return Math.ceil(value / multiple) * multiple;
}

const PNG_CRC_TABLE = Object.freeze(
  Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1
        ? 0xedb88320 ^ (crc >>> 1)
        : crc >>> 1;
    }
    return crc >>> 0;
  }),
);

function pngCrc32(bytes) {
  let crc = 0xffff_ffff;
  for (const value of bytes) {
    crc = PNG_CRC_TABLE[(crc ^ value) & 0xff] ^
      (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

export function syntheticPngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const bytes = new Uint8Array(12 + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.byteLength, false);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    pngCrc32(bytes.subarray(4, 8 + data.byteLength)),
    false,
  );
  return bytes;
}

export function syntheticPngBytes() {
  const signature = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, 2, false);
  ihdrView.setUint32(4, 2, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Uint8Array.from([
    0, 255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  const idat = Uint8Array.from(deflateSync(scanlines, {
    level: 9,
  }));
  const chunks = [
    syntheticPngChunk("IHDR", ihdr),
    syntheticPngChunk("IDAT", idat),
    syntheticPngChunk("IEND", new Uint8Array()),
  ];
  const byteLength = signature.byteLength + chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const value of [signature, ...chunks]) {
    bytes.set(value, offset);
    offset += value.byteLength;
  }
  idat.fill(0);
  scanlines.fill(0);
  return bytes;
}

function binaryPayload() {
  const byteLength = 80;
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  const positions = [
    -1, -1, 0,
    1, -1, 0,
    0, 1, 0,
  ];
  const normals = [
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ];
  let offset = 0;
  for (const value of [...positions, ...normals]) {
    view.setFloat32(offset, value, true);
    offset += 4;
  }
  for (const value of [0, 1, 2]) {
    view.setUint16(offset, value, true);
    offset += 2;
  }
  return bytes;
}

function quantizedBinaryPayload() {
  const byteLength = 44;
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  const positions = [
    [-32_767, -32_767, 0],
    [32_767, -32_767, 0],
    [0, 32_767, 0],
  ];
  let offset = 0;
  for (const position of positions) {
    for (const value of position) {
      view.setInt16(offset, value, true);
      offset += 2;
    }
    offset += 2;
  }
  for (let index = 0; index < 3; index += 1) {
    view.setInt8(offset, 0);
    view.setInt8(offset + 1, 0);
    view.setInt8(offset + 2, 127);
    offset += 4;
  }
  for (const value of [0, 1, 2]) {
    view.setUint16(offset, value, true);
    offset += 2;
  }
  return bytes;
}

function texturedBinaryPayload() {
  const bytes = new Uint8Array(104);
  const view = new DataView(bytes.buffer);
  const positions = [
    -1, -1, 0,
    1, -1, 0,
    0, 1, 0,
  ];
  const normals = [
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ];
  const texcoords = [
    0, 0,
    1, 0,
    0.5, 1,
  ];
  let offset = 0;
  for (const value of [...positions, ...normals, ...texcoords]) {
    view.setFloat32(offset, value, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
  }
  for (const value of [0, 1, 2]) {
    view.setUint16(offset, value, true);
    offset += Uint16Array.BYTES_PER_ELEMENT;
  }
  return bytes;
}

function documentFor(uri, secondNodeX = 3) {
  const buffer = { byteLength: 80 };
  if (uri !== null) {
    buffer.uri = uri;
  }
  return {
    asset: {
      version: "2.0",
      generator: "BIM Explorer deterministic fixture",
    },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "Reference triangle A", mesh: 0 },
      {
        name: "Reference triangle B",
        mesh: 0,
        translation: [secondNodeX, 0, 1],
      },
    ],
    meshes: [{
      primitives: [{
        attributes: {
          POSITION: 0,
          NORMAL: 1,
        },
        indices: 2,
        material: 0,
        mode: 4,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [0.2, 0.6, 0.9, 1],
      },
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-1, -1, 0],
        max: [1, 1, 0],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: 3,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 6 },
    ],
    buffers: [buffer],
  };
}

function quantizedDocumentFor(secondNodeX = 3, uri = null) {
  return {
    ...documentFor(null, secondNodeX),
    asset: {
      version: "2.0",
      generator:
        "BIM Explorer deterministic KHR_mesh_quantization fixture",
    },
    extensionsUsed: ["KHR_mesh_quantization"],
    extensionsRequired: ["KHR_mesh_quantization"],
    accessors: [
      {
        bufferView: 0,
        componentType: 5122,
        normalized: true,
        count: 3,
        type: "VEC3",
        min: [-32_767, -32_767, 0],
        max: [32_767, 32_767, 0],
      },
      {
        bufferView: 1,
        componentType: 5120,
        normalized: true,
        count: 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: 3,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: 24,
        byteStride: 8,
      },
      {
        buffer: 0,
        byteOffset: 24,
        byteLength: 12,
        byteStride: 4,
      },
      {
        buffer: 0,
        byteOffset: 36,
        byteLength: 6,
      },
    ],
    buffers: [{
      byteLength: 44,
      ...(uri === null ? {} : { uri }),
    }],
  };
}

function texturedDocumentFor({
  binaryUri,
  imageUri,
  secondNodeX = 3,
}) {
  const document = documentFor(binaryUri, secondNodeX);
  document.asset.generator =
    "BIM Explorer deterministic external PNG texture fixture";
  document.buffers[0].byteLength = 104;
  document.bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 36 },
    { buffer: 0, byteOffset: 72, byteLength: 24 },
    { buffer: 0, byteOffset: 96, byteLength: 6 },
  ];
  document.accessors = [
    document.accessors[0],
    document.accessors[1],
    {
      bufferView: 2,
      componentType: 5126,
      count: 3,
      type: "VEC2",
    },
    {
      bufferView: 3,
      componentType: 5123,
      count: 3,
      type: "SCALAR",
    },
  ];
  document.meshes[0].primitives[0].attributes.TEXCOORD_0 = 2;
  document.meshes[0].primitives[0].indices = 3;
  document.materials = [{
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 0 },
    },
  }];
  document.samplers = [{
    magFilter: 9729,
    minFilter: 9987,
    wrapS: 10497,
    wrapT: 10497,
  }];
  document.textures = [{ sampler: 0, source: 0 }];
  document.images = [{ uri: imageUri, mimeType: "image/png" }];
  return document;
}

export function syntheticGltfJsonBytes() {
  const binary = binaryPayload();
  const uri =
    "data:application/octet-stream;base64," +
    Buffer.from(binary).toString("base64");
  binary.fill(0);
  return new TextEncoder().encode(
    JSON.stringify(documentFor(uri)),
  );
}

export function syntheticGltfExternalBundle({
  uri = "geometry.bin",
} = {}) {
  const bytes = binaryPayload();
  return {
    bytes: new TextEncoder().encode(
      JSON.stringify(documentFor(uri)),
    ),
    resources: [{
      uri,
      bytes,
    }],
  };
}

export function syntheticTexturedGltfExternalBundle({
  binaryUri = "geometry.bin",
  forbiddenTransparencyChunk = false,
  imageUri = "base-color.png",
  secondNodeX = 3,
} = {}) {
  const binary = texturedBinaryPayload();
  let image = syntheticPngBytes();
  if (forbiddenTransparencyChunk) {
    const transparency = syntheticPngChunk(
      "tRNS",
      Uint8Array.from([0]),
    );
    const invalidImage = new Uint8Array(
      image.byteLength + transparency.byteLength,
    );
    invalidImage.set(image.subarray(0, 33), 0);
    invalidImage.set(transparency, 33);
    invalidImage.set(
      image.subarray(33),
      33 + transparency.byteLength,
    );
    image.fill(0);
    transparency.fill(0);
    image = invalidImage;
  }
  return {
    bytes: new TextEncoder().encode(JSON.stringify(
      texturedDocumentFor({
        binaryUri,
        imageUri,
        secondNodeX,
      }),
    )),
    resources: [
      { uri: binaryUri, bytes: binary },
      { uri: imageUri, bytes: image },
    ],
  };
}

export function syntheticTexturedGltfDataUriBytes({
  imageMediaType = "image/png",
  imagePayload = null,
  secondNodeX = 3,
} = {}) {
  const binary = texturedBinaryPayload();
  const image = imagePayload === null
    ? syntheticPngBytes()
    : Uint8Array.from(imagePayload);
  const binaryUri =
    "data:application/octet-stream;base64," +
    Buffer.from(binary).toString("base64");
  const imageUri =
    `data:${imageMediaType};base64,` +
    Buffer.from(image).toString("base64");
  const document = texturedDocumentFor({
    binaryUri,
    imageUri,
    secondNodeX,
  });
  document.asset.generator =
    "BIM Explorer deterministic embedded PNG data URI fixture";
  document.images[0].mimeType = imageMediaType;
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  binary.fill(0);
  image.fill(0);
  return bytes;
}

export function syntheticTexturedGlbBytes({
  imageBufferView = 4,
  imageByteLength = null,
  imageByteOffset = 104,
  imageMimeType = "image/png",
  secondNodeX = 3,
} = {}) {
  const geometry = texturedBinaryPayload();
  const image = syntheticPngBytes();
  const declaredImageBytes = imageByteLength ?? image.byteLength;
  const binaryByteLength = aligned(
    Math.max(
      geometry.byteLength,
      imageByteOffset + image.byteLength,
    ),
  );
  const binary = new Uint8Array(binaryByteLength);
  binary.set(geometry, 0);
  binary.set(image, imageByteOffset);
  const document = texturedDocumentFor({
    binaryUri: null,
    imageUri: null,
    secondNodeX,
  });
  document.asset.generator =
    "BIM Explorer deterministic embedded PNG GLB fixture";
  document.buffers[0] = { byteLength: binary.byteLength };
  document.bufferViews.push({
    buffer: 0,
    byteOffset: imageByteOffset,
    byteLength: declaredImageBytes,
  });
  document.images = [{
    bufferView: imageBufferView,
    mimeType: imageMimeType,
  }];
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = aligned(json.byteLength);
  const bytes = new Uint8Array(
    12 + 8 + jsonLength + 8 + binary.byteLength,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binary.byteLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  bytes.set(binary, binaryHeader + 8);
  binary.fill(0);
  geometry.fill(0);
  image.fill(0);
  return bytes;
}

export function syntheticTexturedGltfBufferViewBytes({
  imageByteOffset = 104,
  secondNodeX = 3,
} = {}) {
  const geometry = texturedBinaryPayload();
  const image = syntheticPngBytes();
  const binary = new Uint8Array(aligned(
    Math.max(
      geometry.byteLength,
      imageByteOffset + image.byteLength,
    ),
  ));
  binary.set(geometry, 0);
  binary.set(image, imageByteOffset);
  const document = texturedDocumentFor({
    binaryUri: null,
    imageUri: null,
    secondNodeX,
  });
  document.asset.generator =
    "BIM Explorer held glTF image bufferView fixture";
  document.buffers[0] = {
    byteLength: binary.byteLength,
    uri: "data:application/octet-stream;base64," +
      Buffer.from(binary).toString("base64"),
  };
  document.bufferViews.push({
    buffer: 0,
    byteOffset: imageByteOffset,
    byteLength: image.byteLength,
  });
  document.images = [{
    bufferView: 4,
    mimeType: "image/png",
  }];
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  binary.fill(0);
  geometry.fill(0);
  image.fill(0);
  return bytes;
}

export function syntheticQuantizedGltfJsonBytes() {
  const binary = quantizedBinaryPayload();
  const uri =
    "data:application/octet-stream;base64," +
    Buffer.from(binary).toString("base64");
  binary.fill(0);
  return new TextEncoder().encode(
    JSON.stringify(quantizedDocumentFor(3, uri)),
  );
}

export function syntheticGlbBytes({
  secondNodeX = 3,
} = {}) {
  const binary = binaryPayload();
  const json = new TextEncoder().encode(
    JSON.stringify(documentFor(null, secondNodeX)),
  );
  const jsonLength = aligned(json.byteLength);
  const binaryLength = aligned(binary.byteLength);
  const bytes = new Uint8Array(
    12 + 8 + jsonLength + 8 + binaryLength,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binaryLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  bytes.set(binary, binHeader + 8);
  binary.fill(0);
  return bytes;
}

export function syntheticQuantizedGlbBytes({
  secondNodeX = 3,
} = {}) {
  const binary = quantizedBinaryPayload();
  const json = new TextEncoder().encode(
    JSON.stringify(quantizedDocumentFor(secondNodeX)),
  );
  const jsonLength = aligned(json.byteLength);
  const binaryLength = aligned(binary.byteLength);
  const bytes = new Uint8Array(
    12 + 8 + jsonLength + 8 + binaryLength,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binaryLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  bytes.set(binary, binHeader + 8);
  binary.fill(0);
  return bytes;
}

export async function syntheticMeshoptGlbBytes({
  indexMode = "TRIANGLES",
  secondNodeX = 3,
} = {}) {
  if (!["TRIANGLES", "INDICES"].includes(indexMode)) {
    throw new TypeError("synthetic meshopt index mode is invalid");
  }
  const { MeshoptEncoder } = await import("meshoptimizer/encoder");
  await MeshoptEncoder.ready;
  const source = binaryPayload();
  const inputs = [
    {
      bytes: source.slice(0, 36),
      count: 3,
      mode: "ATTRIBUTES",
      stride: 12,
    },
    {
      bytes: source.slice(36, 72),
      count: 3,
      mode: "ATTRIBUTES",
      stride: 12,
    },
    {
      bytes: source.slice(72, 78),
      count: 3,
      mode: indexMode,
      stride: 2,
    },
  ];
  source.fill(0);
  const encoded = [];
  try {
    for (const input of inputs) {
      encoded.push(MeshoptEncoder.encodeGltfBuffer(
        input.bytes,
        input.count,
        input.stride,
        input.mode,
      ));
      input.bytes.fill(0);
    }
    const offsets = [];
    let binaryLength = 0;
    for (const item of encoded) {
      binaryLength = aligned(binaryLength);
      offsets.push(binaryLength);
      binaryLength += item.byteLength;
    }
    binaryLength = aligned(binaryLength);
    const binary = new Uint8Array(binaryLength);
    for (let index = 0; index < encoded.length; index += 1) {
      binary.set(encoded[index], offsets[index]);
    }
    const document = documentFor(null, secondNodeX);
    document.asset.generator =
      "BIM Explorer deterministic EXT_meshopt_compression fixture";
    document.extensionsUsed = ["EXT_meshopt_compression"];
    document.extensionsRequired = ["EXT_meshopt_compression"];
    document.bufferViews = document.bufferViews.map(
      (bufferView, index) => ({
        ...bufferView,
        buffer: 1,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteOffset: offsets[index],
            byteLength: encoded[index].byteLength,
            byteStride: inputs[index].stride,
            count: inputs[index].count,
            mode: inputs[index].mode,
            filter: "NONE",
          },
        },
      }),
    );
    document.buffers = [
      { byteLength: binary.byteLength },
      {
        byteLength: 80,
        extensions: {
          EXT_meshopt_compression: { fallback: true },
        },
      },
    ];
    const json = new TextEncoder().encode(JSON.stringify(document));
    const jsonLength = aligned(json.byteLength);
    const bytes = new Uint8Array(
      12 + 8 + jsonLength + 8 + binary.byteLength,
    );
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, bytes.byteLength, true);
    view.setUint32(12, jsonLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.fill(0x20, 20, 20 + jsonLength);
    bytes.set(json, 20);
    const binHeader = 20 + jsonLength;
    view.setUint32(binHeader, binary.byteLength, true);
    view.setUint32(binHeader + 4, 0x004e4942, true);
    bytes.set(binary, binHeader + 8);
    binary.fill(0);
    return bytes;
  } finally {
    for (const input of inputs) {
      input.bytes.fill(0);
    }
    for (const item of encoded) {
      item.fill(0);
    }
  }
}
