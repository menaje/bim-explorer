import {
  decodeBimGeometryRange,
} from "../../bim-renderer-3d/src/index.mjs";
import {
  unprojectCameraPoint3d,
  validateCamera3d,
} from "../../bim-renderer-3d/src/camera.mjs";

export const BIM_SURFACE_HIT_CONTRACT =
  "bim-explorer-bim-surface-hit/0.1";
export const BIM_SURFACE_HIT_SCHEMA =
  "bim-explorer-bim-surface-hit-receipt/0.1";
export const BIM_SURFACE_HIT_RENDERER_CONTRACT =
  "bim-explorer-bim-surface-hit-renderer/0.1";

const RENDERER_PICK_SCHEMA =
  "bim-explorer-bim-renderer-3d-pick-receipt/0.1";
const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DEFAULT_LIMITS = Object.freeze({
  maximumReadBytes: 1024 * 1024,
  maximumRangeBytes: 4 * 1024 * 1024,
  maximumSurfaceReadBytes: 4 * 1024 * 1024,
  maximumTriangles: 1_000_000,
});
const DEPTH_STEPS = 32_767;

function deepFreeze(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !ArrayBuffer.isView(value) &&
    !Object.isFrozen(value)
  ) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ArrayBuffer.isView(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new TypeError(
      `${label} must contain ${length} finite numbers`,
    );
  }
  return [...value];
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ??
      new DOMException("operation aborted", "AbortError");
  }
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function unavailable(message) {
  return new DOMException(message, "NotSupportedError");
}

function validatedLimits(overrides, rendererLimits) {
  const values = plainRecord(overrides, "surface-hit limits");
  for (const key of Object.keys(values)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(
        `surface-hit limit ${key} is unsupported`,
      );
    }
  }
  const limits = {
    ...DEFAULT_LIMITS,
    maximumReadBytes:
      rendererLimits?.maximumReadBytes ??
      DEFAULT_LIMITS.maximumReadBytes,
    maximumRangeBytes:
      rendererLimits?.maximumRangeBytes ??
      DEFAULT_LIMITS.maximumRangeBytes,
    maximumSurfaceReadBytes:
      rendererLimits?.maximumSourceReadBytes ??
      DEFAULT_LIMITS.maximumSurfaceReadBytes,
    ...values,
  };
  for (const [key, value] of Object.entries(limits)) {
    positiveInteger(value, `surface-hit limits.${key}`);
  }
  if (
    limits.maximumReadBytes > limits.maximumRangeBytes ||
    limits.maximumRangeBytes >
      limits.maximumSurfaceReadBytes
  ) {
    throw new RangeError(
      "surface-hit byte limits must be monotonically bounded",
    );
  }
  return Object.freeze(limits);
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("surface-hit SHA-256 is unavailable");
  }
  const result = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes,
  );
  return bytesToHex(new Uint8Array(result));
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function addScaled(origin, direction, distance) {
  return origin.map(
    (value, index) => value + direction[index] * distance,
  );
}

function dot(left, right) {
  return left.reduce(
    (sum, value, index) => sum + value * right[index],
    0,
  );
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalized(value, label) {
  const magnitude = Math.hypot(...value);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new RangeError(`${label} has no length`);
  }
  return value.map((component) => {
    const result = component / magnitude;
    return Object.is(result, -0) ? 0 : result;
  });
}

function distance(left, right) {
  return Math.hypot(...subtract(left, right));
}

function multiplyTransform(leftValue, rightValue) {
  const left = finiteVector(leftValue, 16, "left transform");
  const right = finiteVector(rightValue, 16, "right transform");
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[column * 4 + row] +=
          left[index * 4 + row] *
          right[column * 4 + index];
      }
    }
  }
  return result;
}

function transformPoint(matrixValue, pointValue) {
  const matrix = finiteVector(matrixValue, 16, "surface transform");
  const [x, y, z] = finiteVector(
    pointValue,
    3,
    "surface vertex",
  );
  const w =
    matrix[3] * x + matrix[7] * y +
    matrix[11] * z + matrix[15];
  if (!Number.isFinite(w) || Math.abs(w) <= Number.EPSILON) {
    throw new RangeError("surface vertex is not projectable");
  }
  return [
    (matrix[0] * x + matrix[4] * y +
      matrix[8] * z + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y +
      matrix[9] * z + matrix[13]) / w,
    (matrix[2] * x + matrix[6] * y +
      matrix[10] * z + matrix[14]) / w,
  ];
}

