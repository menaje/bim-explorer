function aligned(value, multiple = 4) {
  return Math.ceil(value / multiple) * multiple;
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

function documentFor(uri) {
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
        translation: [3, 0, 1],
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

export function syntheticGlbBytes() {
  const binary = binaryPayload();
  const json = new TextEncoder().encode(
    JSON.stringify(documentFor(null)),
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
