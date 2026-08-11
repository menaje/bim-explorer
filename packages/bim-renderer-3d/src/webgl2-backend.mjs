import {
  cameraViewProjectionMatrix,
  createFitCamera3d,
  unprojectCameraPoint3d,
  validateCamera3d,
} from "./camera.mjs";

const INSTANCE_FLOATS = 20;
const INSTANCE_BYTES =
  INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_VERTEX_STRIDE_BYTES =
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
layout(location = 7) in vec2 a_texcoord;

uniform mat4 u_source_from_storage;
uniform mat4 u_world_to_clip;

out vec4 v_color;
out float v_light;
out vec3 v_world_position;
out vec2 v_texcoord;

void main() {
  mat4 model = mat4(
    a_model_0,
    a_model_1,
    a_model_2,
    a_model_3
  );
  mat4 source_model = u_source_from_storage * model;
  vec4 world = source_model * vec4(a_position, 1.0);
  mat3 normal_matrix = transpose(inverse(mat3(source_model)));
  vec3 normal = normalize(normal_matrix * a_normal);
  vec3 light_direction = normalize(vec3(0.35, -0.45, 0.82));
  v_light = 0.32 + 0.68 * abs(dot(normal, light_direction));
  v_color = a_color;
  v_world_position = world.xyz;
  v_texcoord = a_texcoord;
  gl_Position = u_world_to_clip * world;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
in float v_light;
in vec3 v_world_position;
in vec2 v_texcoord;

uniform bool u_highlight;
uniform int u_clip_count;
uniform vec4 u_clip_planes[6];
uniform bool u_has_texture;
uniform sampler2D u_base_color_texture;

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
  vec4 texel = vec4(1.0);
  if (u_has_texture) {
    texel = texture(u_base_color_texture, v_texcoord);
  }
  vec3 base = clamp(
    v_color.rgb * texel.rgb,
    vec3(0.08),
    vec3(1.0)
  );
  out_color = vec4(
    base * v_light,
    max(v_color.a * texel.a, 0.2)
  );
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
  for (const value of resources.textures) {
    gl.deleteTexture(value);
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
          textureIndex: record.textureIndex,
          texcoordByteOffset: record.texcoordByteOffset,
          vertexOffset,
          vertexStrideBytes: record.vertexStrideBytes,
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
    textures: new Map(
      plan.ranges.flatMap((range) =>
        range.decoded.textures.map((texture) => [
          `${range.handleId}:${texture.index}`,
          Object.freeze({
            ...texture,
            source: range.bytes.subarray(
              texture.sourcePayload.offset,
              texture.sourcePayload.offset +
                texture.sourcePayload.byteLength,
            ),
          }),
        ])),
    ),
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

function projectedScissorRect(
  worldToClip,
  boundsValue,
  worldOrigin,
  width,
  height,
) {
  const bounds = plainRecord(
    boundsValue,
    "WebGL2 affected bounds",
  );
  const min = finiteVector(
    bounds.min,
    3,
    "WebGL2 affected bounds.min",
  );
  const max = finiteVector(
    bounds.max,
    3,
    "WebGL2 affected bounds.max",
  );
  if (min.some((value, axis) => value >= max[axis])) {
    throw new RangeError(
      "WebGL2 affected bounds must have positive extent",
    );
  }
  const projected = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const point = [
          x - worldOrigin[0],
          y - worldOrigin[1],
          z - worldOrigin[2],
        ];
        const clip = [0, 0, 0, 0];
        for (let row = 0; row < 4; row += 1) {
          clip[row] =
            worldToClip[row] * point[0] +
            worldToClip[4 + row] * point[1] +
            worldToClip[8 + row] * point[2] +
            worldToClip[12 + row];
        }
        if (clip[3] > 0 && Number.isFinite(clip[3])) {
          projected.push([
            clip[0] / clip[3],
            clip[1] / clip[3],
          ]);
        }
      }
    }
  }
  if (projected.length === 0) {
    return Object.freeze({
      height,
      width,
      x: 0,
      y: 0,
    });
  }
  const clamp = (value) => Math.max(-1, Math.min(1, value));
  const minimumX = clamp(
    Math.min(...projected.map((point) => point[0])),
  );
  const maximumX = clamp(
    Math.max(...projected.map((point) => point[0])),
  );
  const minimumY = clamp(
    Math.min(...projected.map((point) => point[1])),
  );
  const maximumY = clamp(
    Math.max(...projected.map((point) => point[1])),
  );
  const x = Math.max(
    0,
    Math.floor((minimumX + 1) * 0.5 * width) - 1,
  );
  const y = Math.max(
    0,
    Math.floor((minimumY + 1) * 0.5 * height) - 1,
  );
  const right = Math.min(
    width,
    Math.ceil((maximumX + 1) * 0.5 * width) + 1,
  );
  const top = Math.min(
    height,
    Math.ceil((maximumY + 1) * 0.5 * height) + 1,
  );
  return Object.freeze({
    height: Math.max(1, top - y),
    width: Math.max(1, right - x),
    x: Math.min(x, width - 1),
    y: Math.min(y, height - 1),
  });
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

