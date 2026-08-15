import assert from "node:assert/strict";
import test from "node:test";

import {
  BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
  BIM_RETAINED_OVERLAY_PACKET_SCHEMA,
  decodeBimRetainedOverlayPacket,
  encodeBimRetainedOverlayPacket,
  sha256BimRetainedOverlayPacket,
} from "../../packages/bim-renderer-3d/src/retained-overlay.mjs";

const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function geometryEntry() {
  return {
    operationId: "operation:overlay:geometry:1",
    kind: "upsert",
    aspect: "geometry",
    renderId: "render:overlay:object:1",
    pickId: "pick:overlay:object:1",
    nativeId: "object:1",
    externalIdentityToken: "opaque:overlay:object:1",
    bounds: {
      min: [0, 0, 0],
      max: [1, 1, 0.01],
    },
    transform: [...IDENTITY],
    color: [0.2, 0.6, 0.9, 1],
    visible: true,
    geometry: {
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      normals: new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
      ]),
      indices: new Uint32Array([0, 1, 2]),
    },
  };
}

function packet(entries = [geometryEntry()]) {
  return encodeBimRetainedOverlayPacket({
    deltaId: "delta:overlay:1",
    sourceId: "source:overlay",
    layerId: "layer:overlay",
    fromRevisionId: "revision:overlay:1",
    toRevisionId: "revision:overlay:2",
    sequence: 1,
    entries,
  });
}

test("retained overlay packet round-trips bounded geometry and identity", async () => {
  const bytes = packet();
  const decoded = decodeBimRetainedOverlayPacket(bytes);

  assert.equal(decoded.schema, BIM_RETAINED_OVERLAY_PACKET_SCHEMA);
  assert.equal(decoded.mediaType, BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE);
  assert.equal(decoded.deltaId, "delta:overlay:1");
  assert.equal(decoded.entries.length, 1);
  assert.deepEqual(
    [...decoded.entries[0].geometry.vertices],
    [
      0, 0, 0, 0, 0, 1,
      1, 0, 0, 0, 0, 1,
      0, 1, 0, 0, 0, 1,
    ],
  );
  assert.deepEqual([...decoded.entries[0].geometry.indices], [0, 1, 2]);
  assert.match(await sha256BimRetainedOverlayPacket(bytes), /^[0-9a-f]{64}$/u);
  assert.deepEqual(packet(), bytes);
});

test("retained overlay packet supports metadata-only style and tombstone entries", () => {
  const bytes = packet([
    {
      operationId: "operation:overlay:style:1",
      kind: "upsert",
      aspect: "style",
      renderId: "render:overlay:object:1",
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 0.01],
      },
      color: [1, 0.2, 0.1, 1],
      visible: false,
    },
    {
      operationId: "operation:overlay:tombstone:2",
      kind: "tombstone",
      aspect: "entity",
      renderId: "render:overlay:object:2",
      bounds: {
        min: [1, 0, 0],
        max: [2, 1, 0.01],
      },
    },
  ]);
  const decoded = decodeBimRetainedOverlayPacket(bytes);
  assert.equal(decoded.binaryByteLength, 0);
  assert.equal(decoded.entries[0].visible, false);
  assert.equal(decoded.entries[1].kind, "tombstone");
});

test("retained overlay packet rejects malformed and over-budget bytes", () => {
  const valid = packet();
  const malformed = Uint8Array.from(valid);
  malformed[0] ^= 0xff;
  assert.throws(
    () => decodeBimRetainedOverlayPacket(malformed),
    /magic is invalid/u,
  );
  assert.throws(
    () => decodeBimRetainedOverlayPacket(valid, {
      maximumBytes: valid.byteLength - 1,
    }),
    /byte bound/u,
  );
  const trailing = new Uint8Array(valid.byteLength + 4);
  trailing.set(valid);
  assert.throws(
    () => decodeBimRetainedOverlayPacket(trailing),
    /byte layout is invalid/u,
  );
  assert.throws(
    () => packet([{
      ...geometryEntry(),
      geometry: {
        ...geometryEntry().geometry,
        indices: new Uint32Array([0, 1, 3]),
      },
    }]),
    /out-of-range index/u,
  );
  assert.throws(
    () => encodeBimRetainedOverlayPacket({
      deltaId: "file:///tmp/overlay.delta",
      sourceId: "source:overlay",
      layerId: "layer:overlay",
      fromRevisionId: "revision:overlay:1",
      toRevisionId: "revision:overlay:2",
      sequence: 1,
      entries: [geometryEntry()],
    }),
    /path-free string/u,
  );
});
