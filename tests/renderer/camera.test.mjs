import assert from "node:assert/strict";
import test from "node:test";

import {
  BIM_CAMERA_3D_SCHEMA,
  cameraViewProjectionMatrix,
  createFitCamera3d,
  orbitCamera3d,
  panCamera3d,
  unprojectCameraPoint3d,
  validateCamera3d,
  zoomCamera3d,
} from "../../packages/bim-renderer-3d/src/index.mjs";

const BOUNDS = Object.freeze({
  min: [-1, -2, -3],
  max: [9, 8, 7],
});

function project(matrix, point) {
  const source = [...point, 1];
  const clip = [0, 0, 0, 0];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      clip[row] +=
        matrix[column * 4 + row] * source[column];
    }
  }
  return clip.slice(0, 3).map((value) => value / clip[3]);
}

test("fit camera centers bounds in perspective and orthographic views", () => {
  const perspective = createFitCamera3d(BOUNDS, {
    aspect: 16 / 9,
  });
  assert.equal(perspective.schema, BIM_CAMERA_3D_SCHEMA);
  assert.equal(perspective.projection, "perspective");
  assert.deepEqual(perspective.target, [4, 3, 2]);
  assert.ok(perspective.distance > 0);
  assert.ok(perspective.far > perspective.near);

  const perspectiveMatrix = cameraViewProjectionMatrix(
    perspective,
    16 / 9,
  );
  const perspectiveTarget = project(
    perspectiveMatrix,
    perspective.target,
  );
  assert.ok(Math.abs(perspectiveTarget[0]) < 1e-6);
  assert.ok(Math.abs(perspectiveTarget[1]) < 1e-6);
  assert.ok(Math.abs(perspectiveTarget[2]) < 1);

  const orthographic = createFitCamera3d(BOUNDS, {
    aspect: 16 / 9,
    projection: "orthographic",
  });
  const orthographicTarget = project(
    cameraViewProjectionMatrix(orthographic, 16 / 9),
    orthographic.target,
  );
  assert.ok(Math.abs(orthographicTarget[0]) < 1e-6);
  assert.ok(Math.abs(orthographicTarget[1]) < 1e-6);
  assert.ok(Math.abs(orthographicTarget[2]) < 1);
});

test("camera orbit, zoom, and pan return validated immutable states", () => {
  const fit = createFitCamera3d(BOUNDS);
  const orbited = orbitCamera3d(fit, {
    pitch: 0.1,
    yaw: 0.2,
  });
  const zoomed = zoomCamera3d(orbited, 0.5);
  const panned = panCamera3d(zoomed, {
    right: 0.01,
    up: 0.02,
  });

  assert.notEqual(orbited.yaw, fit.yaw);
  assert.notEqual(orbited.pitch, fit.pitch);
  assert.equal(zoomed.distance, orbited.distance * 0.5);
  assert.equal(
    zoomed.orthographicHeight,
    orbited.orthographicHeight * 0.5,
  );
  assert.notDeepEqual(panned.target, zoomed.target);
  assert.ok(Object.isFrozen(panned));
  assert.ok(Object.isFrozen(panned.target));
  assert.deepEqual(validateCamera3d(panned), panned);
});

test("camera validation rejects malformed frustums and bounds", () => {
  const camera = createFitCamera3d(BOUNDS);
  assert.throws(
    () => validateCamera3d({
      ...camera,
      far: camera.near,
    }),
    /frustum or pitch is invalid/u,
  );
  assert.throws(
    () => createFitCamera3d({
      min: [0, 0, 0],
      max: [0, 0, 0],
    }),
    /bounds are invalid/u,
  );
  assert.throws(
    () => zoomCamera3d(camera, 0),
    /zoom factor must be positive/u,
  );
});

test("camera unprojects perspective and orthographic pixels", () => {
  for (const projection of ["perspective", "orthographic"]) {
    const camera = createFitCamera3d(BOUNDS, {
      aspect: 16 / 9,
      projection,
    });
    const matrix = cameraViewProjectionMatrix(camera, 16 / 9);
    const point = camera.target;
    const clip = [0, 1, 2, 3].map((row) =>
      matrix[row] * point[0] +
      matrix[4 + row] * point[1] +
      matrix[8 + row] * point[2] +
      matrix[12 + row]);
    const ndc = clip.map((value) => value / clip[3]);
    const x = (ndc[0] + 1) * 480 - 0.5;
    const y = (1 - ndc[1]) * 270 - 0.5;
    const depth = (ndc[2] + 1) / 2;
    const restored = unprojectCameraPoint3d(camera, {
      depth,
      height: 540,
      width: 960,
      x,
      y,
    });
    for (const [axis, value] of restored.entries()) {
      assert.ok(Math.abs(value - point[axis]) < 1e-5);
    }
  }
});
