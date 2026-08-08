import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BIM_POINT_RANGE_MEDIA_TYPE,
  BIM_POINT_RANGE_MAXIMUM_BYTES,
  BIM_POINT_RANGE_MAXIMUM_POINTS,
  BIM_POINT_RENDERER_RECEIPT,
  BIM_POINT_RENDERER_RELEASE_RECEIPT,
  createBoundedPointCloudRenderer,
  createHeadlessPointCloudBackend,
  decodeBimPointRange,
  encodeBimPointRange,
} from "../../packages/bim-renderer-3d/src/index.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function syntheticPointRange() {
  const positions = new Float32Array([
    -2, -1, 0,
    2, -1, 0.5,
    2, 1, 1,
    -2, 1, 0.25,
  ]);
  const colors = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 128,
  ]);
  const bytes = encodeBimPointRange({
    colors,
    origin: [1_000_000, 2_000_000, 3_000_000],
    positions,
  });
  positions.fill(0);
  colors.fill(0);
  return bytes;
}

function mountInput(bytes = syntheticPointRange()) {
  return {
    range: {
      bytes,
      handleId: "point-range:synthetic:0",
      mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
      sha256: sha256(bytes),
    },
    source: {
      coordinateReferenceStatus: "unqualified",
      fingerprint: `sha256:${"a".repeat(64)}`,
      format: "synthetic-points",
      revisionId: "synthetic-points:r1",
      semanticAuthority: false,
    },
  };
}

test("point range preserves Float64 origin and bounded interleaved points", () => {
  const bytes = syntheticPointRange();
  const decoded = decodeBimPointRange(bytes);
  assert.equal(decoded.schema, "bim-explorer-decoded-point-range/1");
  assert.equal(decoded.byteLength, 48 + 4 * 16);
  assert.equal(decoded.payloadBytes, 64);
  assert.equal(decoded.pointCount, 4);
  assert.equal(decoded.pointStrideBytes, 16);
  assert.deepEqual(decoded.origin, [
    1_000_000,
    2_000_000,
    3_000_000,
  ]);
  assert.deepEqual(decoded.relativeBounds, {
    min: [-2, -1, 0],
    max: [2, 1, 1],
  });
  assert.deepEqual(decoded.bounds, {
    min: [999_998, 1_999_999, 3_000_000],
    max: [1_000_002, 2_000_001, 3_000_001],
  });
  assert.deepEqual(decoded.colorRange, {
    min: [0, 0, 0, 128],
    max: [255, 255, 255, 255],
  });
});

test("point range rejects malformed and unbounded payloads", () => {
  const bytes = syntheticPointRange();
  const magic = bytes.slice();
  magic[0] = 0;
  assert.throws(
    () => decodeBimPointRange(magic),
    /magic is invalid/u,
  );
  assert.throws(
    () => decodeBimPointRange(bytes.subarray(0, bytes.length - 1)),
    /truncated or has trailing bytes/u,
  );
  const trailing = new Uint8Array(bytes.length + 1);
  trailing.set(bytes);
  assert.throws(
    () => decodeBimPointRange(trailing),
    /truncated or has trailing bytes/u,
  );
  const nonFinite = bytes.slice();
  new DataView(nonFinite.buffer).setFloat32(48, Infinity, true);
  assert.throws(
    () => decodeBimPointRange(nonFinite),
    /non-finite/u,
  );
  assert.throws(
    () => decodeBimPointRange(bytes, { maximumPoints: 3 }),
    /configured limit/u,
  );
  assert.throws(
    () => decodeBimPointRange(bytes, { maximumPayloadBytes: 63 }),
    /configured limit/u,
  );
});

test("headless point renderer accounts for and releases the exact upload", async () => {
  const backend = createHeadlessPointCloudBackend();
  const renderer = createBoundedPointCloudRenderer({ backend });
  const receipt = await renderer.mount(mountInput());
  assert.equal(receipt.schema, BIM_POINT_RENDERER_RECEIPT);
  assert.equal(receipt.status, "mounted");
  assert.equal(receipt.metrics.points, 4);
  assert.equal(receipt.metrics.drawCalls, 1);
  assert.equal(receipt.metrics.gpuBytes, 64);
  assert.equal(receipt.metrics.cpuStagingPeakBytes, 112);
  assert.equal(receipt.backend.actualGpu, false);
  assert.equal(receipt.backend.pointPrimitive, "POINTS");
  assert.equal(receipt.cleanup.cpuRangeStagingReleased, true);
  assert.deepEqual(renderer.state, {
    active: true,
    activeBytes: 64,
    activePoints: 4,
    disposed: false,
    mounting: false,
    mounts: 1,
    unmounts: 0,
  });

  const release = await renderer.unmount();
  assert.equal(
    release.schema,
    BIM_POINT_RENDERER_RELEASE_RECEIPT,
  );
  assert.equal(release.releasedBytes, 64);
  assert.equal(release.releasedPoints, 4);
  assert.equal(release.backend.activeBytes, 0);
  assert.equal(release.backend.residentRanges, 0);
  assert.equal(await renderer.dispose(), true);
  assert.equal(await renderer.dispose(), false);
  assert.equal(backend.state.disposed, true);
  assert.equal(backend.state.activeBytes, 0);
});

