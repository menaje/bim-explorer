import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BIM_POINT_HIERARCHY_CONTRACT,
  BIM_POINT_LOD_RANGE_RECEIPT,
  BIM_POINT_RANGE_MEDIA_TYPE,
  createBoundedPointCloudRenderer,
  createDerivedPointCloudHierarchy,
  decodeBimPointRange,
  encodeBimPointRange,
} from "../../packages/bim-renderer-3d/src/index.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function syntheticHierarchyInput() {
  const positions = new Float32Array(64 * 3);
  const colors = new Uint8Array(64 * 4);
  let point = 0;
  for (let z = 0; z < 4; z += 1) {
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        positions.set([x * 2 - 3, y * 2 - 3, z * 2 - 3], point * 3);
        colors.set([x * 60, y * 60, z * 60, 255], point * 4);
        point += 1;
      }
    }
  }
  const bytes = encodeBimPointRange({
    colors,
    origin: [1_000_000, 2_000_000, 3_000_000],
    positions,
  });
  positions.fill(0);
  colors.fill(0);
  return {
    range: {
      bytes,
      handleId: "range:synthetic:root",
      mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
      sha256: sha256(bytes),
    },
    source: {
      coordinateReferenceStatus: "unqualified",
      fingerprint: `sha256:${"a".repeat(64)}`,
      format: "synthetic-points",
      revisionId: "source-snapshot:synthetic",
      semanticAuthority: false,
    },
  };
}

async function hierarchy() {
  return await createDerivedPointCloudHierarchy(
    syntheticHierarchyInput(),
    {
      levelPointBudgets: [8, 24],
      limits: {
        maximumPointsPerChunk: 8,
      },
    },
  );
}

test("derived point hierarchy builds deterministic octree chunks and LOD levels", async () => {
  const first = await hierarchy();
  const second = await hierarchy();
  assert.equal(first.manifest.contract, BIM_POINT_HIERARCHY_CONTRACT);
  assert.equal(first.manifest.depth, 1);
  assert.equal(first.manifest.chunks.length, 8);
  assert.deepEqual(
    first.manifest.levels.map((level) => ({
      fullDetail: level.fullDetail,
      pointCount: level.pointCount,
      stride: level.stride,
    })),
    [
      { fullDetail: false, pointCount: 8, stride: 8 },
      { fullDetail: false, pointCount: 24, stride: 3 },
      { fullDetail: true, pointCount: 64, stride: 1 },
    ],
  );
  assert.equal(first.manifest.digest, second.manifest.digest);
  assert.equal(first.manifest.hierarchyId, second.manifest.hierarchyId);
  assert.equal(first.manifest.sourcePointCount, 64);
  assert.equal(first.manifest.identity.authority, "derived-point-range-order");
  assert.equal(
    first.manifest.identity.rangeSha256,
    syntheticHierarchyInput().range.sha256,
  );
  assert.ok(first.state.retainedBytes > 0);
  assert.equal(await first.dispose(), true);
  assert.equal(first.state.retainedBytes, 0);
  assert.equal(first.state.indexBytes, 0);
  assert.equal(await first.dispose(), false);
  await second.dispose();
});

test("point hierarchy materializes bounded coarse, selected-chunk, and root ranges", async () => {
  const value = await hierarchy();
  const coarse = await value.readLevel("lod:0");
  assert.equal(coarse.receipt.schema, BIM_POINT_LOD_RANGE_RECEIPT);
  assert.equal(coarse.receipt.level.pointCount, 8);
  assert.equal(coarse.receipt.identityMapBytes, 32);
  assert.equal(coarse.range.pointIndices.length, 8);
  assert.equal(decodeBimPointRange(coarse.range.bytes).pointCount, 8);
  assert.equal(
    coarse.range.identityRangeSha256,
    value.manifest.identity.rangeSha256,
  );
  assert.notEqual(coarse.range.sha256, coarse.range.identityRangeSha256);

  const selected = await value.readLevel("lod:1", {
    chunkIds: [value.manifest.chunks[0].id],
  });
  assert.equal(selected.range.lod.chunkCount, 1);
  assert.equal(selected.range.lod.pointCount, 3);
  assert.equal(selected.range.pointIndices.length, 3);

  const full = await value.readLevel("lod:2");
  assert.equal(full.range.lod.fullDetail, true);
  assert.equal(full.range.sha256, value.manifest.identity.rangeSha256);
  assert.equal(full.range.pointIndices, null);
  assert.equal(decodeBimPointRange(full.range.bytes).pointCount, 64);
  assert.equal(value.state.reads, 3);

  coarse.range.bytes.fill(0);
  coarse.range.pointIndices.fill(0);
  selected.range.bytes.fill(0);
  selected.range.pointIndices.fill(0);
  full.range.bytes.fill(0);
  await value.dispose();
});

