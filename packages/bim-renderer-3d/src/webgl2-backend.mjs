import {
  cameraViewProjectionMatrix,
  createFitCamera3d,
  unprojectCameraPoint3d,
  validateCamera3d,
} from "./camera.mjs";

const INSTANCE_FLOATS = 20;
const INSTANCE_BYTES =
  INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const VERTEX_STRIDE_BYTES =
  6 * Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_CLEAR_COLOR = Object.freeze([
  0.027,
  0.047,
  0.075,
  1,
]);

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_model_0;
layout(location = 3) in vec4 a_model_1;
layout(location = 4) in vec4 a_model_2;
layout(location = 5) in vec4 a_model_3;
layout(location = 6) in vec4 a_color;

uniform mat4 u_source_from_storage;
uniform mat4 u_world_to_clip;

out vec4 v_color;
out float v_light;
out vec3 v_world_position;

void main() {
  mat4 model = mat4(
    a_model_0,
    a_model_1,
    a_model_2,
    a_model_3
  );
  mat4 source_model = u_source_from_storage * model;
  vec4 world = source_model * vec4(a_position, 1.0);
  vec3 normal = normalize(mat3(source_model) * a_normal);
  vec3 light_direction = normalize(vec3(0.35, -0.45, 0.82));
  v_light = 0.32 + 0.68 * abs(dot(normal, light_direction));
  v_color = a_color;
  v_world_position = world.xyz;
  gl_Position = u_world_to_clip * world;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
in float v_light;
in vec3 v_world_position;

uniform bool u_highlight;
uniform int u_clip_count;
uniform vec4 u_clip_planes[6];

out vec4 out_color;

void main() {
  for (int index = 0; index < 6; index += 1) {
    if (
      index < u_clip_count &&
      dot(
        vec4(v_world_position, 1.0),
        u_clip_planes[index]
      ) < 0.0
    ) {
      discard;
    }
  }
  if (u_highlight) {
    out_color = vec4(1.0, 0.42, 0.04, 1.0);
    return;
  }
  vec3 base = clamp(v_color.rgb, vec3(0.08), vec3(1.0));
  out_color = vec4(base * v_light, max(v_color.a, 0.2));
}
`;

const PICK_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 2) in vec4 a_model_0;
layout(location = 3) in vec4 a_model_1;
layout(location = 4) in vec4 a_model_2;
layout(location = 5) in vec4 a_model_3;

uniform mat4 u_source_from_storage;
uniform mat4 u_world_to_clip;

out vec3 v_world_position;

void main() {
  mat4 model = mat4(
    a_model_0,
    a_model_1,
    a_model_2,
    a_model_3
  );
  vec4 world =
    u_source_from_storage * model * vec4(a_position, 1.0);
  v_world_position = world.xyz;
  gl_Position = u_world_to_clip * world;
}
`;

const PICK_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform uint u_pick_index;
uniform int u_clip_count;
uniform vec4 u_clip_planes[6];

in vec3 v_world_position;

out vec4 out_color;

void main() {
  for (int index = 0; index < 6; index += 1) {
    if (
      index < u_clip_count &&
      dot(
        vec4(v_world_position, 1.0),
        u_clip_planes[index]
      ) < 0.0
    ) {
      discard;
    }
  }
  uint depth_code = uint(
    round(clamp(gl_FragCoord.z, 0.0, 1.0) * 32767.0)
  );
  uint packed = (depth_code << 17u) | u_pick_index;
  uvec4 encoded = uvec4(
    packed & 255u,
    (packed >> 8u) & 255u,
    (packed >> 16u) & 255u,
    (packed >> 24u) & 255u
  );
  out_color = vec4(encoded) / 255.0;
}
`;

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException(
      "operation aborted",
      "AbortError",
    );
  }
}

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

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every((item) =>
      typeof item === "number" && Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must be a finite vector`);
  }
  return value;
}

function validatedClippingPlanes(value) {
  if (!Array.isArray(value) || value.length > 6) {
    throw new RangeError(
      "WebGL2 clipping planes exceed six planes",
    );
  }
  return Object.freeze(
    value.map((plane, index) => {
      const item = plainRecord(
        plane,
        `WebGL2 clipping plane ${index}`,
      );
      const normal = finiteVector(
        item.normal,
        3,
        `WebGL2 clipping plane ${index}.normal`,
      );
      if (
        typeof item.constant !== "number" ||
        !Number.isFinite(item.constant) ||
        !(Math.hypot(...normal) > 0)
      ) {
        throw new TypeError(
          `WebGL2 clipping plane ${index} is invalid`,
        );
      }
      return Object.freeze({
        constant: item.constant,
        normal: Object.freeze([...normal]),
      });
    }),
  );
}

function applyClipping(
  gl,
  countLocation,
  planesLocation,
  planes,
) {
  gl.uniform1i(countLocation, planes.length);
  const values = new Float32Array(24);
  for (const [index, plane] of planes.entries()) {
    values.set(
      [...plane.normal, plane.constant],
      index * 4,
    );
  }
  gl.uniform4fv(planesLocation, values);
  values.fill(0);
}

function positiveDimension(value, label) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 4096
  ) {
    throw new RangeError(`${label} must be between 1 and 4096`);
  }
  return value;
}

function shader(gl, type, source, label) {
  const value = gl.createShader(type);
  if (value === null) {
    throw new Error(`WebGL2 could not allocate the ${label} shader`);
  }
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (gl.getShaderParameter(value, gl.COMPILE_STATUS) !== true) {
    const diagnostic = gl.getShaderInfoLog(value) || "no diagnostic";
    gl.deleteShader(value);
    throw new Error(`${label} shader compilation failed: ${diagnostic}`);
  }
  return value;
}