function intersectTriangle(origin, direction, vertices) {
  const [a, b, c] = vertices;
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const p = cross(direction, edge2);
  const determinant = dot(edge1, p);
  const scale = Math.max(
    1,
    Math.hypot(...edge1),
    Math.hypot(...edge2),
  );
  const epsilon = scale * 1e-12;
  if (Math.abs(determinant) <= epsilon) {
    return null;
  }
  const inverse = 1 / determinant;
  const fromA = subtract(origin, a);
  const u = dot(fromA, p) * inverse;
  const q = cross(fromA, edge1);
  const v = dot(direction, q) * inverse;
  const rayDistance = dot(edge2, q) * inverse;
  const boundary = 1e-9;
  if (
    u < -boundary ||
    v < -boundary ||
    u + v > 1 + boundary ||
    rayDistance < -boundary
  ) {
    return null;
  }
  const barycentric = [
    Math.max(0, 1 - u - v),
    Math.max(0, u),
    Math.max(0, v),
  ];
  const total = barycentric.reduce((sum, value) => sum + value, 0);
  const normalizedBarycentric = barycentric.map(
    (value) => value / total,
  );
  const point = a.map((value, axis) =>
    value * normalizedBarycentric[0] +
    b[axis] * normalizedBarycentric[1] +
    c[axis] * normalizedBarycentric[2]);
  return {
    barycentric: normalizedBarycentric,
    normal: normalized(
      cross(edge1, edge2),
      "surface triangle normal",
    ),
    point,
    rayDistance: Math.max(0, rayDistance),
  };
}

function geometryHandles(snapshot) {
  const layer = snapshot.layers?.find((candidate) =>
    candidate.layerId === snapshot.layerId);
  if (!Array.isArray(layer?.rangeHandles)) {
    throw new TypeError(
      "surface-hit snapshot geometry handles are unavailable",
    );
  }
  return new Map(layer.rangeHandles.map((handle, index) => {
    const value = plainRecord(
      handle,
      `surface-hit range handle ${index}`,
    );
    if (
      typeof value.handleId !== "string" ||
      value.handleId.length === 0 ||
      !SHA256.test(value.sha256 ?? "")
    ) {
      throw new TypeError("surface-hit range handle is invalid");
    }
    positiveInteger(value.byteLength, "surface-hit range bytes");
    positiveInteger(
      value.maximumRequestBytes,
      "surface-hit range request bytes",
    );
    return [value.handleId, value];
  }));
}

