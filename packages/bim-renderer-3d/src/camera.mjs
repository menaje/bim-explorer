export const BIM_CAMERA_3D_SCHEMA =
  "bim-explorer-camera-3d/0.1";

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function positiveNumber(value, label) {
  finiteNumber(value, label);
  if (!(value > 0)) {
    throw new RangeError(`${label} must be positive`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every((item) =>
      typeof item === "number" && Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must be a finite vector`);
  }
  return Object.freeze([...value]);
}

function normalizedAngle(value) {
  const circle = Math.PI * 2;
  return ((value + Math.PI) % circle + circle) % circle - Math.PI;
}

export function validateCamera3d(value) {
  const camera = plainRecord(value, "camera");
  if (
    camera.schema !== BIM_CAMERA_3D_SCHEMA ||
    !["perspective", "orthographic"].includes(camera.projection)
  ) {
    throw new TypeError("camera schema or projection is invalid");
  }
  const yaw = finiteNumber(camera.yaw, "camera.yaw");
  const pitch = finiteNumber(camera.pitch, "camera.pitch");
  const distance = positiveNumber(
    camera.distance,
    "camera.distance",
  );
  const fieldOfViewY = positiveNumber(
    camera.fieldOfViewY,
    "camera.fieldOfViewY",
  );
  const orthographicHeight = positiveNumber(
    camera.orthographicHeight,
    "camera.orthographicHeight",
  );
  const near = positiveNumber(camera.near, "camera.near");
  const far = positiveNumber(camera.far, "camera.far");
  if (
    Math.abs(pitch) >= Math.PI / 2 ||
    fieldOfViewY >= Math.PI ||
    far <= near
  ) {
    throw new RangeError("camera frustum or pitch is invalid");
  }
  return Object.freeze({
    schema: BIM_CAMERA_3D_SCHEMA,
    projection: camera.projection,
    target: finiteVector(camera.target, 3, "camera.target"),
    yaw: normalizedAngle(yaw),
    pitch,
    distance,
    fieldOfViewY,
    orthographicHeight,
    near,
    far,
  });
}

function validatedBounds(value) {
  const bounds = plainRecord(value, "camera fit bounds");
  const minimum = finiteVector(bounds.min, 3, "camera fit bounds.min");
  const maximum = finiteVector(bounds.max, 3, "camera fit bounds.max");
  const extent = maximum.map(
    (value, axis) => value - minimum[axis],
  );
  if (
    extent.some((value) => value < 0) ||
    extent.every((value) => value === 0)
  ) {
    throw new RangeError("camera fit bounds are invalid");
  }
  return {
    extent,
    maximum,
    minimum,
  };
}

export function createFitCamera3d(
  boundsValue,
  {
    aspect = 16 / 9,
    projection = "perspective",
  } = {},
) {
  const bounds = validatedBounds(boundsValue);
  positiveNumber(aspect, "camera fit aspect");
  if (!["perspective", "orthographic"].includes(projection)) {
    throw new TypeError("camera fit projection is invalid");
  }
  const target = bounds.minimum.map(
    (value, axis) => (value + bounds.maximum[axis]) / 2,
  );
  const radius = Math.max(
    Math.hypot(...bounds.extent) / 2,
    0.001,
  );
  const fieldOfViewY = Math.PI / 4;
  const horizontalFieldOfView =
    2 * Math.atan(Math.tan(fieldOfViewY / 2) * aspect);
  const limitingFieldOfView = Math.min(
    fieldOfViewY,
    horizontalFieldOfView,
  );
  const distance =
    radius / Math.sin(limitingFieldOfView / 2) * 1.08;
  return validateCamera3d({
    schema: BIM_CAMERA_3D_SCHEMA,
    projection,
    target,
    yaw: Math.PI / 4,
    pitch: Math.PI / 6,
    distance,
    fieldOfViewY,
    orthographicHeight: radius * 2.2,
    near: Math.max(distance - radius * 1.8, radius * 0.001),
    far: distance + radius * 2.5,
  });
}

export function orbitCamera3d(
  cameraValue,
  {
    pitch = 0,
    yaw = 0,
  } = {},
) {
  const camera = validateCamera3d(cameraValue);
  finiteNumber(pitch, "camera orbit pitch");
  finiteNumber(yaw, "camera orbit yaw");
  const maximumPitch = Math.PI / 2 - 0.01;
  return validateCamera3d({
    ...camera,
    yaw: camera.yaw + yaw,
    pitch: Math.max(
      -maximumPitch,
      Math.min(maximumPitch, camera.pitch + pitch),
    ),
  });
}

export function zoomCamera3d(
  cameraValue,
  factor,
) {
  const camera = validateCamera3d(cameraValue);
  positiveNumber(factor, "camera zoom factor");
  return validateCamera3d({
    ...camera,
    distance: camera.distance * factor,
    orthographicHeight: camera.orthographicHeight * factor,
    near: camera.near * factor,
    far: camera.far * factor,
  });
}

export function panCamera3d(
  cameraValue,
  {
    right = 0,
    up = 0,
  } = {},
) {
  const camera = validateCamera3d(cameraValue);
  finiteNumber(right, "camera pan right");
  finiteNumber(up, "camera pan up");
  const horizontal = [
    -Math.sin(camera.yaw),
    Math.cos(camera.yaw),
    0,
  ];
  const forward = [
    -Math.cos(camera.pitch) * Math.cos(camera.yaw),
    -Math.cos(camera.pitch) * Math.sin(camera.yaw),
    -Math.sin(camera.pitch),
  ];
  const vertical = [
    horizontal[1] * forward[2] -
      horizontal[2] * forward[1],
    horizontal[2] * forward[0] -
      horizontal[0] * forward[2],
    horizontal[0] * forward[1] -
      horizontal[1] * forward[0],
  ];
  const scale = camera.projection === "perspective"
    ? camera.distance
    : camera.orthographicHeight;
  const target = camera.target.map(
    (value, axis) =>
      value +
      horizontal[axis] * right * scale +
      vertical[axis] * up * scale,
  );
  return validateCamera3d({
    ...camera,
    target,
  });
}

function multiply(left, right) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value +=
          left[index * 4 + row] *
          right[column * 4 + index];
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalized(value) {
  const length = Math.hypot(...value);
  if (!(length > 0)) {
    throw new RangeError("camera direction has no length");
  }
  return value.map((item) => item / length);
}

function cameraBasis(camera) {
  const eye = [
    camera.target[0] +
      camera.distance * Math.cos(camera.pitch) *
        Math.cos(camera.yaw),
    camera.target[1] +
      camera.distance * Math.cos(camera.pitch) *
        Math.sin(camera.yaw),
    camera.target[2] +
      camera.distance * Math.sin(camera.pitch),
  ];
  const forward = normalized(
    camera.target.map((value, axis) => value - eye[axis]),
  );
  const right = normalized(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  return {
    eye,
    forward,
    right,
    up,
  };
}

function lookAt(camera) {
  const {
    eye,
    forward,
    right,
    up,
  } = cameraBasis(camera);
  return new Float32Array([
    right[0],
    up[0],
    -forward[0],
    0,
    right[1],
    up[1],
    -forward[1],
    0,
    right[2],
    up[2],
    -forward[2],
    0,
    -right.reduce(
      (sum, value, axis) => sum + value * eye[axis],
      0,
    ),
    -up.reduce(
      (sum, value, axis) => sum + value * eye[axis],
      0,
    ),
    forward.reduce(
      (sum, value, axis) => sum + value * eye[axis],
      0,
    ),
    1,
  ]);
}

function perspective(camera, aspect) {
  const scale = 1 / Math.tan(camera.fieldOfViewY / 2);
  const depth = camera.near - camera.far;
  return new Float32Array([
    scale / aspect,
    0,
    0,
    0,
    0,
    scale,
    0,
    0,
    0,
    0,
    (camera.far + camera.near) / depth,
    -1,
    0,
    0,
    2 * camera.far * camera.near / depth,
    0,
  ]);
}

function orthographic(camera, aspect) {
  const height = camera.orthographicHeight;
  const width = height * aspect;
  const depth = camera.far - camera.near;
  return new Float32Array([
    2 / width,
    0,
    0,
    0,
    0,
    2 / height,
    0,
    0,
    0,
    0,
    -2 / depth,
    0,
    0,
    0,
    -(camera.far + camera.near) / depth,
    1,
  ]);
}

export function cameraViewProjectionMatrix(
  cameraValue,
  aspect,
) {
  const camera = validateCamera3d(cameraValue);
  positiveNumber(aspect, "camera aspect");
  const projection = camera.projection === "perspective"
    ? perspective(camera, aspect)
    : orthographic(camera, aspect);
  return multiply(projection, lookAt(camera));
}

export function unprojectCameraPoint3d(
  cameraValue,
  {
    depth,
    height,
    width,
    x,
    y,
  } = {},
) {
  const camera = validateCamera3d(cameraValue);
  positiveNumber(width, "camera unproject width");
  positiveNumber(height, "camera unproject height");
  finiteNumber(x, "camera unproject x");
  finiteNumber(y, "camera unproject y");
  finiteNumber(depth, "camera unproject depth");
  if (
    x < 0 ||
    x >= width ||
    y < 0 ||
    y >= height ||
    depth < 0 ||
    depth > 1
  ) {
    throw new RangeError(
      "camera unproject coordinate is outside the frame",
    );
  }
  const aspect = width / height;
  const ndcX = ((x + 0.5) / width) * 2 - 1;
  const ndcY = 1 - ((y + 0.5) / height) * 2;
  const ndcZ = depth * 2 - 1;
  let viewX;
  let viewY;
  let viewZ;
  if (camera.projection === "perspective") {
    const scale = 1 / Math.tan(camera.fieldOfViewY / 2);
    const depthRange = camera.near - camera.far;
    const depthScale =
      (camera.far + camera.near) / depthRange;
    const depthOffset =
      2 * camera.far * camera.near / depthRange;
    viewZ = -depthOffset / (ndcZ + depthScale);
    viewX = ndcX * -viewZ * aspect / scale;
    viewY = ndcY * -viewZ / scale;
  } else {
    const frustumDepth = camera.far - camera.near;
    viewX =
      ndcX * camera.orthographicHeight * aspect / 2;
    viewY = ndcY * camera.orthographicHeight / 2;
    viewZ = -(
      ndcZ * frustumDepth +
      camera.far +
      camera.near
    ) / 2;
  }
  const {
    eye,
    forward,
    right,
    up,
  } = cameraBasis(camera);
  return Object.freeze(
    eye.map(
      (value, axis) =>
        value +
        right[axis] * viewX +
        up[axis] * viewY -
        forward[axis] * viewZ,
    ),
  );
}