function program(
  gl,
  {
    fragmentSource = FRAGMENT_SHADER,
    label = "frame",
    vertexSource = VERTEX_SHADER,
  } = {},
) {
  const vertex = shader(
    gl,
    gl.VERTEX_SHADER,
    vertexSource,
    `${label} vertex`,
  );
  const fragment = shader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentSource,
    `${label} fragment`,
  );
  const value = gl.createProgram();
  if (value === null) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("WebGL2 could not allocate a shader program");
  }
  try {
    gl.attachShader(value, vertex);
    gl.attachShader(value, fragment);
    gl.linkProgram(value);
    if (gl.getProgramParameter(value, gl.LINK_STATUS) !== true) {
      throw new Error(
        "WebGL2 program link failed: " +
          (gl.getProgramInfoLog(value) || "no diagnostic"),
      );
    }
    return value;
  } catch (error) {
    gl.deleteProgram(value);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

function buffer(gl, target, bytes) {
  const value = gl.createBuffer();
  if (value === null) {
    throw new Error("WebGL2 could not allocate a buffer");
  }
  gl.bindBuffer(target, value);
  gl.bufferData(target, bytes, gl.STATIC_DRAW);
  return value;
}

function deleteResources(gl, resources) {
  if (resources === null) {
    return;
  }
  for (const value of resources.buffers) {
    gl.deleteBuffer(value);
  }
  for (const value of resources.programs) {
    gl.deleteProgram(value);
  }
}

function packGeometry(plan) {
  let vertexBytes = 0;
  let indexBytes = 0;
  for (const range of plan.ranges) {
    for (const record of range.decoded.records) {
      vertexBytes += record.vertexPayload.byteLength;
      indexBytes += record.indexPayload.byteLength;
    }
  }
  const vertices = new Uint8Array(vertexBytes);
  const indices = new Uint8Array(indexBytes);
  const records = new Map();
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const range of plan.ranges) {
    for (const record of range.decoded.records) {
      vertices.set(
        range.bytes.subarray(
          record.vertexPayload.offset,
          record.vertexPayload.offset +
            record.vertexPayload.byteLength,
        ),
        vertexOffset,
      );
      indices.set(
        range.bytes.subarray(
          record.indexPayload.offset,
          record.indexPayload.offset +
            record.indexPayload.byteLength,
        ),
        indexOffset,
      );
      records.set(
        `${range.handleId}:${record.geometryExpressId}`,
        Object.freeze({
          indexCount: record.indexCount,
          indexOffset,
          vertexOffset,
        }),
      );
      vertexOffset += record.vertexPayload.byteLength;
      indexOffset += record.indexPayload.byteLength;
    }
  }
  if (
    vertexBytes + indexBytes !==
      plan.metrics.geometryPayloadBytes
  ) {
    throw new Error("WebGL2 geometry packing byte count is invalid");
  }
  return {
    indices,
    records,
    vertices,
  };
}

