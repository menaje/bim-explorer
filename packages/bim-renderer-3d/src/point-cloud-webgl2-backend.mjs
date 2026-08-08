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

function createProgram(gl) {
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    VERTEX_SHADER,
    "point vertex",
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT_SHADER,
    "point fragment",
  );
  const program = gl.createProgram();
  if (program === null) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("WebGL2 could not allocate a point program");
  }
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(
        "WebGL2 point program link failed: " +
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
  gl.deleteBuffer(resources.buffer);
  gl.deleteVertexArray(resources.vertexArray);
  gl.deleteProgram(resources.program);
}

export class PointCloudWebGl2Backend {
  #active = null;
  #clearColor;
  #disposed = false;
  #gl;
  #height;
  #mounts = 0;
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
      failIfMajorPerformanceCaveat: false,
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
      const buffer = gl.createBuffer();
      const vertexArray = gl.createVertexArray();
      if (buffer === null || vertexArray === null) {
        if (buffer !== null) {
          gl.deleteBuffer(buffer);
        }
        if (vertexArray !== null) {
          gl.deleteVertexArray(vertexArray);
        }
        gl.deleteProgram(program);
        throw new Error(
          "WebGL2 could not allocate point buffer resources",
        );
      }
      resources = { buffer, program, vertexArray };
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
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 0) {
          nonBackgroundPixels += 1;
        }
      }
      this.#mounts += 1;
      const handleId = `webgl2-point-mount:${this.#mounts}`;
      this.#active = {
        handleId,
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