test("point hierarchy rejects digest drift, invalid chunks, and post-dispose reads", async () => {
  const input = syntheticHierarchyInput();
  input.range.sha256 = "0".repeat(64);
  await assert.rejects(
    createDerivedPointCloudHierarchy(input),
    /root range digest does not match/u,
  );
  const value = await hierarchy();
  await assert.rejects(
    value.readLevel("lod:0", { chunkIds: ["r/missing"] }),
    /chunkIds are invalid/u,
  );
  await value.dispose();
  await assert.rejects(
    value.readLevel("lod:0"),
    { name: "InvalidStateError" },
  );
});

test("LOD point picking maps rendered vertices back to stable root-range order", async () => {
  const value = await hierarchy();
  const coarse = await value.readLevel("lod:0");
  let active = false;
  const backend = {
    async mount(plan) {
      active = true;
      return {
        handleId: "mapped-point-mount:1",
        receipt: {
          actualGpu: false,
          backendId: "mapped-point-backend",
          drawCalls: 1,
          frameId: "mapped-point-frame:1",
          glError: 0,
          nonBackgroundPixels: 0,
          pointPrimitive: "POINTS",
          pointSize: plan.metrics.pointSize,
          points: plan.metrics.points,
          rendered: false,
          stagingConsumed: true,
          uploadedBytes: plan.metrics.gpuBytes,
        },
      };
    },
    async pick(handleId, coordinates) {
      assert.equal(handleId, "mapped-point-mount:1");
      return {
        receipt: {
          actualGpu: false,
          backendId: "mapped-point-backend",
          drawCalls: 1,
          frameId: "mapped-point-pick:1",
          glError: 0,
          hit: true,
          pointIndex: 1,
          temporaryReleased: true,
          temporaryTargetBytes: 4,
          worldPosition: [1_000_001, 1_999_997, 2_999_997],
          ...coordinates,
        },
      };
    },
    async unmount() {
      active = false;
      return {
        receipt: {
          activeBytes: 0,
          backendId: "mapped-point-backend",
          releasedBytes: coarse.receipt.rangeBytes - 48,
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
  const mount = await renderer.mount({
    range: coarse.range,
    source: syntheticHierarchyInput().source,
  });
  assert.equal(mount.metrics.identityMapBytes, 32);
  assert.equal(mount.lod.levelId, "lod:0");
  const pick = await renderer.pick({ x: 4, y: 5 });
  assert.equal(pick.backend.pointIndex, 1);
  assert.equal(
    pick.identity.pointIndex,
    coarse.range.pointIndices[1],
  );
  assert.equal(
    pick.identity.nativeId,
    `point:${coarse.range.pointIndices[1]}`,
  );
  assert.equal(
    pick.identity.rangeSha256,
    value.manifest.identity.rangeSha256,
  );
  assert.equal(pick.identity.renderedPointIndex, 1);
  assert.equal(pick.identity.renderedRangeSha256, coarse.range.sha256);
  const release = await renderer.unmount();
  assert.equal(release.releasedIdentityMapBytes, 32);
  assert.equal(renderer.state.activeIdentityMapBytes, 0);
  await renderer.dispose();
  coarse.range.bytes.fill(0);
  coarse.range.pointIndices.fill(0);
  await value.dispose();
});