function multiplyTransform(left, right) {
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

function rebasedCamera(camera, origin) {
  return validateCamera3d({
    ...camera,
    target: camera.target.map(
      (value, axis) => value - origin[axis],
    ),
  });
}

function relativeClippingPlanes(planes, origin) {
  return Object.freeze(
    planes.map((plane) => Object.freeze({
      normal: plane.normal,
      constant:
        plane.constant +
        plane.normal.reduce(
          (sum, value, axis) =>
            sum + value * origin[axis],
          0,
        ),
    })),
  );
}

function packInstances(plan, worldOrigin) {
  const values = new Float32Array(
    plan.instances.length * INSTANCE_FLOATS,
  );
  const sourceFromStorage =
    plan.presentation.coordinateSystem.sourceFromStorage;
  for (
    let instanceIndex = 0;
    instanceIndex < plan.instances.length;
    instanceIndex += 1
  ) {
    const instance = plan.instances[instanceIndex];
    const offset = instanceIndex * INSTANCE_FLOATS;
    const transform = multiplyTransform(
      sourceFromStorage,
      instance.transform,
    );
    transform[12] -= worldOrigin[0];
    transform[13] -= worldOrigin[1];
    transform[14] -= worldOrigin[2];
    values.set(transform, offset);
    values.set(instance.color, offset + 16);
  }
  if (values.byteLength !== plan.metrics.instanceBytes) {
    throw new Error("WebGL2 instance packing byte count is invalid");
  }
  return values;
}

function uploadBufferGroup(gl, plan, worldOrigin) {
  let geometry = null;
  let packedInstances = null;
  const buffers = [];
  const started = performance.now();
  try {
    geometry = packGeometry(plan);
    packedInstances = packInstances(plan, worldOrigin);
    buffers.push(
      buffer(gl, gl.ARRAY_BUFFER, geometry.vertices),
    );
    buffers.push(
      buffer(gl, gl.ELEMENT_ARRAY_BUFFER, geometry.indices),
    );
    buffers.push(
      buffer(gl, gl.ARRAY_BUFFER, packedInstances),
    );
    if (gl.getError() !== gl.NO_ERROR) {
      throw new Error("WebGL2 buffer upload failed");
    }
    const sharedBuffers = Object.freeze([...buffers]);
    const sharedRecords = geometry.records;
    return Object.freeze({
      rangeIds: Object.freeze(
        plan.ranges.map((range) => range.handleId),
      ),
      buffers: sharedBuffers,
      geometryRecords: sharedRecords,
      instances: Object.freeze(
        plan.instances.map(
          (instance, localIndex) => Object.freeze({
            buffers: sharedBuffers,
            geometryExpressId: instance.geometryExpressId,
            geometryRecords: sharedRecords,
            expressId: instance.expressId,
            externalIdentityToken:
              instance.externalIdentityToken,
            globalId: instance.globalId,
            localIndex,
            pickId: instance.pickId,
            rangeId: instance.rangeId,
            renderId: instance.renderId,
          }),
        ),
      ),
      geometryBytes: plan.metrics.geometryPayloadBytes,
      instanceBytes: plan.metrics.instanceBytes,
      uploadedBytes:
        plan.metrics.geometryPayloadBytes +
        plan.metrics.instanceBytes,
      uploadMs: performance.now() - started,
    });
  } catch (error) {
    for (const value of buffers) {
      gl.deleteBuffer(value);
    }
    throw error;
  } finally {
    geometry?.vertices.fill(0);
    geometry?.indices.fill(0);
    packedInstances?.fill(0);
  }
}

function configureGeometryAttributes(gl, record) {
  gl.vertexAttribPointer(
    0,
    3,
    gl.FLOAT,
    false,
    VERTEX_STRIDE_BYTES,
    record.vertexOffset,
  );
  gl.vertexAttribPointer(
    1,
    3,
    gl.FLOAT,
    false,
    VERTEX_STRIDE_BYTES,
    record.vertexOffset + 3 * Float32Array.BYTES_PER_ELEMENT,
  );
}

function configureInstanceAttributes(gl, instanceIndex) {
  const base = instanceIndex * INSTANCE_BYTES;
  for (let column = 0; column < 4; column += 1) {
    const location = 2 + column;
    gl.vertexAttribPointer(
      location,
      4,
      gl.FLOAT,
      false,
      INSTANCE_BYTES,
      base + column * 4 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.vertexAttribDivisor(location, 1);
  }
  gl.vertexAttribPointer(
    6,
    4,
    gl.FLOAT,
    false,
    INSTANCE_BYTES,
    base + 16 * Float32Array.BYTES_PER_ELEMENT,
  );
  gl.vertexAttribDivisor(6, 1);
}

function changedPixels(gl, width, height, clearColor) {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(
    0,
    0,
    width,
    height,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels,
  );
  const clear = clearColor
    .slice(0, 3)
    .map((value) => Math.round(value * 255));
  let highlightPixels = 0;
  let nonBackgroundPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (
      Math.abs(pixels[offset] - clear[0]) > 1 ||
      Math.abs(pixels[offset + 1] - clear[1]) > 1 ||
      Math.abs(pixels[offset + 2] - clear[2]) > 1
    ) {
      nonBackgroundPixels += 1;
    }
    if (
      pixels[offset] >= 250 &&
      pixels[offset + 1] >= 100 &&
      pixels[offset + 1] <= 120 &&
      pixels[offset + 2] <= 16
    ) {
      highlightPixels += 1;
    }
  }
  pixels.fill(0);
  return Object.freeze({
    highlightPixels,
    nonBackgroundPixels,
  });
}

function validatedPickIndex(index) {
  if (
    !Number.isSafeInteger(index) ||
    index <= 0 ||
    index > 0x1_ff_ff
  ) {
    throw new RangeError("WebGL2 pick index is out of range");
  }
  return index;
}

function decodedPickPixel(bytes) {
  const packed = (
    bytes[0] |
    (bytes[1] << 8) |
    (bytes[2] << 16) |
    (bytes[3] << 24)
  ) >>> 0;
  const depthCode = packed >>> 17;
  return Object.freeze({
    depth: depthCode / 32_767,
    pickIndex: packed & 0x1_ff_ff,
  });
}

function pickTarget(gl, width, height) {
  const framebuffer = gl.createFramebuffer();
  const color = gl.createTexture();
  const depth = gl.createRenderbuffer();
  if (
    framebuffer === null ||
    color === null ||
    depth === null
  ) {
    if (framebuffer !== null) {
      gl.deleteFramebuffer(framebuffer);
    }
    if (color !== null) {
      gl.deleteTexture(color);
    }
    if (depth !== null) {
      gl.deleteRenderbuffer(depth);
    }
    throw new Error("WebGL2 could not allocate a pick target");
  }
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.NEAREST,
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MAG_FILTER,
    gl.NEAREST,
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_S,
    gl.CLAMP_TO_EDGE,
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_T,
    gl.CLAMP_TO_EDGE,
  );
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(
    gl.RENDERBUFFER,
    gl.DEPTH_COMPONENT16,
    width,
    height,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    color,
    0,
  );
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    depth,
  );
  if (
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
      gl.FRAMEBUFFER_COMPLETE
  ) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(color);
    gl.deleteRenderbuffer(depth);
    throw new Error("WebGL2 pick framebuffer is incomplete");
  }
  return Object.freeze({
    bytes: width * height * 6,
    color,
    depth,
    framebuffer,
  });
}

function deletePickTarget(gl, target) {
  if (target === null) {
    return;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.color);
  gl.deleteRenderbuffer(target.depth);
}

function drainErrors(gl) {
  const errors = [];
  for (let index = 0; index < 16; index += 1) {
    const error = gl.getError();
    if (error === gl.NO_ERROR) {
      break;
    }
    errors.push(error);
  }
  return Object.freeze(errors);
}

function requireUniform(gl, value, label) {
  const location = gl.getUniformLocation(value, label);
  if (location === null) {
    throw new Error(`WebGL2 uniform ${label} is unavailable`);
  }
  return location;
}

function defaultFrameScheduler(callback) {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    throw new Error("requestAnimationFrame is unavailable");
  }
  return globalThis.requestAnimationFrame(callback);
}

function canvasEvent(canvas, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timeout;
    const cleanup = () => {
      canvas.removeEventListener(type, onEvent);
      clearTimeout(timeout);
    };
    const onEvent = (event) => {
      if (type === "webglcontextlost") {
        event.preventDefault();
      }
      cleanup();
      resolve(event);
    };
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`WebGL2 ${type} event timed out`));
    }, timeoutMs);
    canvas.addEventListener(type, onEvent);
  });
}

export class WebGl2Backend {
  #active = null;
  #canvas;
  #clearColor;
  #context = null;
  #contextGeneration = 0;
  #contextLosses = 0;
  #disposed = false;
  #frameScheduler;
  #height;
  #mounts = 0;
  #picks = 0;
  #releasedBytes = 0;
  #unmounts = 0;
  #width;

