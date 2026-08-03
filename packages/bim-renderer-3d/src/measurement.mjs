export const BIM_MEASUREMENT_3D_SCHEMA =
  "bim-explorer-measurement-3d/0.1";

function finitePoint(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((item) =>
      typeof item === "number" && Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must be a finite 3D point`);
  }
  return Object.freeze([...value]);
}

function points(value, expected, label) {
  if (
    !Array.isArray(value) ||
    (Array.isArray(expected)
      ? !expected.includes(value.length)
      : value.length !== expected)
  ) {
    throw new RangeError(`${label} point count is invalid`);
  }
  return Object.freeze(
    value.map((point, index) =>
      finitePoint(point, `${label}[${index}]`)),
  );
}

function vector(from, to) {
  return to.map((value, axis) => value - from[axis]);
}

function length(value) {
  return Math.hypot(...value);
}

function base(type, measuredPoints) {
  return {
    schema: BIM_MEASUREMENT_3D_SCHEMA,
    type,
    points: measuredPoints,
    coordinateSpace: "source-world",
    unit: "source-coordinate-unit",
  };
}

export function measureDistance3d(pointValues) {
  const measuredPoints = points(
    pointValues,
    2,
    "distance measurement points",
  );
  const value = length(
    vector(measuredPoints[0], measuredPoints[1]),
  );
  if (!(value > 0)) {
    throw new RangeError(
      "distance measurement points must be distinct",
    );
  }
  return Object.freeze({
    ...base("distance", measuredPoints),
    value,
  });
}

export function measureAngle3d(pointValues) {
  const measuredPoints = points(
    pointValues,
    3,
    "angle measurement points",
  );
  const first = vector(
    measuredPoints[1],
    measuredPoints[0],
  );
  const second = vector(
    measuredPoints[1],
    measuredPoints[2],
  );
  const firstLength = length(first);
  const secondLength = length(second);
  if (!(firstLength > 0) || !(secondLength > 0)) {
    throw new RangeError(
      "angle measurement legs must have length",
    );
  }
  const cosine = first.reduce(
    (sum, value, axis) =>
      sum + value * second[axis],
    0,
  ) / (firstLength * secondLength);
  const radians = Math.acos(
    Math.max(-1, Math.min(1, cosine)),
  );
  if (!(radians > 0) || !(radians < Math.PI)) {
    throw new RangeError(
      "angle measurement points must not be collinear",
    );
  }
  return Object.freeze({
    ...base("angle", measuredPoints),
    radians,
    degrees: radians * 180 / Math.PI,
  });
}

export function measureArea3d(pointValues) {
  const measuredPoints = points(
    pointValues,
    [3, 4, 5, 6, 7, 8],
    "area measurement points",
  );
  const normal = [0, 0, 0];
  for (
    let index = 0;
    index < measuredPoints.length;
    index += 1
  ) {
    const current = measuredPoints[index];
    const next =
      measuredPoints[(index + 1) % measuredPoints.length];
    normal[0] +=
      (current[1] - next[1]) * (current[2] + next[2]);
    normal[1] +=
      (current[2] - next[2]) * (current[0] + next[0]);
    normal[2] +=
      (current[0] - next[0]) * (current[1] + next[1]);
  }
  const normalLength = length(normal);
  const value = normalLength / 2;
  if (!(value > 0)) {
    throw new RangeError(
      "area measurement polygon must have area",
    );
  }
  const unitNormal = normal.map(
    (component) => component / normalLength,
  );
  const origin = measuredPoints[0];
  const scale = Math.max(
    1,
    ...measuredPoints.map((point) =>
      length(vector(origin, point))),
  );
  const tolerance = scale * 1e-6;
  if (
    measuredPoints.some((point) =>
      Math.abs(
        vector(origin, point).reduce(
          (sum, component, axis) =>
            sum + component * unitNormal[axis],
          0,
        ),
      ) > tolerance)
  ) {
    throw new RangeError(
      "area measurement polygon must be planar",
    );
  }
  return Object.freeze({
    ...base("area", measuredPoints),
    value,
    normal: Object.freeze(unitNormal),
  });
}

export function createMeasurement3d({
  points: pointValues,
  type,
} = {}) {
  if (type === "distance") {
    return measureDistance3d(pointValues);
  }
  if (type === "angle") {
    return measureAngle3d(pointValues);
  }
  if (type === "area") {
    return measureArea3d(pointValues);
  }
  throw new TypeError("measurement type is unsupported");
}