async function decodeBrowserImage(bytes, metadata) {
  if (
    typeof globalThis.Blob !== "function" ||
    typeof globalThis.createImageBitmap !== "function"
  ) {
    throw new DOMException(
      "browser image decode is unavailable",
      "NotSupportedError",
    );
  }
  const blob = new Blob([bytes], {
    type: metadata.mediaType,
  });
  return await globalThis.createImageBitmap(blob, {
    colorSpaceConversion: "none",
    imageOrientation: "none",
    premultiplyAlpha: "none",
  });
}

async function uploadTextureGroup(gl, textures, imageDecoder) {
  const values = [];
  const byKey = new Map();
  try {
    for (const [key, metadata] of textures) {
      const value = gl.createTexture();
      if (value === null) {
        throw new Error("WebGL2 could not allocate a base color texture");
      }
      values.push(value);
      let image = null;
      try {
        image = await imageDecoder(metadata.source, metadata);
        if (
          image?.width !== metadata.width ||
          image?.height !== metadata.height ||
          typeof image.close !== "function"
        ) {
          throw new Error(
            "decoded base color texture dimensions are invalid",
          );
        }
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.pixelStorei(
          gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
          gl.NONE,
        );
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MAG_FILTER,
          metadata.sampler.magFilter,
        );
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          metadata.sampler.minFilter,
        );
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_WRAP_S,
          metadata.sampler.wrapS,
        );
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_WRAP_T,
          metadata.sampler.wrapT,
        );
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.SRGB8_ALPHA8,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
        if (
          [9984, 9985, 9986, 9987]
            .includes(metadata.sampler.minFilter)
        ) {
          gl.generateMipmap(gl.TEXTURE_2D);
        }
        if (gl.getError() !== gl.NO_ERROR) {
          throw new Error("WebGL2 texture upload failed");
        }
        byKey.set(key, value);
      } finally {
        image?.close?.();
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return Object.freeze({
      byKey,
      values: Object.freeze(values),
    });
  } catch (error) {
    for (const value of values) {
      gl.deleteTexture(value);
    }
    throw error;
  }
}

