import {
  cameraViewProjectionMatrix,
  validateCamera3d,
} from "./camera.mjs";

const POINT_STRIDE_BYTES = 16;
const MAXIMUM_READBACK_PIXELS = 1024 * 1024;
const DEFAULT_CLEAR_COLOR = Object.freeze([
  0.027,
  0.047,
  0.075,
  0,
]);

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_world_to_clip;
uniform float u_point_size;

out vec4 v_color;

void main() {
  gl_Position = u_world_to_clip * vec4(a_position, 1.0);
  gl_PointSize = u_point_size;
  v_color = a_color;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 out_color;

void main() {
  vec2 centered = gl_PointCoord * 2.0 - 1.0;
  if (dot(centered, centered) > 1.0) {
    discard;
  }
  vec3 color = clamp(v_color.rgb, vec3(0.08), vec3(1.0));
  out_color = vec4(color, max(v_color.a, 0.2));
}
`;

const PICK_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;

uniform mat4 u_world_to_clip;
uniform float u_point_size;

flat out uint v_point_index;

void main() {
  gl_Position = u_world_to_clip * vec4(a_position, 1.0);
  gl_PointSize = u_point_size;
  v_point_index = uint(gl_VertexID) + 1u;
}
`;

const PICK_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

flat in uint v_point_index;
out vec4 out_color;

void main() {
  vec2 centered = gl_PointCoord * 2.0 - 1.0;
  if (dot(centered, centered) > 1.0) {
    discard;
  }
  uvec4 encoded = uvec4(
    v_point_index & 255u,
    (v_point_index >> 8u) & 255u,
    (v_point_index >> 16u) & 255u,
    (v_point_index >> 24u) & 255u
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
    Array.isArray(value) ||
    ArrayBuffer.isView(value)
  ) {
    throw new TypeError(`${label} must be an object`);
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

function clearColor(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some((item) =>
      typeof item !== "number" ||
      !Number.isFinite(item) ||
      item < 0 ||
      item > 1)
  ) {
    throw new TypeError("point WebGL2 clearColor is invalid");
  }
  return Object.freeze([...value]);
}

function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error(`WebGL2 could not allocate the ${label} shader`);
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const diagnostic = gl.getShaderInfoLog(shader) || "no diagnostic";
    gl.deleteShader(shader);
    throw new Error(
      `${label} shader compilation failed: ${diagnostic}`,
    );
  }
  return shader;
}

function createProgram(gl, {
  fragmentSource = FRAGMENT_SHADER,
  label = "point",
  vertexSource = VERTEX_SHADER,
} = {}) {
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    vertexSource,
    `${label} vertex`,
  );
  let fragment;
  try {
    fragment = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentSource,
      `${label} fragment`,
    );
  } catch (error) {
    gl.deleteShader(vertex);
    throw error;
  }
  const program = gl.createProgram();
  if (program === null) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(`WebGL2 could not allocate a ${label} program`);
  }
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(
        `WebGL2 ${label} program link failed: ` +
          (gl.getProgramInfoLog(program) || "no diagnostic"),
      );
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

function requiredUniform(gl, program, name) {
  const location = gl.getUniformLocation(program, name);
  if (location === null) {
    throw new Error(`WebGL2 point uniform ${name} is unavailable`);
  }
  return location;
}

function rebasedCamera(cameraValue, origin) {
  const camera = validateCamera3d(cameraValue);
  return validateCamera3d({
    ...camera,
    target: camera.target.map(
      (value, axis) => value - origin[axis],
    ),
  });
}

