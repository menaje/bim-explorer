export const BIM_GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v1";
export const BIM_TEXTURED_GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v2";

const TEXTURE_NONE = 0xffff_ffff;

function align4(value) {
  return (value + 3) & ~3;
}

export function encodeGltfGeometryRange(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError("glTF geometry records must be non-empty");
  }
  const headerBytes = 16;
  const recordHeaderBytes = 20;
  const byteLength = records.reduce(
    (total, record) =>
      total +
      recordHeaderBytes +
      record.positions.byteLength +
      record.normals.byteLength +
      record.indices.length * Uint32Array.BYTES_PER_ELEMENT,
    headerBytes,
  );
  const bytes = new Uint8Array(byteLength);
  bytes.set(new TextEncoder().encode("BEXGEO01"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 1, true);
  view.setUint32(12, records.length, true);
  const metadata = new Map();
  let offset = headerBytes;
  for (const [index, record] of records.entries()) {
    const geometryExpressId = index + 1;
    const recordOffset = offset;
    const vertexCount = record.positions.length / 3;
    const vertexFloatCount = vertexCount * 6;
    const vertexByteLength =
      vertexFloatCount * Float32Array.BYTES_PER_ELEMENT;
    const indexByteLength =
      record.indices.length * Uint32Array.BYTES_PER_ELEMENT;
    view.setUint32(offset, geometryExpressId, true);
    view.setUint32(offset + 4, vertexFloatCount, true);
    view.setUint32(offset + 8, record.indices.length, true);
    view.setUint32(offset + 12, vertexByteLength, true);
    view.setUint32(offset + 16, indexByteLength, true);
    offset += recordHeaderBytes;
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        view.setFloat32(
          offset,
          record.positions[vertex * 3 + axis],
          true,
        );
        offset += 4;
      }
      for (let axis = 0; axis < 3; axis += 1) {
        view.setFloat32(
          offset,
          record.normals[vertex * 3 + axis],
          true,
        );
        offset += 4;
      }
    }
    for (const value of record.indices) {
      view.setUint32(offset, value, true);
      offset += 4;
    }
    metadata.set(record.key, Object.freeze({
      geometryExpressId,
      vertexCount,
      indexCount: record.indices.length,
      triangles: record.indices.length / 3,
      slice: Object.freeze({
        offset: recordOffset,
        byteLength: offset - recordOffset,
      }),
    }));
  }
  if (offset !== byteLength) {
    throw new Error("glTF geometry encoder byte count is invalid");
  }
  return {
    bytes,
    mediaType: BIM_GEOMETRY_MEDIA_TYPE,
    metadata,
  };
}

