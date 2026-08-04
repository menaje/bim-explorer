export const BIM_GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v1";

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
    metadata,
  };
}
