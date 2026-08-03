import assert from "node:assert/strict";
import test from "node:test";

import {
  createMeasurement3d,
  measureAngle3d,
  measureArea3d,
  measureDistance3d,
} from "../../packages/bim-renderer-3d/src/index.mjs";

test("3D measurement computes distance, area, and angle", () => {
  const distance = measureDistance3d([
    [0, 0, 0],
    [3, 4, 0],
  ]);
  assert.equal(distance.type, "distance");
  assert.equal(distance.value, 5);
  assert.equal(distance.coordinateSpace, "source-world");

  const area = measureArea3d([
    [0, 0, 2],
    [4, 0, 2],
    [4, 3, 2],
    [0, 3, 2],
  ]);
  assert.equal(area.type, "area");
  assert.equal(area.value, 12);
  assert.deepEqual(area.normal, [0, 0, 1]);

  const angle = measureAngle3d([
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
  ]);
  assert.equal(angle.type, "angle");
  assert.equal(angle.radians, Math.PI / 2);
  assert.equal(angle.degrees, 90);
});

test("3D measurement rejects degenerate or non-planar input", () => {
  assert.throws(
    () => createMeasurement3d({
      type: "distance",
      points: [
        [1, 1, 1],
        [1, 1, 1],
      ],
    }),
    /must be distinct/u,
  );
  assert.throws(
    () => measureAngle3d([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]),
    /must not be collinear/u,
  );
  assert.throws(
    () => measureArea3d([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
      [0, 2, 1],
    ]),
    /must be planar/u,
  );
});