export function encodeGltfTexturedGeometryRange(
  records,
  textures,
) {
  if (
    !Array.isArray(records) ||
    records.length === 0 ||
    !Array.isArray(textures) ||
    textures.length === 0
  ) {
    throw new TypeError(
      "textured glTF geometry records and textures must be non-empty",
    );
  }
  const headerBytes = 24;
  const recordHeaderBytes = 28;
  const textureHeaderBytes = 40;
  const byteLength = records.reduce((total, record) => {
    const vertexCount = record.positions.length / 3;
    return total +
      recordHeaderBytes +
      vertexCount * 8 * Float32Array.BYTES_PER_ELEMENT +
      record.indices.length * Uint32Array.BYTES_PER_ELEMENT;
  }, headerBytes) + textures.reduce(
    (total, texture) =>
      total + textureHeaderBytes + align4(texture.bytes.byteLength),
    0,
  );
  const bytes = new Uint8Array(byteLength);
  bytes.set(new TextEncoder().encode("BEXGEO02"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 2, true);
  view.setUint32(12, records.length, true);
  view.setUint32(16, textures.length, true);
  view.setUint32(20, 0, true);
  const metadata = new Map();
  let offset = headerBytes;
  for (const [index, record] of records.entries()) {
    const geometryExpressId = index + 1;
    const recordOffset = offset;
    const vertexCount = record.positions.length / 3;
    const textureIndex = record.textureIndex === null
      ? TEXTURE_NONE
      : record.textureIndex;
    if (
      !Number.isSafeInteger(vertexCount) ||
      vertexCount <= 0 ||
      record.normals.length !== vertexCount * 3 ||
      (
        record.texcoords !== null &&
        (
          !(record.texcoords instanceof Float32Array) ||
          record.texcoords.length !== vertexCount * 2
        )
      ) ||
      !(record.indices instanceof Uint32Array) ||
      record.indices.length === 0 ||
      record.indices.length % 3 !== 0 ||
      !Number.isSafeInteger(textureIndex) ||
      (
        textureIndex !== TEXTURE_NONE &&
        (textureIndex < 0 || textureIndex >= textures.length)
      ) ||
      (textureIndex === TEXTURE_NONE) !==
        (record.texcoords === null)
    ) {
      throw new Error("textured glTF geometry record is invalid");
    }
    const vertexFloatCount = vertexCount * 8;
    const vertexByteLength =
      vertexFloatCount * Float32Array.BYTES_PER_ELEMENT;
    const indexByteLength =
      record.indices.length * Uint32Array.BYTES_PER_ELEMENT;
    view.setUint32(offset, geometryExpressId, true);
    view.setUint32(offset + 4, vertexFloatCount, true);
    view.setUint32(offset + 8, record.indices.length, true);
    view.setUint32(offset + 12, vertexByteLength, true);
    view.setUint32(offset + 16, indexByteLength, true);
    view.setUint32(offset + 20, textureIndex, true);
    view.setUint32(offset + 24, 0, true);
    offset += recordHeaderBytes;
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        view.setFloat32(
          offset,
          record.positions[vertex * 3 + axis],
          true,
        );
        offset += 4;
      }
      for (let axis = 0; axis < 3; axis += 1) {
        view.setFloat32(
          offset,
          record.normals[vertex * 3 + axis],
          true,
        );
        offset += 4;
      }
      for (let axis = 0; axis < 2; axis += 1) {
        view.setFloat32(
          offset,
          record.texcoords?.[vertex * 2 + axis] ?? 0,
          true,
        );
        offset += 4;
      }
    }
    for (const value of record.indices) {
      view.setUint32(offset, value, true);
      offset += 4;
    }
    metadata.set(record.key, Object.freeze({
      geometryExpressId,
      vertexCount,
      indexCount: record.indices.length,
      triangles: record.indices.length / 3,
      textureIndex:
        textureIndex === TEXTURE_NONE ? null : textureIndex,
      slice: Object.freeze({
        offset: recordOffset,
        byteLength: offset - recordOffset,
      }),
    }));
  }
  for (const [index, texture] of textures.entries()) {
    if (
      texture.index !== index ||
      !(texture.bytes instanceof Uint8Array) ||
      texture.bytes.byteLength === 0 ||
      !Number.isSafeInteger(texture.width) ||
      texture.width <= 0 ||
      !Number.isSafeInteger(texture.height) ||
      texture.height <= 0 ||
      texture.decodedBytes !== texture.width * texture.height * 4
    ) {
      throw new Error("textured glTF texture record is invalid");
    }
    view.setUint32(offset, index, true);
    view.setUint32(offset + 4, 1, true);
    view.setUint32(offset + 8, texture.width, true);
    view.setUint32(offset + 12, texture.height, true);
    view.setUint32(offset + 16, texture.bytes.byteLength, true);
    view.setUint32(offset + 20, texture.decodedBytes, true);
    view.setUint32(offset + 24, texture.sampler.magFilter, true);
    view.setUint32(offset + 28, texture.sampler.minFilter, true);
    view.setUint32(offset + 32, texture.sampler.wrapS, true);
    view.setUint32(offset + 36, texture.sampler.wrapT, true);
    offset += textureHeaderBytes;
    bytes.set(texture.bytes, offset);
    offset += align4(texture.bytes.byteLength);
  }
  if (offset !== byteLength) {
    throw new Error(
      "textured glTF geometry encoder byte count is invalid",
    );
  }
  return {
    bytes,
    mediaType: BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
    metadata,
  };
}

export { TEXTURE_NONE };
