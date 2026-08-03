import {
  cameraViewProjectionMatrix,
  createFitCamera3d,
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
  gl_Position = u_world_to_clip * world;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
in float v_light;

out vec4 out_color;

void main() {
  vec3 base = clamp(v_color.rgb, vec3(0.08), vec3(1.0));
  out_color = vec4(base * v_light, max(v_color.a, 0.2));
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

function program(gl) {
  const vertex = shader(
    gl,
    gl.VERTEX_SHADER,
    VERTEX_SHADER,
    "vertex",
  );
  const fragment = shader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT_SHADER,
    "fragment",
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
  gl.deleteProgram(resources.program);
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

function packInstances(plan) {
  const values = new Float32Array(
    plan.instances.length * INSTANCE_FLOATS,
  );
  for (
    let instanceIndex = 0;
    instanceIndex < plan.instances.length;
    instanceIndex += 1
  ) {
    const instance = plan.instances[instanceIndex];
    const offset = instanceIndex * INSTANCE_FLOATS;
    values.set(instance.transform, offset);
    values.set(instance.color, offset + 16);
  }
  if (values.byteLength !== plan.metrics.instanceBytes) {
    throw new Error("WebGL2 instance packing byte count is invalid");
  }
  return values;
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
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (
      Math.abs(pixels[offset] - clear[0]) > 1 ||
      Math.abs(pixels[offset + 1] - clear[1]) > 1 ||
      Math.abs(pixels[offset + 2] - clear[2]) > 1
    ) {
      count += 1;
    }
  }
  pixels.fill(0);
  return count;
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

export class WebGl2Backend {
  #active = null;
  #canvas;
  #clearColor;
  #context = null;
  #disposed = false;
  #frameScheduler;
  #height;
  #mounts = 0;
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
      unmounts: this.#unmounts,
      contextInitialized: this.#context !== null,
      contextLost: this.#context?.isContextLost?.() ?? false,
      activeHandleId: this.#active?.handleId ?? null,
      activeBytes: this.#active?.uploadedBytes ?? 0,
      frames: this.#active?.frames ?? 0,
      cameraProjection:
        this.#active?.camera.projection ?? null,
      hiddenRenderIds:
        this.#active?.hiddenRenderIds.length ?? 0,
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
    return context;
  }

  async #drawFrame(
    state,
    cameraValue,
    hiddenRenderIds,
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
    const hidden = new Set(hiddenRenderIds);
    const gl = this.#getContext();
    if (gl.isContextLost()) {
      throw invalidState("WebGL2 context is lost");
    }
    const worldToClip = cameraViewProjectionMatrix(
      camera,
      this.#width / this.#height,
    );
    const [
      vertexBuffer,
      indexBuffer,
      instanceBuffer,
    ] = state.resources.buffers;
    const frameStarted = performance.now();
    let drawCalls = 0;
    let hiddenInstances = 0;
    let nonBackgroundPixels = 0;
    await new Promise((resolve, reject) => {
      this.#frameScheduler(() => {
        try {
          aborted(signal);
          gl.viewport(0, 0, this.#width, this.#height);
          gl.clearColor(...this.#clearColor);
          gl.clearDepth(1);
          gl.enable(gl.DEPTH_TEST);
          gl.depthFunc(gl.LEQUAL);
          gl.disable(gl.CULL_FACE);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.useProgram(state.resources.program);
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
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
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
            const record = state.geometryRecords.get(
              `${instance.rangeId}:${instance.geometryExpressId}`,
            );
            if (record === undefined) {
              throw new Error(
                "WebGL2 instance geometry is unavailable",
              );
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            configureGeometryAttributes(gl, record);
            gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
            configureInstanceAttributes(gl, index);
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
          nonBackgroundPixels = changedPixels(
            gl,
            this.#width,
            this.#height,
            this.#clearColor,
          );
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
      drawCalls,
      frameMs: performance.now() - frameStarted,
      frameNumber: state.frames,
      glError: gl.getError(),
      hiddenInstances,
      nonBackgroundPixels,
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
    let geometry = null;
    let instances = null;
    let resources = null;
    try {
      const shaderProgram = program(gl);
      resources = {
        buffers: [],
        program: shaderProgram,
      };
      geometry = packGeometry(plan);
      instances = packInstances(plan);
      const uploadStarted = performance.now();
      const vertexBuffer = buffer(
        gl,
        gl.ARRAY_BUFFER,
        geometry.vertices,
      );
      resources.buffers.push(vertexBuffer);
      const indexBuffer = buffer(
        gl,
        gl.ELEMENT_ARRAY_BUFFER,
        geometry.indices,
      );
      resources.buffers.push(indexBuffer);
      const instanceBuffer = buffer(
        gl,
        gl.ARRAY_BUFFER,
        instances,
      );
      resources.buffers.push(instanceBuffer);
      const uploadMs = performance.now() - uploadStarted;
      if (gl.getError() !== gl.NO_ERROR) {
        throw new Error("WebGL2 buffer upload failed");
      }

      const sourceMatrix = new Float32Array(sourceFromStorage);
      const worldLocation = requireUniform(
        gl,
        shaderProgram,
        "u_world_to_clip",
      );
      const sourceLocation = requireUniform(
        gl,
        shaderProgram,
        "u_source_from_storage",
      );
      const mountNumber = this.#mounts + 1;
      const drawState = {
        frames: 0,
        geometryRecords: geometry.records,
        instances: Object.freeze(
          plan.instances.map((instance) => Object.freeze({
            geometryExpressId: instance.geometryExpressId,
            rangeId: instance.rangeId,
            renderId: instance.renderId,
          })),
        ),
        resources,
        sourceLocation,
        sourceMatrix,
        worldLocation,
      };
      const camera = createFitCamera3d(bounds, {
        aspect: this.#width / this.#height,
      });
      const frame = await this.#drawFrame(
        drawState,
        camera,
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
          gpuBuffers: 3,
          frameWidth: this.#width,
          frameHeight: this.#height,
          camera,
          visibleInstances: frame.visibleInstances,
          hiddenInstances: frame.hiddenInstances,
          nonBackgroundPixels: frame.nonBackgroundPixels,
          uploadMs,
          firstFrameMs: frame.frameMs,
          mountMs: performance.now() - started,
          glError: gl.getError(),
        },
      };
    } finally {
      if (resources !== null) {
        deleteResources(gl, resources);
      }
      geometry?.vertices.fill(0);
      geometry?.indices.fill(0);
      instances?.fill(0);
    }
  }

  async renderView(
    handleId,
    {
      camera: cameraValue,
      hiddenRenderIds = [],
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
    const frame = await this.#drawFrame(
      this.#active,
      camera,
      hiddenRenderIds,
      signal,
      {
        requireVisiblePixels: false,
      },
    );
    this.#active.camera = camera;
    this.#active.hiddenRenderIds =
      Object.freeze([...hiddenRenderIds]);
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
        drawCalls: frame.drawCalls,
        nonBackgroundPixels: frame.nonBackgroundPixels,
        frameMs: frame.frameMs,
        glError: frame.glError,
      },
    };
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
    deleteResources(gl, active.resources);
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