async function uploadBufferGroup(
  gl,
  plan,
  worldOrigin,
  imageDecoder,
) {
  let geometry = null;
  let packedInstances = null;
  const buffers = [];
  let uploadedTextures = null;
  const started = performance.now();
  try {
    geometry = packGeometry(plan);
    packedInstances = packInstances(plan, worldOrigin);
    uploadedTextures = await uploadTextureGroup(
      gl,
      geometry.textures,
      imageDecoder,
    );
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
          (instance, localIndex) => {
            const texture = instance.textureIndex === null
              ? null
              : uploadedTextures.byKey.get(
                  `${instance.rangeId}:${instance.textureIndex}`,
                );
            if (texture === undefined) {
              throw new Error(
                "WebGL2 instance texture upload is missing",
              );
            }
            return Object.freeze({
              buffers: sharedBuffers,
              geometryExpressId: instance.geometryExpressId,
              geometryRecords: sharedRecords,
              expressId: instance.expressId,
              externalIdentityToken:
                instance.externalIdentityToken,
              globalId: instance.globalId,
              nativeId: instance.nativeId,
              localIndex,
              pickId: instance.pickId,
              rangeId: instance.rangeId,
              renderId: instance.renderId,
              texture,
            });
          },
        ),
      ),
      geometryBytes: plan.metrics.geometryPayloadBytes,
      instanceBytes: plan.metrics.instanceBytes,
      textureBytes: plan.metrics.textureGpuBytes ?? 0,
      textures: uploadedTextures.values,
      uploadedBytes:
        plan.metrics.geometryPayloadBytes +
        plan.metrics.instanceBytes +
        (plan.metrics.textureGpuBytes ?? 0),
      uploadMs: performance.now() - started,
    });
  } catch (error) {
    for (const value of buffers) {
      gl.deleteBuffer(value);
    }
    for (const value of uploadedTextures?.values ?? []) {
      gl.deleteTexture(value);
    }
    throw error;
  } finally {
    geometry?.vertices.fill(0);
    geometry?.indices.fill(0);
    packedInstances?.fill(0);
  }
}

