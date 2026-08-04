const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must contain ${length} finite numbers`);
  }
  return [...value];
}

export function identityMatrix() {
  return [...IDENTITY];
}

export function multiplyMatrices(left, right) {
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let cursor = 0; cursor < 4; cursor += 1) {
        result[column * 4 + row] +=
          left[cursor * 4 + row] *
          right[column * 4 + cursor];
      }
    }
  }
  return result;
}

export function nodeMatrix(node, label) {
  if (node.matrix !== undefined) {
    if (
      node.translation !== undefined ||
      node.rotation !== undefined ||
      node.scale !== undefined
    ) {
      throw new Error(`${label} cannot combine matrix and TRS`);
    }
    const matrix = finiteVector(node.matrix, 16, `${label}.matrix`);
    if (Math.abs(matrix[15]) < Number.EPSILON) {
      throw new RangeError(`${label}.matrix is not projectable`);
    }
    return matrix;
  }
  const translation = node.translation === undefined
    ? [0, 0, 0]
    : finiteVector(node.translation, 3, `${label}.translation`);
  const rotation = node.rotation === undefined
    ? [0, 0, 0, 1]
    : finiteVector(node.rotation, 4, `${label}.rotation`);
  const scale = node.scale === undefined
    ? [1, 1, 1]
    : finiteVector(node.scale, 3, `${label}.scale`);
  if (scale.some((value) => Math.abs(value) < Number.EPSILON)) {
    throw new RangeError(`${label}.scale cannot collapse an axis`);
  }
  const magnitude = Math.hypot(...rotation);
  if (
    !(magnitude > 0) ||
    Math.abs(magnitude - 1) > 1e-5
  ) {
    throw new RangeError(`${label}.rotation must be a unit quaternion`);
  }
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx,
    (2 * (xy + wz)) * sx,
    (2 * (xz - wy)) * sx,
    0,
    (2 * (xy - wz)) * sy,
    (1 - 2 * (xx + zz)) * sy,
    (2 * (yz + wx)) * sy,
    0,
    (2 * (xz + wy)) * sz,
    (2 * (yz - wx)) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ];
}

export function transformPoint(matrix, point) {
  const x =
    matrix[0] * point[0] +
    matrix[4] * point[1] +
    matrix[8] * point[2] +
    matrix[12];
  const y =
    matrix[1] * point[0] +
    matrix[5] * point[1] +
    matrix[9] * point[2] +
    matrix[13];
  const z =
    matrix[2] * point[0] +
    matrix[6] * point[1] +
    matrix[10] * point[2] +
    matrix[14];
  const w =
    matrix[3] * point[0] +
    matrix[7] * point[1] +
    matrix[11] * point[2] +
    matrix[15];
  if (!Number.isFinite(w) || Math.abs(w) < Number.EPSILON) {
    throw new RangeError("node transform produced an invalid point");
  }
  const result = [x / w, y / w, z / w];
  if (result.some((value) => !Number.isFinite(value))) {
    throw new RangeError("node transform produced a non-finite point");
  }
  return result;
}

export function transformedBounds(matrix, bounds) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const point = transformPoint(matrix, [x, y, z]);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
      }
    }
  }
  return { min, max };
}

export function unionBounds(target, addition) {
  for (let axis = 0; axis < 3; axis += 1) {
    target.min[axis] = Math.min(
      target.min[axis],
      addition.min[axis],
    );
    target.max[axis] = Math.max(
      target.max[axis],
      addition.max[axis],
    );
  }
  return target;
}