test("point renderer rejects digest mismatch before backend allocation", async () => {
  const backend = createHeadlessPointCloudBackend();
  const renderer = createBoundedPointCloudRenderer({ backend });
  const input = mountInput();
  input.range.sha256 = "0".repeat(64);
  await assert.rejects(
    renderer.mount(input),
    /digest does not match/u,
  );
  assert.equal(backend.state.mounts, 0);
  assert.equal(renderer.state.active, false);
  assert.equal(await renderer.dispose(), true);
});

test("invalid backend receipt is rolled back before mount rejection", async () => {
  let active = false;
  let unmounts = 0;
  const backend = {
    async mount() {
      active = true;
      return {
        handleId: "invalid-backend:1",
        receipt: {
          actualGpu: true,
          backendId: "invalid-backend",
          drawCalls: 2,
          frameId: "invalid-frame:1",
          glError: 0,
          nonBackgroundPixels: 1,
          pointPrimitive: "POINTS",
          pointSize: 3,
          points: 4,
          rendered: true,
          stagingConsumed: true,
          uploadedBytes: 64,
        },
      };
    },
    async unmount(handleId) {
      assert.equal(handleId, "invalid-backend:1");
      active = false;
      unmounts += 1;
      return {
        receipt: {
          activeBytes: 0,
          backendId: "invalid-backend",
          releasedBytes: 64,
          residentRanges: 0,
        },
      };
    },
    async dispose() {
      assert.equal(active, false);
      return true;
    },
  };
  const renderer = createBoundedPointCloudRenderer({ backend });
  await assert.rejects(
    renderer.mount(mountInput()),
    /backend mount receipt is invalid/u,
  );
  assert.equal(active, false);
  assert.equal(unmounts, 1);
  assert.equal(renderer.state.active, false);
  assert.equal(await renderer.dispose(), true);
});

test("point renderer validates source authority, point size, and cancellation", async () => {
  assert.throws(
    () => createBoundedPointCloudRenderer({
      backend: createHeadlessPointCloudBackend(),
      pointSize: 17,
    }),
    /point size must be between/u,
  );
  const backend = createHeadlessPointCloudBackend();
  const renderer = createBoundedPointCloudRenderer({ backend });
  const authority = mountInput();
  authority.source.semanticAuthority = true;
  await assert.rejects(
    renderer.mount(authority),
    /source identity is invalid/u,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    renderer.mount({
      ...mountInput(),
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(backend.state.mounts, 0);
  assert.equal(await renderer.dispose(), true);
});

test("multiple-scan point envelope is explicit and preserves default caps", async () => {
  const pointCount = 500_001;
  const positions = new Float32Array(pointCount * 3);
  const colors = new Uint8Array(pointCount * 4);
  const bytes = encodeBimPointRange({
    colors,
    origin: [0, 0, 0],
    positions,
  }, {
    maximumPayloadBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
    maximumPoints: BIM_POINT_RANGE_MAXIMUM_POINTS,
  });
  positions.fill(0);
  colors.fill(0);

  const boundedInput = mountInput(bytes);
  const defaultRenderer = createBoundedPointCloudRenderer({
    backend: createHeadlessPointCloudBackend(),
  });
  await assert.rejects(
    defaultRenderer.mount(boundedInput),
    /configured limit/u,
  );
  assert.equal(await defaultRenderer.dispose(), true);

  const expandedRenderer = createBoundedPointCloudRenderer({
    backend: createHeadlessPointCloudBackend(),
    limits: {
      maximumCpuStagingBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
      maximumGpuBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
      maximumPointPayloadBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
      maximumPoints: BIM_POINT_RANGE_MAXIMUM_POINTS,
      maximumRangeBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
    },
  });
  const receipt = await expandedRenderer.mount(boundedInput);
  assert.equal(receipt.metrics.points, pointCount);
  assert.equal(receipt.metrics.gpuBytes, pointCount * 16);
  assert.equal((await expandedRenderer.unmount()).releasedPoints, pointCount);
  assert.equal(await expandedRenderer.dispose(), true);
  bytes.fill(0);
});