async function readExactRange(
  session,
  handle,
  limits,
  signal,
) {
  if (
    handle.byteLength > limits.maximumRangeBytes ||
    handle.byteLength > limits.maximumSurfaceReadBytes
  ) {
    throw unavailable(
      "surface geometry range exceeds the resolver byte limit",
    );
  }
  const bytes = new Uint8Array(handle.byteLength);
  let reads = 0;
  try {
    for (let offset = 0; offset < bytes.byteLength;) {
      aborted(signal);
      const length = Math.min(
        handle.maximumRequestBytes,
        limits.maximumReadBytes,
        bytes.byteLength - offset,
      );
      const chunk = await session.readRange(
        handle,
        offset,
        length,
        { signal },
      );
      if (
        !(chunk instanceof Uint8Array) ||
        chunk.byteLength !== length
      ) {
        chunk?.fill?.(0);
        throw new Error(
          "surface-hit range returned invalid bytes",
        );
      }
      bytes.set(chunk, offset);
      chunk.fill(0);
      reads += 1;
      offset += length;
    }
    if (await sha256(bytes) !== handle.sha256) {
      throw new Error("surface-hit range digest differs");
    }
    return { bytes, reads };
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

function recordMap(bytes, limits) {
  const decoded = decodeBimGeometryRange(bytes, {
    maximumRecords: limits.maximumTriangles,
    maximumPayloadBytes: limits.maximumRangeBytes,
  });
  return {
    decoded,
    records: new Map(decoded.records.map((record) => [
      record.geometryExpressId,
      record,
    ])),
  };
}

function vertex(view, record, index) {
  if (!Number.isSafeInteger(index) || index < 0 ||
    index >= record.vertexCount) {
    throw new RangeError("surface-hit vertex index is invalid");
  }
  const offset = record.vertexPayload.offset +
    index * 6 * Float32Array.BYTES_PER_ELEMENT;
  return [
    view.getFloat32(offset, true),
    view.getFloat32(offset + 4, true),
    view.getFloat32(offset + 8, true),
  ];
}

function triangleVertices(view, record, triangleIndex) {
  const offset = record.indexPayload.offset +
    triangleIndex * 3 * Uint32Array.BYTES_PER_ELEMENT;
  return [0, 1, 2].map((index) =>
    vertex(
      view,
      record,
      view.getUint32(
        offset + index * Uint32Array.BYTES_PER_ELEMENT,
        true,
      ),
    ));
}

function ray(camera, coordinates, viewport) {
  const near = unprojectCameraPoint3d(camera, {
    ...coordinates,
    ...viewport,
    depth: 0,
  });
  const far = unprojectCameraPoint3d(camera, {
    ...coordinates,
    ...viewport,
    depth: 1,
  });
  return {
    direction: normalized(
      subtract(far, near),
      "surface-hit camera ray",
    ),
    origin: [...near],
  };
}

function depthTolerance(camera, pick, viewport, point) {
  const depth = pick.backend?.depth;
  if (
    typeof depth !== "number" ||
    !Number.isFinite(depth) ||
    depth < 0 ||
    depth > 1
  ) {
    throw new TypeError(
      "surface-hit renderer depth is invalid",
    );
  }
  const coordinates = {
    x: pick.coordinates.x,
    y: pick.coordinates.y,
  };
  const projected = unprojectCameraPoint3d(camera, {
    ...coordinates,
    ...viewport,
    depth,
  });
  const halfStep = 0.5 / DEPTH_STEPS;
  const boundaries = [
    Math.max(0, depth - halfStep),
    Math.min(1, depth + halfStep),
  ].map((candidate) => unprojectCameraPoint3d(camera, {
    ...coordinates,
    ...viewport,
    depth: candidate,
  }));
  const numericAllowance = Math.max(
    1,
    ...point.map(Math.abs),
  ) * 2e-6;
  return {
    error: distance(point, pick.worldPosition),
    rendererProjectionError:
      distance(projected, pick.worldPosition),
    tolerance:
      Math.max(...boundaries.map((boundary) =>
        distance(projected, boundary))) * 1.01 +
      numericAllowance,
  };
}

function validateResolverInput({
  camera: cameraValue,
  pick: pickValue,
  session,
  snapshot: snapshotValue,
  viewport: viewportValue,
}) {
  const pick = plainRecord(pickValue, "surface-hit renderer pick");
  const snapshot = plainRecord(
    snapshotValue,
    "surface-hit renderer snapshot",
  );
  const viewport = plainRecord(
    viewportValue,
    "surface-hit viewport",
  );
  if (
    pick.schema !== RENDERER_PICK_SCHEMA ||
    pick.status !== "hit" ||
    pick.backend?.actualGpu !== true ||
    pick.backend.context !== "webgl2" ||
    pick.backend.temporaryReleased !== true ||
    pick.source?.fingerprint !== snapshot.source?.fingerprint ||
    pick.source?.revisionId !== snapshot.revisionId ||
    !SOURCE_FINGERPRINT.test(snapshot.source?.fingerprint ?? "") ||
    typeof session?.readRange !== "function"
  ) {
    throw new TypeError(
      "surface-hit requires an exact actual WebGL2 renderer pick",
    );
  }
  positiveInteger(viewport.width, "surface-hit viewport width");
  positiveInteger(viewport.height, "surface-hit viewport height");
  finiteVector(pick.worldPosition, 3, "surface-hit world position");
  const matches = snapshot.entities?.filter((entity) =>
    entity.renderable === true &&
    entity.pickId === pick.identity?.pickId &&
    entity.expressId === pick.identity?.expressId &&
    entity.nativeId === pick.identity?.nativeId);
  if (matches?.length !== 1) {
    throw new RangeError(
      "surface-hit Pick ID is outside the exact projection",
    );
  }
  return {
    camera: validateCamera3d(cameraValue),
    entity: matches[0],
    pick,
    session,
    snapshot,
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
  };
}

export async function resolveBimSurfaceHit(
  value,
  {
    limits: limitOverrides = {},
    residentRangeIds = null,
    signal,
  } = {},
) {
  aborted(signal);
  const input = validateResolverInput(value);
  const limits = validatedLimits(limitOverrides, {});
  const handles = geometryHandles(input.snapshot);
  const resident = residentRangeIds === null
    ? new Set(handles.keys())
    : new Set(residentRangeIds);
  if (
    resident.size === 0 ||
    [...resident].some((rangeId) => !handles.has(rangeId))
  ) {
    throw new RangeError(
      "surface-hit resident range identity is invalid",
    );
  }
  const primitivesByRange = new Map();
  for (
    const [primitiveIndex, primitive] of
      input.entity.primitives.entries()
  ) {
    const rangeId = primitive.slice?.rangeId;
    if (!resident.has(rangeId)) {
      continue;
    }
    const list = primitivesByRange.get(rangeId) ?? [];
    list.push({ primitive, primitiveIndex });
    primitivesByRange.set(rangeId, list);
  }
  if (primitivesByRange.size === 0) {
    throw unavailable(
      "selected surface geometry is not resident",
    );
  }
  const cameraRay = ray(
    input.camera,
    input.pick.coordinates,
    input.viewport,
  );
  const sourceFromStorage = finiteVector(
    input.snapshot.coordinateSystem?.sourceFromStorage,
    16,
    "surface-hit sourceFromStorage",
  );
  let best = null;
  let decodedTriangles = 0;
  let rangeBytes = 0;
  let rangeReads = 0;
  let ambiguous = false;
  for (const [rangeId, primitives] of primitivesByRange) {
    const handle = handles.get(rangeId);
    if (
      rangeBytes + handle.byteLength >
        limits.maximumSurfaceReadBytes
    ) {
      throw unavailable(
        "surface geometry reads exceed the resolver byte limit",
      );
    }
    const range = await readExactRange(
      input.session,
      handle,
      limits,
      signal,
    );
    rangeBytes += range.bytes.byteLength;
    rangeReads += range.reads;
    try {
      const { records } = recordMap(range.bytes, limits);
      const view = new DataView(
        range.bytes.buffer,
        range.bytes.byteOffset,
        range.bytes.byteLength,
      );
      for (const { primitive, primitiveIndex } of primitives) {
        const record = records.get(primitive.geometryExpressId);
        if (
          record === undefined ||
          record.slice.offset !== primitive.slice.offset ||
          record.slice.byteLength !== primitive.slice.byteLength ||
          record.indexCount !== primitive.indexCount ||
          record.vertexCount !== primitive.vertexCount
        ) {
          throw new Error(
            "surface-hit primitive differs from its exact range",
          );
        }
        decodedTriangles += record.triangles;
        if (decodedTriangles > limits.maximumTriangles) {
          throw unavailable(
            "surface geometry exceeds the triangle limit",
          );
        }
        const transform = multiplyTransform(
          sourceFromStorage,
          primitive.transform,
        );
        for (
          let triangleIndex = 0;
          triangleIndex < record.triangles;
          triangleIndex += 1
        ) {
          const vertices = triangleVertices(
            view,
            record,
            triangleIndex,
          ).map((point) => transformPoint(transform, point));
          const hit = intersectTriangle(
            cameraRay.origin,
            cameraRay.direction,
            vertices,
          );
          if (hit === null) {
            continue;
          }
          const candidate = {
            ...hit,
            primitiveId:
              `primitive:projection:${input.entity.expressId}:` +
              `${primitiveIndex}:${primitive.geometryExpressId}`,
            primitiveIndex,
            triangleIndex,
          };
          if (best === null ||
            candidate.rayDistance < best.rayDistance - 1e-9) {
            best = candidate;
            ambiguous = false;
          } else if (
            Math.abs(candidate.rayDistance - best.rayDistance) <=
              Math.max(1, candidate.rayDistance) * 1e-9
          ) {
            ambiguous = true;
          }
        }
      }
    } finally {
      range.bytes.fill(0);
    }
  }
  if (best === null) {
    throw unavailable(
      "GPU-selected identity has no exact triangle intersection",
    );
  }
  if (ambiguous) {
    throw unavailable(
      "GPU-selected surface has an ambiguous triangle intersection",
    );
  }
  const depth = depthTolerance(
    input.camera,
    input.pick,
    input.viewport,
    best.point,
  );
  if (
    depth.rendererProjectionError >
      Math.max(1, ...best.point.map(Math.abs)) * 1e-9 ||
    depth.error > depth.tolerance
  ) {
    throw unavailable(
      "exact surface hit is outside GPU depth quantization",
    );
  }
  return deepFreeze({
    schema: BIM_SURFACE_HIT_SCHEMA,
    status: "resolved",
    contract: BIM_SURFACE_HIT_CONTRACT,
    coordinateSpace: "projection-local",
    projection: {
      fingerprint: input.snapshot.source.fingerprint,
      revisionId: input.snapshot.revisionId,
    },
    identity: {
      expressId: input.pick.identity.expressId,
      nativeId: input.pick.identity.nativeId,
      pickId: input.pick.identity.pickId,
    },
    point: best.point,
    normal: best.normal,
    locator: {
      kind: "triangle-barycentric",
      primitiveId: best.primitiveId,
      triangleIndex: best.triangleIndex,
      barycentric: best.barycentric,
    },
    verification: {
      actualGpuDepth: true,
      exactGeometryDigest: true,
      identityBound: true,
      nearestUniqueTriangle: true,
      depthBits: 15,
      gpuDepthError: depth.error,
      gpuDepthTolerance: depth.tolerance,
    },
    resources: {
      rangeReads,
      rangeBytes,
      decodedTriangles,
      retainedGeometryBytes: 0,
      temporaryGeometryReleased: true,
    },
    authority: {
      nativeFace: false,
      sourcePrecision: false,
      coordinateReference: false,
      mutation: false,
    },
  });
}

function validateRenderer(value) {
  const renderer = plainRecord(value, "surface-hit renderer");
  for (const method of ["dispose", "mount", "pick"]) {
    if (typeof renderer[method] !== "function") {
      throw new TypeError(
        `surface-hit renderer.${method} must be a function`,
      );
    }
  }
  return renderer;
}

export class BimSurfaceHitRenderer {
  #active = null;
  #disposed = false;
  #height;
  #limits;
  #renderer;
  #surfaceHits = 0;
  #surfaceMisses = 0;
  #width;

  constructor({
    height,
    limits = {},
    renderer,
    width,
  } = {}) {
    this.#renderer = validateRenderer(renderer);
    this.#width = positiveInteger(width, "surface-hit width");
    this.#height = positiveInteger(height, "surface-hit height");
    this.#limits = validatedLimits(limits, renderer.limits);
    this.limits = renderer.limits;
  }

  get state() {
    return deepFreeze({
      contract: BIM_SURFACE_HIT_RENDERER_CONTRACT,
      disposed: this.#disposed,
      mounted: this.#active !== null,
      surfaceHits: this.#surfaceHits,
      surfaceMisses: this.#surfaceMisses,
      retainedGeometryBytes: 0,
      renderer: this.#renderer.state ?? null,
    });
  }

  async mount(options = {}) {
    if (this.#disposed) {
      throw invalidState("surface-hit renderer is disposed");
    }
    this.#active = null;
    const receipt = await this.#renderer.mount(options);
    const camera = receipt?.backend?.camera;
    if (camera === null || camera === undefined) {
      throw unavailable(
        "surface-hit renderer mount has no exact camera",
      );
    }
    this.#active = {
      camera: validateCamera3d(camera),
      residentRangeIds: new Set(receipt.rangeIds),
      session: options.session,
      snapshot: options.snapshot,
    };
    return receipt;
  }

  async pick(options = {}) {
    if (this.#disposed) {
      throw invalidState("surface-hit renderer is disposed");
    }
    if (this.#active === null) {
      throw invalidState("surface-hit renderer is not mounted");
    }
    const pick = await this.#renderer.pick(options);
    if (pick.status === "miss") {
      this.#surfaceMisses += 1;
      return deepFreeze({
        ...pick,
        surfaceHit: null,
        surfaceHitCapability: "unavailable-no-hit",
        surfaceHitDiagnostic: null,
      });
    }
    try {
      const surfaceHit = await resolveBimSurfaceHit({
        camera: this.#active.camera,
        pick,
        session: this.#active.session,
        snapshot: this.#active.snapshot,
        viewport: {
          width: this.#width,
          height: this.#height,
        },
      }, {
        limits: this.#limits,
        residentRangeIds: [
          ...this.#active.residentRangeIds,
        ],
        signal: options.signal,
      });
      this.#surfaceHits += 1;
      return deepFreeze({
        ...pick,
        surfaceHit,
        surfaceHitCapability: "resolved-exact-triangle",
        surfaceHitDiagnostic: null,
      });
    } catch (error) {
      if (error?.name !== "NotSupportedError") {
        throw error;
      }
      this.#surfaceMisses += 1;
      return deepFreeze({
        ...pick,
        surfaceHit: null,
        surfaceHitCapability: "unavailable",
        surfaceHitDiagnostic:
          "exact-triangle-intersection-unavailable",
      });
    }
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#active = null;
    this.#disposed = true;
    return await this.#renderer.dispose();
  }
}

export function createBimSurfaceHitRenderer(options) {
  return new BimSurfaceHitRenderer(options);
}