  constructor({
    canvas,
    clearColor = DEFAULT_CLEAR_COLOR,
    frameScheduler = defaultFrameScheduler,
    height = 540,
    width = 960,
  } = {}) {
    if (typeof canvas?.getContext !== "function") {
      throw new TypeError(
        "WebGL2 backend canvas must provide getContext",
      );
    }
    this.#canvas = canvas;
    this.#clearColor = Object.freeze([
      ...finiteVector(clearColor, 4, "WebGL2 clearColor"),
    ]);
    if (
      this.#clearColor.some((value) => value < 0 || value > 1)
    ) {
      throw new RangeError(
        "WebGL2 clearColor values must be between 0 and 1",
      );
    }
    if (typeof frameScheduler !== "function") {
      throw new TypeError("WebGL2 frameScheduler must be a function");
    }
    this.#frameScheduler = frameScheduler;
    this.#height = positiveDimension(height, "WebGL2 height");
    this.#width = positiveDimension(width, "WebGL2 width");
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      mounts: this.#mounts,
      picks: this.#picks,
      releasedBytes: this.#releasedBytes,
      unmounts: this.#unmounts,
      contextInitialized: this.#context !== null,
      contextLost: this.#context?.isContextLost?.() ?? false,
      contextGeneration: this.#contextGeneration,
      contextLosses: this.#contextLosses,
      contextInvalidated:
        this.#active?.contextInvalidated ?? false,
      activeHandleId: this.#active?.handleId ?? null,
      activeBytes: this.#active?.uploadedBytes ?? 0,
      residentRanges: this.#active?.groups.length ?? 0,
      frames: this.#active?.frames ?? 0,
      cameraProjection:
        this.#active?.camera.projection ?? null,
      clippingPlanes:
        this.#active?.clippingPlanes.length ?? 0,
      hiddenRenderIds:
        this.#active?.hiddenRenderIds.length ?? 0,
      selectedPickIds:
        this.#active?.selectedPickIds.length ?? 0,
      worldOrigin:
        this.#active?.worldOrigin ?? null,
    });
  }

  #getContext() {
    if (this.#context !== null) {
      return this.#context;
    }
    this.#canvas.width = this.#width;
    this.#canvas.height = this.#height;
    const context = this.#canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: true,
      desynchronized: false,
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      stencil: false,
    });
    if (context === null) {
      throw new Error("WebGL2 is unavailable");
    }
    if (context.getParameter(context.MAX_VERTEX_ATTRIBS) < 7) {
      throw new Error(
        "WebGL2 does not expose enough vertex attributes",
      );
    }
    this.#context = context;
    this.#contextGeneration = 1;
    return context;
  }

  async #drawFrame(
    state,
    cameraValue,
    hiddenRenderIds,
    selectedPickIds,
    clippingPlanesValue,
    signal,
    {
      requireVisiblePixels = true,
    } = {},
  ) {
    const camera = validateCamera3d(cameraValue);
    if (
      !Array.isArray(hiddenRenderIds) ||
      new Set(hiddenRenderIds).size !== hiddenRenderIds.length
    ) {
      throw new TypeError(
        "WebGL2 hidden Render IDs must be a unique list",
      );
    }
    if (
      !Array.isArray(selectedPickIds) ||
      new Set(selectedPickIds).size !== selectedPickIds.length
    ) {
      throw new TypeError(
        "WebGL2 selected Pick IDs must be a unique list",
      );
    }
    const hidden = new Set(hiddenRenderIds);
    const selected = new Set(selectedPickIds);
    const clippingPlanes = validatedClippingPlanes(
      clippingPlanesValue,
    );
    const gl = this.#getContext();
    if (state.contextInvalidated === true) {
      throw invalidState(
        "WebGL2 mount was invalidated by context loss",
      );
    }
    if (gl.isContextLost()) {
      throw invalidState("WebGL2 context is lost");
    }
    const renderingCamera = rebasedCamera(
      camera,
      state.worldOrigin,
    );
    const worldToClip = cameraViewProjectionMatrix(
      renderingCamera,
      this.#width / this.#height,
    );
    const relativePlanes = relativeClippingPlanes(
      clippingPlanes,
      state.worldOrigin,
    );
    const frameStarted = performance.now();
    let drawCalls = 0;
    let highlightedInstances = 0;
    let highlightPixels = 0;
    let hiddenInstances = 0;
    let nonBackgroundPixels = 0;
    let selectedInstances = 0;
    for (const instance of state.instances) {
      if (selected.has(instance.pickId)) {
        selectedInstances += 1;
      }
    }
    await new Promise((resolve, reject) => {
      this.#frameScheduler(() => {
        try {
          aborted(signal);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, this.#width, this.#height);
          gl.clearColor(...this.#clearColor);
          gl.clearDepth(1);
          gl.enable(gl.DEPTH_TEST);
          gl.depthFunc(gl.LEQUAL);
          gl.disable(gl.CULL_FACE);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.useProgram(state.resources.frameProgram);
          gl.uniformMatrix4fv(
            state.worldLocation,
            false,
            worldToClip,
          );
          gl.uniformMatrix4fv(
            state.sourceLocation,
            false,
            state.sourceMatrix,
          );
          applyClipping(
            gl,
            state.clipCountLocation,
            state.clipPlanesLocation,
            relativePlanes,
          );
          for (const location of [0, 1, 2, 3, 4, 5, 6]) {
            gl.enableVertexAttribArray(location);
          }
          for (
            let index = 0;
            index < state.instances.length;
            index += 1
          ) {
            const instance = state.instances[index];
            if (hidden.has(instance.renderId)) {
              hiddenInstances += 1;
              continue;
            }
            const highlighted = selected.has(instance.pickId);
            if (highlighted) {
              highlightedInstances += 1;
            }
            gl.uniform1i(
              state.highlightLocation,
              highlighted ? 1 : 0,
            );
            const record = instance.geometryRecords.get(
              `${instance.rangeId}:${instance.geometryExpressId}`,
            );
            if (record === undefined) {
              throw new Error(
                "WebGL2 instance geometry is unavailable",
              );
            }
            gl.bindBuffer(
              gl.ELEMENT_ARRAY_BUFFER,
              instance.buffers[1],
            );
            gl.bindBuffer(
              gl.ARRAY_BUFFER,
              instance.buffers[0],
            );
            configureGeometryAttributes(gl, record);
            gl.bindBuffer(
              gl.ARRAY_BUFFER,
              instance.buffers[2],
            );
            configureInstanceAttributes(
              gl,
              instance.localIndex,
            );
            gl.drawElementsInstanced(
              gl.TRIANGLES,
              record.indexCount,
              gl.UNSIGNED_INT,
              record.indexOffset,
              1,
            );
            drawCalls += 1;
          }
          if (drawCalls === 0) {
            throw new Error(
              "WebGL2 view has no visible instances",
            );
          }
          gl.finish();
          if (gl.getError() !== gl.NO_ERROR) {
            throw new Error("WebGL2 frame failed");
          }
          const pixels = changedPixels(
            gl,
            this.#width,
            this.#height,
            this.#clearColor,
          );
          highlightPixels = pixels.highlightPixels;
          nonBackgroundPixels = pixels.nonBackgroundPixels;
          if (
            requireVisiblePixels &&
            nonBackgroundPixels === 0
          ) {
            throw new Error(
              "WebGL2 frame has no visible geometry",
            );
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    state.frames += 1;
    return Object.freeze({
      camera,
      clippingPlanes: clippingPlanes.length,
      drawCalls,
      frameMs: performance.now() - frameStarted,
      frameNumber: state.frames,
      glError: gl.getError(),
      highlightedInstances,
      highlightPixels,
      hiddenInstances,
      nonBackgroundPixels,
      selectedInstances,
      visibleInstances: drawCalls,
    });
  }

  async mount(planValue, { signal } = {}) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("WebGL2 backend is disposed");
    }
    if (this.#active !== null) {
      throw invalidState("WebGL2 backend already has a mount");
    }
    const plan = plainRecord(planValue, "WebGL2 mount plan");
    const metrics = plainRecord(
      plan.metrics,
      "WebGL2 mount metrics",
    );
    const presentation = plainRecord(
      plan.presentation,
      "WebGL2 mount presentation",
    );
    const coordinateSystem = plainRecord(
      presentation.coordinateSystem,
      "WebGL2 coordinateSystem",
    );
    const sourceFromStorage = finiteVector(
      coordinateSystem.sourceFromStorage,
      16,
      "WebGL2 sourceFromStorage",
    );
    const bounds = plainRecord(
      presentation.bounds,
      "WebGL2 bounds",
    );
    if (
      !Array.isArray(plan.ranges) ||
      !Array.isArray(plan.instances) ||
      plan.ranges.length === 0 ||
      plan.instances.length === 0 ||
      metrics.instanceBytes !==
        plan.instances.length * INSTANCE_BYTES
    ) {
      throw new Error("WebGL2 mount plan is invalid");
    }

    const gl = this.#getContext();
    if (gl.isContextLost()) {
      throw invalidState("WebGL2 context is lost");
    }
    const started = performance.now();
    let resources = null;
    try {
      const frameProgram = program(gl, {
        label: "frame",
      });
      resources = {
        buffers: [],
        frameProgram,
        pickProgram: null,
        programs: [frameProgram],
      };
      const pickProgram = program(gl, {
        fragmentSource: PICK_FRAGMENT_SHADER,
        label: "pick",
        vertexSource: PICK_VERTEX_SHADER,
      });
      resources.pickProgram = pickProgram;
      resources.programs.push(pickProgram);
      const worldOrigin = bounds.min.map(
        (value, axis) => (value + bounds.max[axis]) / 2,
      );
      const maximumRelativeCoordinate = Math.max(
        ...bounds.min.map((value, axis) =>
          Math.abs(value - worldOrigin[axis])),
        ...bounds.max.map((value, axis) =>
          Math.abs(value - worldOrigin[axis])),
      );
      const group = uploadBufferGroup(
        gl,
        plan,
        worldOrigin,
      );
      resources.buffers.push(...group.buffers);

      const sourceMatrix = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
      const worldLocation = requireUniform(
        gl,
        frameProgram,
        "u_world_to_clip",
      );
      const sourceLocation = requireUniform(
        gl,
        frameProgram,
        "u_source_from_storage",
      );
      const highlightLocation = requireUniform(
        gl,
        frameProgram,
        "u_highlight",
      );
      const clipCountLocation = requireUniform(
        gl,
        frameProgram,
        "u_clip_count",
      );
      const clipPlanesLocation = requireUniform(
        gl,
        frameProgram,
        "u_clip_planes[0]",
      );
      const pickWorldLocation = requireUniform(
        gl,
        pickProgram,
        "u_world_to_clip",
      );
      const pickSourceLocation = requireUniform(
        gl,
        pickProgram,
        "u_source_from_storage",
      );
      const pickIndexLocation = requireUniform(
        gl,
        pickProgram,
        "u_pick_index",
      );
      const pickClipCountLocation = requireUniform(
        gl,
        pickProgram,
        "u_clip_count",
      );
      const pickClipPlanesLocation = requireUniform(
        gl,
        pickProgram,
        "u_clip_planes[0]",
      );
      const mountNumber = this.#mounts + 1;
      const drawState = {
        contextGeneration: this.#contextGeneration,
        contextInvalidated: false,
        clipCountLocation,
        clipPlanesLocation,
        frames: 0,
        groups: [group],
        instances: group.instances,
        resources,
        highlightLocation,
        pickIndexLocation,
        pickClipCountLocation,
        pickClipPlanesLocation,
        pickSourceLocation,
        pickWorldLocation,
        sourceLocation,
        sourceMatrix,
        source: plan.source,
        worldOrigin: Object.freeze(worldOrigin),
        worldLocation,
      };
      const camera = createFitCamera3d(bounds, {
        aspect: this.#width / this.#height,
      });
      const frame = await this.#drawFrame(
        drawState,
        camera,
        [],
        [],
        [],
        signal,
      );
      const uploadedBytes =
        metrics.geometryPayloadBytes + metrics.instanceBytes;
      this.#mounts = mountNumber;
      const handleId = `webgl2-mount:${mountNumber}`;
      this.#active = {
        ...drawState,
        camera,
        handleId,
        hiddenRenderIds: Object.freeze([]),
        clippingPlanes: Object.freeze([]),
        selectedPickIds: Object.freeze([]),
        uploadedBytes,
      };
      resources = null;
      return {
        handleId,
        receipt: {
          backendId: "webgl2",
          frameId:
            `webgl2-frame:${mountNumber}:${frame.frameNumber}`,
          actualGpu: true,
          rendered: true,
          context: "webgl2",
          contextVersion: gl.getParameter(gl.VERSION),
          geometryBytes: metrics.geometryPayloadBytes,
          instanceBytes: metrics.instanceBytes,
          uploadedBytes,
          drawCalls: metrics.drawCalls,
          gpuBuffers: group.buffers.length,
          frameWidth: this.#width,
          frameHeight: this.#height,
          camera,
          precision: {
            strategy: "camera-relative-model-origin",
            worldOrigin: Object.freeze([...worldOrigin]),
            maximumRelativeCoordinate,
          },
          visibleInstances: frame.visibleInstances,
          hiddenInstances: frame.hiddenInstances,
          selectedInstances: frame.selectedInstances,
          highlightedInstances: frame.highlightedInstances,
          clippingPlanes: frame.clippingPlanes,
          nonBackgroundPixels: frame.nonBackgroundPixels,
          highlightPixels: frame.highlightPixels,
          uploadMs: group.uploadMs,
          firstFrameMs: frame.frameMs,
          mountMs: performance.now() - started,
          glError: gl.getError(),
        },
      };
    } finally {
      if (resources !== null) {
        deleteResources(gl, resources);
      }
    }
  }

  async appendRange(
    handleId,
    planValue,
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("WebGL2 backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("WebGL2 mount handle is not active");
    }
    const state = this.#active;
    const plan = plainRecord(
      planValue,
      "WebGL2 range plan",
    );
    const metrics = plainRecord(
      plan.metrics,
      "WebGL2 range metrics",
    );
    if (
      !Array.isArray(plan.ranges) ||
      plan.ranges.length !== 1 ||
      !Array.isArray(plan.instances) ||
      plan.instances.length === 0 ||
      plan.source?.fingerprint !== state.source.fingerprint ||
      plan.source?.revisionId !== state.source.revisionId ||
      state.groups.some((group) =>
        group.rangeIds.includes(plan.ranges[0].handleId))
    ) {
      throw new Error("WebGL2 range plan is invalid");
    }
    if (state.contextInvalidated === true) {
      throw invalidState(
        "WebGL2 mount was invalidated by context loss",
      );
    }
    const gl = this.#getContext();
    if (gl.isContextLost()) {
      throw invalidState("WebGL2 context is lost");
    }
    const group = uploadBufferGroup(
      gl,
      plan,
      state.worldOrigin,
    );
    state.groups.push(group);
    state.resources.buffers.push(...group.buffers);
    state.instances = Object.freeze([
      ...state.instances,
      ...group.instances,
    ]);
    state.uploadedBytes += group.uploadedBytes;
    try {
      const frame = await this.#drawFrame(
        state,
        state.camera,
        state.hiddenRenderIds,
        state.selectedPickIds,
        state.clippingPlanes,
        signal,
        {
          requireVisiblePixels: false,
        },
      );
      return {
        receipt: {
          backendId: "webgl2",
          frameId:
            `webgl2-frame:${this.#mounts}:` +
            `${frame.frameNumber}`,
          actualGpu: true,
          rendered: true,
          cacheHit: false,
          rangeIds: group.rangeIds,
          addedBytes: group.uploadedBytes,
          activeBytes: state.uploadedBytes,
          addedInstances: metrics.instances,
          addedDrawCalls: metrics.drawCalls,
          gpuBuffers: state.resources.buffers.length,
          visibleInstances: frame.visibleInstances,
          hiddenInstances: frame.hiddenInstances,
          drawCalls: frame.drawCalls,
          nonBackgroundPixels: frame.nonBackgroundPixels,
          uploadMs: group.uploadMs,
          frameMs: frame.frameMs,
          glError: frame.glError,
        },
      };
    } catch (error) {
      state.groups.pop();
      state.instances = Object.freeze(
        state.instances.slice(
          0,
          state.instances.length - group.instances.length,
        ),
      );
      state.uploadedBytes -= group.uploadedBytes;
      const groupBuffers = new Set(group.buffers);
      state.resources.buffers =
        state.resources.buffers.filter(
          (value) => !groupBuffers.has(value),
        );
      for (const value of group.buffers) {
        gl.deleteBuffer(value);
      }
      throw error;
    }
  }

  async evictRange(
    handleId,
    rangeId,
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("WebGL2 backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("WebGL2 mount handle is not active");
    }
    if (typeof rangeId !== "string" || rangeId.length === 0) {
      throw new TypeError(
        "WebGL2 rangeId must be a non-empty string",
      );
    }
    const state = this.#active;
    if (state.contextInvalidated === true) {
      throw invalidState(
        "WebGL2 mount was invalidated by context loss",
      );
    }
    const groupIndex = state.groups.findIndex((group) =>
      group.rangeIds.includes(rangeId));
    if (groupIndex < 0 || state.groups.length <= 1) {
      throw new RangeError(
        "WebGL2 resident range cannot be evicted",
      );
    }
    const gl = this.#getContext();
    if (gl.isContextLost()) {
      throw invalidState("WebGL2 context is lost");
    }
    const group = state.groups[groupIndex];
    const priorGroups = state.groups;
    const priorInstances = state.instances;
    const priorHiddenRenderIds = state.hiddenRenderIds;
    const priorSelectedPickIds = state.selectedPickIds;
    const priorUploadedBytes = state.uploadedBytes;
    const removedRenderIds = new Set(
      group.instances.map((instance) => instance.renderId),
    );
    const removedPickIds = new Set(
      group.instances.map((instance) => instance.pickId),
    );
    state.groups = state.groups.filter(
      (_, index) => index !== groupIndex,
    );
    const groupInstances = new Set(group.instances);
    state.instances = Object.freeze(
      state.instances.filter(
        (instance) => !groupInstances.has(instance),
      ),
    );
    const knownRenderIds = new Set(
      state.instances.map((instance) => instance.renderId),
    );
    const knownPickIds = new Set(
      state.instances.map((instance) => instance.pickId),
    );
    state.hiddenRenderIds = Object.freeze(
      state.hiddenRenderIds.filter(
        (id) =>
          !removedRenderIds.has(id) || knownRenderIds.has(id),
      ),
    );
    state.selectedPickIds = Object.freeze(
      state.selectedPickIds.filter(
        (id) =>
          !removedPickIds.has(id) || knownPickIds.has(id),
      ),
    );
    state.uploadedBytes -= group.uploadedBytes;
    try {
      const frame = await this.#drawFrame(
        state,
        state.camera,
        state.hiddenRenderIds,
        state.selectedPickIds,
        state.clippingPlanes,
        signal,
        {
          requireVisiblePixels: false,
        },
      );
      const groupBuffers = new Set(group.buffers);
      state.resources.buffers =
        state.resources.buffers.filter(
          (value) => !groupBuffers.has(value),
        );
      for (const value of group.buffers) {
        gl.deleteBuffer(value);
      }
      this.#releasedBytes += group.uploadedBytes;
      return {
        receipt: {
          backendId: "webgl2",
          frameId:
            `webgl2-frame:${this.#mounts}:` +
            `${frame.frameNumber}`,
          actualGpu: true,
          rendered: true,
          rangeId,
          releasedBytes: group.uploadedBytes,
          activeBytes: state.uploadedBytes,
          gpuBuffers: state.resources.buffers.length,
          visibleInstances: frame.visibleInstances,
          hiddenInstances: frame.hiddenInstances,
          drawCalls: frame.drawCalls,
          nonBackgroundPixels: frame.nonBackgroundPixels,
          frameMs: frame.frameMs,
          glError: frame.glError,
        },
      };
    } catch (error) {
      state.groups = priorGroups;
      state.instances = priorInstances;
      state.hiddenRenderIds = priorHiddenRenderIds;
      state.selectedPickIds = priorSelectedPickIds;
      state.uploadedBytes = priorUploadedBytes;
      throw error;
    }
  }

  async renderView(
    handleId,
    {
      camera: cameraValue,
      clippingPlanes = [],
      hiddenRenderIds = [],
      selectedPickIds = [],
    } = {},
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("WebGL2 backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("WebGL2 mount handle is not active");
    }
    const camera = validateCamera3d(cameraValue);
    const validatedPlanes =
      validatedClippingPlanes(clippingPlanes);
    if (
      !Array.isArray(hiddenRenderIds) ||
      new Set(hiddenRenderIds).size !== hiddenRenderIds.length ||
      hiddenRenderIds.some((renderId) =>
        typeof renderId !== "string" || renderId.length === 0)
    ) {
      throw new TypeError(
        "WebGL2 hidden Render IDs must be a unique list",
      );
    }
    const known = new Set(
      this.#active.instances.map((instance) => instance.renderId),
    );
    if (hiddenRenderIds.some((renderId) => !known.has(renderId))) {
      throw new RangeError(
        "WebGL2 hidden Render ID is outside the active mount",
      );
    }
    if (
      !Array.isArray(selectedPickIds) ||
      new Set(selectedPickIds).size !== selectedPickIds.length ||
      selectedPickIds.some((pickId) =>
        typeof pickId !== "string" || pickId.length === 0)
    ) {
      throw new TypeError(
        "WebGL2 selected Pick IDs must be a unique list",
      );
    }
    const knownPickIds = new Set(
      this.#active.instances.map((instance) => instance.pickId),
    );
    if (selectedPickIds.some((pickId) =>
      !knownPickIds.has(pickId))) {
      throw new RangeError(
        "WebGL2 selected Pick ID is outside the active mount",
      );
    }
    const frame = await this.#drawFrame(
      this.#active,
      camera,
      hiddenRenderIds,
      selectedPickIds,
      validatedPlanes,
      signal,
      {
        requireVisiblePixels: false,
      },
    );
    this.#active.camera = camera;
    this.#active.hiddenRenderIds =
      Object.freeze([...hiddenRenderIds]);
    this.#active.clippingPlanes = validatedPlanes;
    this.#active.selectedPickIds =
      Object.freeze([...selectedPickIds]);
    return {
      receipt: {
        backendId: "webgl2",
        frameId:
          `webgl2-frame:${this.#mounts}:${frame.frameNumber}`,
        actualGpu: true,
        rendered: true,
        context: "webgl2",
        camera,
        visibleInstances: frame.visibleInstances,
        hiddenInstances: frame.hiddenInstances,
        selectedInstances: frame.selectedInstances,
        highlightedInstances: frame.highlightedInstances,
        clippingPlanes: frame.clippingPlanes,
        drawCalls: frame.drawCalls,
        nonBackgroundPixels: frame.nonBackgroundPixels,
        highlightPixels: frame.highlightPixels,
        frameMs: frame.frameMs,
        glError: frame.glError,
      },
    };
  }

  async pick(
    handleId,
    {
      x,
      y,
    } = {},
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("WebGL2 backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("WebGL2 mount handle is not active");
    }
    if (
      !Number.isSafeInteger(x) ||
      !Number.isSafeInteger(y) ||
      x < 0 ||
      x >= this.#width ||
      y < 0 ||
      y >= this.#height
    ) {
      throw new RangeError(
        "WebGL2 pick coordinates are outside the frame",
      );
    }
    const state = this.#active;
    const gl = this.#getContext();
    if (state.contextInvalidated === true) {
      throw invalidState(
        "WebGL2 mount was invalidated by context loss",
      );
    }
    if (gl.isContextLost()) {
      throw invalidState("WebGL2 context is lost");
    }
    const hidden = new Set(state.hiddenRenderIds);
    const renderingCamera = rebasedCamera(
      state.camera,
      state.worldOrigin,
    );
    const worldToClip = cameraViewProjectionMatrix(
      renderingCamera,
      this.#width / this.#height,
    );
    const relativePlanes = relativeClippingPlanes(
      state.clippingPlanes,
      state.worldOrigin,
    );
    const started = performance.now();
    let depth = null;
    let drawCalls = 0;
    let identity = null;
    let target = null;
    let worldPosition = null;
    try {
      target = pickTarget(gl, this.#width, this.#height);
      await new Promise((resolve, reject) => {
        this.#frameScheduler(() => {
          try {
            aborted(signal);
            gl.bindFramebuffer(
              gl.FRAMEBUFFER,
              target.framebuffer,
            );
            gl.viewport(0, 0, this.#width, this.#height);
            gl.clearColor(0, 0, 0, 0);
            gl.clearDepth(1);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.CULL_FACE);
            gl.clear(
              gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
            );
            gl.useProgram(state.resources.pickProgram);
            gl.uniformMatrix4fv(
              state.pickWorldLocation,
              false,
              worldToClip,
            );
            gl.uniformMatrix4fv(
              state.pickSourceLocation,
              false,
              state.sourceMatrix,
            );
            applyClipping(
              gl,
              state.pickClipCountLocation,
              state.pickClipPlanesLocation,
              relativePlanes,
            );
            for (const location of [0, 2, 3, 4, 5]) {
              gl.enableVertexAttribArray(location);
            }
            for (
              let index = 0;
              index < state.instances.length;
              index += 1
            ) {
              const instance = state.instances[index];
              if (hidden.has(instance.renderId)) {
                continue;
              }
              const record = instance.geometryRecords.get(
                `${instance.rangeId}:` +
                  `${instance.geometryExpressId}`,
              );
              if (record === undefined) {
                throw new Error(
                  "WebGL2 instance geometry is unavailable",
                );
              }
              gl.uniform1ui(
                state.pickIndexLocation,
                validatedPickIndex(index + 1),
              );
              gl.bindBuffer(
                gl.ELEMENT_ARRAY_BUFFER,
                instance.buffers[1],
              );
              gl.bindBuffer(
                gl.ARRAY_BUFFER,
                instance.buffers[0],
              );
              configureGeometryAttributes(gl, record);
              gl.bindBuffer(
                gl.ARRAY_BUFFER,
                instance.buffers[2],
              );
              configureInstanceAttributes(
                gl,
                instance.localIndex,
              );
              gl.drawElementsInstanced(
                gl.TRIANGLES,
                record.indexCount,
                gl.UNSIGNED_INT,
                record.indexOffset,
                1,
              );
              drawCalls += 1;
            }
            const pixel = new Uint8Array(4);
            gl.finish();
            if (gl.getError() !== gl.NO_ERROR) {
              throw new Error("WebGL2 pick frame failed");
            }
            gl.readPixels(
              x,
              this.#height - y - 1,
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixel,
            );
            const decoded = decodedPickPixel(pixel);
            pixel.fill(0);
            if (
              decoded.pickIndex > 0 &&
              decoded.pickIndex <= state.instances.length
            ) {
              const instance =
                state.instances[decoded.pickIndex - 1];
              if (!hidden.has(instance.renderId)) {
                identity = Object.freeze({
                  expressId: instance.expressId,
                  externalIdentityToken:
                    instance.externalIdentityToken,
                  globalId: instance.globalId,
                  pickId: instance.pickId,
                  renderId: instance.renderId,
                });
                const relativePosition =
                  unprojectCameraPoint3d(
                    renderingCamera,
                    {
                      depth: decoded.depth,
                      height: this.#height,
                      width: this.#width,
                      x,
                      y,
                    },
                  );
                worldPosition = Object.freeze(
                  relativePosition.map(
                    (value, axis) =>
                      value + state.worldOrigin[axis],
                  ),
                );
                depth = decoded.depth;
              }
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      this.#picks += 1;
      return {
        receipt: {
          backendId: "webgl2",
          frameId:
            `webgl2-pick:${this.#mounts}:${this.#picks}`,
          actualGpu: true,
          context: "webgl2",
          hit: identity !== null,
          identity,
          depth,
          worldPosition,
          x,
          y,
          drawCalls,
          temporaryTargetBytes: target.bytes,
          temporaryReleased: true,
          frameMs: performance.now() - started,
          glError: gl.NO_ERROR,
        },
      };
    } finally {
      deletePickTarget(gl, target);
    }
  }

  async qualifyContextLoss(
    handleId,
    {
      timeoutMs = 5_000,
    } = {},
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("WebGL2 backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("WebGL2 mount handle is not active");
    }
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 30_000
    ) {
      throw new RangeError(
        "WebGL2 context-loss timeout is out of range",
      );
    }
    const gl = this.#getContext();
    if (gl.isContextLost()) {
      throw invalidState("WebGL2 context is already lost");
    }
    const extension = gl.getExtension("WEBGL_lose_context");
    if (
      typeof extension?.loseContext !== "function" ||
      typeof extension?.restoreContext !== "function"
    ) {
      throw new DOMException(
        "WEBGL_lose_context is unavailable",
        "NotSupportedError",
      );
    }
    const priorGeneration = this.#contextGeneration;
    const lost = canvasEvent(
      this.#canvas,
      "webglcontextlost",
      timeoutMs,
    );
    const started = performance.now();
    extension.loseContext();
    await lost;
    const restored = canvasEvent(
      this.#canvas,
      "webglcontextrestored",
      timeoutMs,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    extension.restoreContext();
    await restored;
    const clearedErrors = drainErrors(gl);
    this.#contextGeneration += 1;
    this.#contextLosses += 1;
    this.#active.contextInvalidated = true;
    aborted(signal);
    return Object.freeze({
      backendId: "webgl2",
      contextLostObserved: true,
      contextRestoredObserved: true,
      invalidatedBytes: this.#active.uploadedBytes,
      priorGeneration,
      restoredGeneration: this.#contextGeneration,
      recoveryRequired: true,
      clearedErrors,
      elapsedMs: performance.now() - started,
      glError: gl.getError(),
    });
  }

  async unmount(handleId) {
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("WebGL2 mount handle is not active");
    }
    const active = this.#active;
    const gl = this.#getContext();
    if (active.contextInvalidated !== true) {
      deleteResources(gl, active.resources);
    }
    if (!gl.isContextLost()) {
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.useProgram(null);
      gl.clearColor(...this.#clearColor);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.finish();
    }
    this.#active = null;
    this.#unmounts += 1;
    this.#releasedBytes += active.uploadedBytes;
    return Object.freeze({
      released: true,
      releasedBytes: active.uploadedBytes,
    });
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#active !== null) {
      await this.unmount(this.#active.handleId);
    }
    this.#disposed = true;
    return true;
  }
}

export function createWebGl2Backend(options) {
  return new WebGl2Backend(options);
}