function releaseResources(gl, resources) {
  if (resources === null) {
    return;
  }
  if (resources.buffer !== null) {
    gl.deleteBuffer(resources.buffer);
  }
  if (resources.vertexArray !== null) {
    gl.deleteVertexArray(resources.vertexArray);
  }
  if (resources.program !== null) {
    gl.deleteProgram(resources.program);
  }
  if (resources.pickProgram !== null) {
    gl.deleteProgram(resources.pickProgram);
  }
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
    throw new Error("WebGL2 could not allocate a point pick target");
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
    throw new Error("WebGL2 point pick framebuffer is incomplete");
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

function decodedPointIndex(bytes, pointCount) {
  const encoded = (
    bytes[0] |
    (bytes[1] << 8) |
    (bytes[2] << 16) |
    (bytes[3] << 24)
  ) >>> 0;
  if (encoded === 0) {
    return null;
  }
  const pointIndex = encoded - 1;
  return pointIndex < pointCount ? pointIndex : null;
}

export class PointCloudWebGl2Backend {
  #active = null;
  #clearColor;
  #disposed = false;
  #gl;
  #height;
  #mounts = 0;
  #picks = 0;
  #unmounts = 0;
  #width;

  constructor({
    canvas,
    clearColor: clearColorValue = DEFAULT_CLEAR_COLOR,
    height = 480,
    width = 640,
  } = {}) {
    if (typeof canvas?.getContext !== "function") {
      throw new TypeError(
        "point WebGL2 backend requires a canvas",
      );
    }
    this.#width = positiveDimension(width, "point WebGL2 width");
    this.#height = positiveDimension(
      height,
      "point WebGL2 height",
    );
    if (this.#width * this.#height > MAXIMUM_READBACK_PIXELS) {
      throw new RangeError(
        "point WebGL2 readback exceeds its pixel budget",
      );
    }
    this.#clearColor = clearColor(clearColorValue);
    canvas.width = this.#width;
    canvas.height = this.#height;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: true,
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (gl === null) {
      throw new DOMException(
        "WebGL2 is unavailable",
        "NotSupportedError",
      );
    }
    if (
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS) < 2 ||
      typeof gl.getParameter(gl.VERSION) !== "string"
    ) {
      throw new Error("WebGL2 point capability profile is invalid");
    }
    this.#gl = gl;
  }

  get state() {
    return Object.freeze({
      activeBytes: this.#active?.uploadedBytes ?? 0,
      disposed: this.#disposed,
      glVersion: this.#gl.getParameter(this.#gl.VERSION),
      mounts: this.#mounts,
      picks: this.#picks,
      residentRanges: this.#active === null ? 0 : 1,
      unmounts: this.#unmounts,
    });
  }

  async mount(planValue, { signal } = {}) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("point WebGL2 backend is disposed");
    }
    if (this.#active !== null) {
      throw invalidState("point WebGL2 backend already has a mount");
    }
    const plan = plainRecord(planValue, "point WebGL2 mount plan");
    const decoded = plainRecord(
      plan.decoded,
      "point WebGL2 decoded range",
    );
    const metrics = plainRecord(
      plan.metrics,
      "point WebGL2 metrics",
    );
    if (
      !(plan.payload instanceof Uint8Array) ||
      plan.payload.byteLength !== decoded.payloadBytes ||
      decoded.pointStrideBytes !== POINT_STRIDE_BYTES ||
      decoded.pointCount !== metrics.points ||
      decoded.payloadBytes !== metrics.gpuBytes
    ) {
      throw new Error("point WebGL2 upload plan is invalid");
    }
    const gl = this.#gl;
    let resources = null;
    let pixels = null;
    const started = performance.now();
    try {
      const program = createProgram(gl);
      resources = {
        buffer: null,
        pickProgram: null,
        program,
        vertexArray: null,
      };
      resources.pickProgram = createProgram(gl, {
        fragmentSource: PICK_FRAGMENT_SHADER,
        label: "point pick",
        vertexSource: PICK_VERTEX_SHADER,
      });
      resources.buffer = gl.createBuffer();
      resources.vertexArray = gl.createVertexArray();
      if (
        resources.buffer === null ||
        resources.vertexArray === null
      ) {
        throw new Error(
          "WebGL2 could not allocate point buffer resources",
        );
      }
      const { buffer, vertexArray } = resources;
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const uploadStarted = performance.now();
      gl.bufferData(gl.ARRAY_BUFFER, plan.payload, gl.STATIC_DRAW);
      const uploadMs = performance.now() - uploadStarted;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(
        0,
        3,
        gl.FLOAT,
        false,
        POINT_STRIDE_BYTES,
        0,
      );
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(
        1,
        4,
        gl.UNSIGNED_BYTE,
        true,
        POINT_STRIDE_BYTES,
        12,
      );
      gl.viewport(0, 0, this.#width, this.#height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.clearColor(...this.#clearColor);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      const camera = rebasedCamera(plan.camera, decoded.origin);
      const matrix = new Float32Array(
        cameraViewProjectionMatrix(
          camera,
          this.#width / this.#height,
        ),
      );
      gl.uniformMatrix4fv(
        requiredUniform(gl, program, "u_world_to_clip"),
        false,
        matrix,
      );
      gl.uniform1f(
        requiredUniform(gl, program, "u_point_size"),
        metrics.pointSize,
      );
      matrix.fill(0);
      aborted(signal);
      gl.drawArrays(gl.POINTS, 0, decoded.pointCount);
      gl.finish();
      const glError = gl.getError();
      if (glError !== gl.NO_ERROR) {
        throw new Error(`WebGL2 point draw failed with ${glError}`);
      }
      pixels = new Uint8Array(
        this.#width * this.#height * 4,
      );
      gl.readPixels(
        0,
        0,
        this.#width,
        this.#height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      if (gl.getError() !== gl.NO_ERROR) {
        throw new Error("WebGL2 point readback failed");
      }
      let nonBackgroundPixels = 0;
      let suggestedPickCoordinates = null;
      let suggestedPickDistance = Infinity;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 0) {
          nonBackgroundPixels += 1;
          const pixelIndex = (offset - 3) / 4;
          const x = pixelIndex % this.#width;
          const y =
            this.#height - Math.floor(pixelIndex / this.#width) - 1;
          const distance = Math.hypot(
            x - this.#width / 2,
            y - this.#height / 2,
          );
          if (distance < suggestedPickDistance) {
            suggestedPickDistance = distance;
            suggestedPickCoordinates = Object.freeze({ x, y });
          }
        }
      }
      this.#mounts += 1;
      const handleId = `webgl2-point-mount:${this.#mounts}`;
      this.#active = {
        handleId,
        camera,
        origin: decoded.origin,
        pointCount: decoded.pointCount,
        pointSize: metrics.pointSize,
        resources,
        uploadedBytes: decoded.payloadBytes,
      };
      resources = null;
      return {
        handleId,
        receipt: {
          actualGpu: true,
          backendId: "webgl2-points",
          drawCalls: 1,
          frameId: `webgl2-point-frame:${this.#mounts}`,
          frameMs: performance.now() - started,
          glError: 0,
          glVersion: gl.getParameter(gl.VERSION),
          nonBackgroundPixels,
          pointPrimitive: "POINTS",
          pointSize: metrics.pointSize,
          points: decoded.pointCount,
          readbackBytes: pixels.byteLength,
          rendered: true,
          stagingConsumed: true,
          suggestedPickCoordinates,
          uploadedBytes: decoded.payloadBytes,
          uploadMs,
        },
      };
    } catch (error) {
      releaseResources(gl, resources);
      throw error;
    } finally {
      pixels?.fill(0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
    }
  }

  async pick(
    handleId,
    { x, y } = {},
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("point WebGL2 backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("point WebGL2 mount handle is not active");
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
        "point WebGL2 pick coordinates are outside the frame",
      );
    }
    const state = this.#active;
    const gl = this.#gl;
    const started = performance.now();
    let pixel = null;
    let position = null;
    let target = null;
    try {
      target = pickTarget(gl, this.#width, this.#height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, this.#width, this.#height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(state.resources.pickProgram);
      const camera = state.camera;
      const matrix = new Float32Array(
        cameraViewProjectionMatrix(
          camera,
          this.#width / this.#height,
        ),
      );
      gl.uniformMatrix4fv(
        requiredUniform(
          gl,
          state.resources.pickProgram,
          "u_world_to_clip",
        ),
        false,
        matrix,
      );
      gl.uniform1f(
        requiredUniform(
          gl,
          state.resources.pickProgram,
          "u_point_size",
        ),
        state.pointSize,
      );
      matrix.fill(0);
      gl.bindVertexArray(state.resources.vertexArray);
      aborted(signal);
      gl.drawArrays(gl.POINTS, 0, state.pointCount);
      gl.finish();
      if (gl.getError() !== gl.NO_ERROR) {
        throw new Error("WebGL2 point pick frame failed");
      }
      pixel = new Uint8Array(4);
      gl.readPixels(
        x,
        this.#height - y - 1,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      if (gl.getError() !== gl.NO_ERROR) {
        throw new Error("WebGL2 point pick readback failed");
      }
      const pointIndex = decodedPointIndex(
        pixel,
        state.pointCount,
      );
      let worldPosition = null;
      if (pointIndex !== null) {
        position = new Float32Array(3);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.resources.buffer);
        gl.getBufferSubData(
          gl.ARRAY_BUFFER,
          pointIndex * POINT_STRIDE_BYTES,
          position,
        );
        worldPosition = Object.freeze(
          [...position].map(
            (value, axis) => value + state.origin[axis],
          ),
        );
      }
      this.#picks += 1;
      return {
        receipt: {
          actualGpu: true,
          backendId: "webgl2-points",
          drawCalls: 1,
          frameId:
            `webgl2-point-pick:${this.#mounts}:${this.#picks}`,
          frameMs: performance.now() - started,
          glError: 0,
          hit: pointIndex !== null,
          pointIndex,
          temporaryReleased: true,
          temporaryTargetBytes: target.bytes,
          worldPosition,
          x,
          y,
        },
      };
    } finally {
      pixel?.fill(0);
      position?.fill(0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      deletePickTarget(gl, target);
    }
  }

  async unmount(handleId) {
    if (this.#disposed) {
      throw invalidState("point WebGL2 backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("point WebGL2 mount handle is not active");
    }
    const releasedBytes = this.#active.uploadedBytes;
    releaseResources(this.#gl, this.#active.resources);
    this.#active = null;
    this.#unmounts += 1;
    return {
      receipt: {
        activeBytes: 0,
        backendId: "webgl2-points",
        releasedBytes,
        residentRanges: 0,
        resourcesDeleted: true,
      },
    };
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

export function createPointCloudWebGl2Backend(options) {
  return new PointCloudWebGl2Backend(options);
}