function configureGeometryAttributes(gl, record) {
  const stride = record.vertexStrideBytes ??
    DEFAULT_VERTEX_STRIDE_BYTES;
  gl.vertexAttribPointer(
    0,
    3,
    gl.FLOAT,
    false,
    stride,
    record.vertexOffset,
  );
  gl.vertexAttribPointer(
    1,
    3,
    gl.FLOAT,
    false,
    stride,
    record.vertexOffset + 3 * Float32Array.BYTES_PER_ELEMENT,
  );
  if (record.texcoordByteOffset === null) {
    gl.disableVertexAttribArray(7);
    gl.vertexAttrib2f(7, 0, 0);
  } else {
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(
      7,
      2,
      gl.FLOAT,
      false,
      stride,
      record.vertexOffset + record.texcoordByteOffset,
    );
  }
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
  #imageDecoder;
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
    imageDecoder = decodeBrowserImage,
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
    if (typeof imageDecoder !== "function") {
      throw new TypeError("WebGL2 imageDecoder must be a function");
    }
    this.#imageDecoder = imageDecoder;
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
    if (context.getParameter(context.MAX_VERTEX_ATTRIBS) < 8) {
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
      affectedWorldBounds = null,
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
    const redrawRect = affectedWorldBounds === null
      ? null
      : projectedScissorRect(
        worldToClip,
        affectedWorldBounds,
        state.worldOrigin,
        this.#width,
        this.#height,
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
          if (redrawRect === null) {
            gl.disable(gl.SCISSOR_TEST);
          } else {
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(
              redrawRect.x,
              redrawRect.y,
              redrawRect.width,
              redrawRect.height,
            );
          }
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
            const hasTexture = instance.texture !== null;
            gl.uniform1i(
              state.hasTextureLocation,
              hasTexture ? 1 : 0,
            );
            if (hasTexture) {
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, instance.texture);
              gl.uniform1i(state.baseColorTextureLocation, 0);
            } else {
              gl.bindTexture(gl.TEXTURE_2D, null);
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
          gl.bindTexture(gl.TEXTURE_2D, null);
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
          if (redrawRect !== null) {
            gl.disable(gl.SCISSOR_TEST);
          }
          resolve();
        } catch (error) {
          if (redrawRect !== null) {
            gl.disable(gl.SCISSOR_TEST);
          }
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
      redrawPixels: redrawRect === null
        ? this.#width * this.#height
        : redrawRect.width * redrawRect.height,
      redrawRect,
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
    const initialCamera =
      presentation.initialCamera === null ||
      presentation.initialCamera === undefined
        ? null
        : validateCamera3d(presentation.initialCamera);
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
        textures: [],
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
      const group = await uploadBufferGroup(
        gl,
        plan,
        worldOrigin,
        this.#imageDecoder,
      );
      resources.buffers.push(...group.buffers);
      resources.textures.push(...group.textures);

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
      const hasTextureLocation = requireUniform(
        gl,
        frameProgram,
        "u_has_texture",
      );
      const baseColorTextureLocation = requireUniform(
        gl,
        frameProgram,
        "u_base_color_texture",
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
        baseColorTextureLocation,
        hasTextureLocation,
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
      const camera = initialCamera ??
        createFitCamera3d(bounds, {
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
        metrics.geometryPayloadBytes +
        metrics.instanceBytes +
        (metrics.textureGpuBytes ?? 0);
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
          ...(metrics.textureGpuBytes === undefined
            ? {}
            : { textureBytes: metrics.textureGpuBytes }),
          uploadedBytes,
          drawCalls: metrics.drawCalls,
          gpuBuffers: group.buffers.length,
          ...(group.textures.length === 0
            ? {}
            : { gpuTextures: group.textures.length }),
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
    const group = await uploadBufferGroup(
      gl,
      plan,
      state.worldOrigin,
      this.#imageDecoder,
    );
    state.groups.push(group);
    state.resources.buffers.push(...group.buffers);
    state.resources.textures.push(...group.textures);
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
          gpuTextures: state.resources.textures.length,
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
      const groupTextures = new Set(group.textures);
      state.resources.textures =
        state.resources.textures.filter(
          (value) => !groupTextures.has(value),
        );
      for (const value of group.textures) {
        gl.deleteTexture(value);
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
      const groupTextures = new Set(group.textures);
      state.resources.textures =
        state.resources.textures.filter(
          (value) => !groupTextures.has(value),
        );
      for (const value of group.textures) {
        gl.deleteTexture(value);
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
          gpuTextures: state.resources.textures.length,
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

  async redrawAffectedBounds(
    handleId,
    affectedWorldBounds,
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
    const bounds = plainRecord(
      affectedWorldBounds,
      "WebGL2 affected bounds",
    );
    const validatedBounds = Object.freeze({
      min: Object.freeze([
        ...finiteVector(
          bounds.min,
          3,
          "WebGL2 affected bounds.min",
        ),
      ]),
      max: Object.freeze([
        ...finiteVector(
          bounds.max,
          3,
          "WebGL2 affected bounds.max",
        ),
      ]),
    });
    if (
      validatedBounds.min.some((value, axis) =>
        value >= validatedBounds.max[axis])
    ) {
      throw new RangeError(
        "WebGL2 affected bounds must have positive extent",
      );
    }
    const state = this.#active;
    const frame = await this.#drawFrame(
      state,
      state.camera,
      state.hiddenRenderIds,
      state.selectedPickIds,
      state.clippingPlanes,
      signal,
      {
        affectedWorldBounds: validatedBounds,
        requireVisiblePixels: false,
      },
    );
    return {
      receipt: {
        backendId: "webgl2",
        frameId:
          `webgl2-frame:${this.#mounts}:${frame.frameNumber}`,
        actualGpu: true,
        rendered: true,
        atomic: true,
        redrawScope: "affected-world-bounds",
        affectedWorldBounds: validatedBounds,
        redrawRect: frame.redrawRect,
        redrawPixels: frame.redrawPixels,
        visibleInstances: frame.visibleInstances,
        hiddenInstances: frame.hiddenInstances,
        drawCalls: frame.drawCalls,
        nonBackgroundPixels: frame.nonBackgroundPixels,
        frameMs: frame.frameMs,
        glError: frame.glError,
      },
    };
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
                  nativeId: instance.nativeId,
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
