import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraViewProjectionMatrix,
  unprojectCameraPoint3d,
  validateCamera3d,
} from "../../packages/bim-renderer-3d/src/camera.mjs";
import {
  BIM_SURFACE_HIT_SCHEMA,
  resolveBimSurfaceHit,
} from "../../packages/bim-surface-hit/src/index.mjs";
import {
  encodeGltfGeometryRange,
} from "../../packages/gltf-reference-source/src/geometry.mjs";

const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);
const FINGERPRINT = `sha256:${"a".repeat(64)}`;
const REVISION = `source-snapshot:${FINGERPRINT}`;

async function digest(bytes) {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function multiplyPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y +
      matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y +
      matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y +
      matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y +
      matrix[11] * z + matrix[15],
  ];
}

async function fixture({ duplicate = false } = {}) {
  const encoded = encodeGltfGeometryRange([{
    key: "triangle",
    positions: new Float32Array([
      0, -1, -1,
      0, 1, -1,
      0, 0, 1,
    ]),
    normals: new Float32Array([
      1, 0, 0,
      1, 0, 0,
      1, 0, 0,
    ]),
    indices: new Uint32Array(
      duplicate
        ? [0, 1, 2, 0, 1, 2]
        : [0, 1, 2],
    ),
  }]);
  const metadata = encoded.metadata.get("triangle");
  const sha256 = await digest(encoded.bytes);
  const handle = {
    handleId: "range:surface-hit:0",
    byteLength: encoded.bytes.byteLength,
    maximumRequestBytes: 64,
    sha256,
  };
  const snapshot = {
    protocolVersion: "bim-explorer-bim-source/0.2",
    sessionId: "session:surface-hit",
    sourceId: "source:surface-hit",
    revisionId: REVISION,
    snapshotId: "snapshot:surface-hit:0",
    layerId: "layer:surface-hit",
    source: {
      format: "federated",
      fingerprint: FINGERPRINT,
    },
    coordinateSystem: {
      sourceFromStorage: IDENTITY,
    },
    entities: [{
      expressId: 1,
      nativeId: "federated:0:0",
      pickId: "pick:surface-hit:1",
      renderable: true,
      primitives: [{
        ...metadata,
        transform: IDENTITY,
        slice: {
          ...metadata.slice,
          rangeId: handle.handleId,
        },
      }],
    }],
    layers: [{
      layerId: "layer:surface-hit",
      rangeHandles: [handle],
    }],
  };
  const camera = validateCamera3d({
    schema: "bim-explorer-camera-3d/0.1",
    projection: "perspective",
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: 5,
    fieldOfViewY: Math.PI / 4,
    orthographicHeight: 4,
    near: 1,
    far: 10,
  });
  const coordinates = { x: 49, y: 49 };
  const clip = multiplyPoint(
    cameraViewProjectionMatrix(camera, 1),
    [0, 0, 0],
  );
  const exactDepth = (clip[2] / clip[3] + 1) / 2;
  const depth = Math.round(exactDepth * 32_767) / 32_767;
  const worldPosition = unprojectCameraPoint3d(camera, {
    ...coordinates,
    depth,
    width: 100,
    height: 100,
  });
  let reads = 0;
  const session = {
    async readRange(value, offset, length) {
      assert.equal(value.handleId, handle.handleId);
      reads += 1;
      return encoded.bytes.slice(offset, offset + length);
    },
  };
  const pick = {
    schema: "bim-explorer-bim-renderer-3d-pick-receipt/0.1",
    status: "hit",
    source: {
      fingerprint: FINGERPRINT,
      revisionId: REVISION,
    },
    coordinates: {
      ...coordinates,
      origin: "canvas-top-left",
    },
    identity: {
      expressId: 1,
      nativeId: "federated:0:0",
      pickId: "pick:surface-hit:1",
    },
    worldPosition,
    backend: {
      actualGpu: true,
      context: "webgl2",
      depth,
      temporaryReleased: true,
    },
  };
  return {
    bytes: encoded.bytes,
    camera,
    pick,
    reads: () => reads,
    session,
    snapshot,
  };
}

test("surface hit resolves one exact triangle from a GPU depth pick", async () => {
  const input = await fixture();
  const hit = await resolveBimSurfaceHit({
    camera: input.camera,
    pick: input.pick,
    session: input.session,
    snapshot: input.snapshot,
    viewport: { width: 100, height: 100 },
  }, {
    residentRangeIds: ["range:surface-hit:0"],
  });

  assert.equal(hit.schema, BIM_SURFACE_HIT_SCHEMA);
  assert.equal(hit.status, "resolved");
  assert.equal(hit.locator.triangleIndex, 0);
  assert.ok(
    Math.abs(
      hit.locator.barycentric.reduce(
        (sum, value) => sum + value,
        0,
      ) - 1,
    ) < 1e-12,
  );
  assert.deepEqual(hit.normal, [1, 0, 0]);
  assert.ok(Math.abs(hit.point[0]) < 1e-12);
  assert.equal(hit.verification.actualGpuDepth, true);
  assert.equal(hit.verification.exactGeometryDigest, true);
  assert.equal(hit.resources.retainedGeometryBytes, 0);
  assert.equal(hit.resources.temporaryGeometryReleased, true);
  assert.equal(input.reads(), Math.ceil(input.bytes.byteLength / 64));
  assert.ok(Object.values(hit.authority).every((value) => !value));
});

test("surface hit fails closed for coincident triangle locators", async () => {
  const input = await fixture({ duplicate: true });
  await assert.rejects(
    resolveBimSurfaceHit({
      camera: input.camera,
      pick: input.pick,
      session: input.session,
      snapshot: input.snapshot,
      viewport: { width: 100, height: 100 },
    }),
    (error) => error.name === "NotSupportedError" &&
      /ambiguous triangle/u.test(error.message),
  );
});
