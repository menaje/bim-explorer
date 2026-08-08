import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BIM_POINT_RANGE_MEDIA_TYPE,
  createBoundedPointCloudRenderer,
  createPointCloudWebGl2Backend,
  encodeBimPointRange,
} from "../../packages/bim-renderer-3d/src/index.mjs";

class FakePointWebGl2Context {
  ARRAY_BUFFER = 0x8892;
  CLAMP_TO_EDGE = 0x812f;
  COLOR_ATTACHMENT0 = 0x8ce0;
  COLOR_BUFFER_BIT = 0x4000;
  COMPILE_STATUS = 0x8b81;
  DEPTH_ATTACHMENT = 0x8d00;
  DEPTH_BUFFER_BIT = 0x0100;
  DEPTH_COMPONENT16 = 0x81a5;
  DEPTH_TEST = 0x0b71;
  FLOAT = 0x1406;
  FRAMEBUFFER = 0x8d40;
  FRAMEBUFFER_COMPLETE = 0x8cd5;
  FRAGMENT_SHADER = 0x8b30;
  LEQUAL = 0x0203;
  LINK_STATUS = 0x8b82;
  MAX_VERTEX_ATTRIBS = 0x8869;
  NEAREST = 0x2600;
  NO_ERROR = 0;
  POINTS = 0x0000;
  RENDERBUFFER = 0x8d41;
  RGBA = 0x1908;
  STATIC_DRAW = 0x88e4;
  TEXTURE_2D = 0x0de1;
  TEXTURE_MAG_FILTER = 0x2800;
  TEXTURE_MIN_FILTER = 0x2801;
  TEXTURE_WRAP_S = 0x2802;
  TEXTURE_WRAP_T = 0x2803;
  UNSIGNED_BYTE = 0x1401;
  VERSION = 0x1f02;
  VERTEX_SHADER = 0x8b31;

  constructor() {
    this.bufferUploads = [];
    this.deletedBuffers = 0;
    this.deletedFramebuffers = 0;
    this.deletedPrograms = 0;
    this.deletedRenderbuffers = 0;
    this.deletedTextures = 0;
    this.deletedVertexArrays = 0;
    this.draws = [];
    this.uploadedBytes = null;
    this.uniformPointSize = null;
  }

  attachShader() {}
  bindBuffer() {}
  bindFramebuffer() {}
  bindRenderbuffer() {}
  bindTexture() {}
  bindVertexArray() {}
  bufferData(target, bytes) {
    this.uploadedBytes = Uint8Array.from(bytes);
    this.bufferUploads.push({
      byteLength: bytes.byteLength,
      target,
    });
  }
  clear() {}
  clearColor() {}
  clearDepth() {}
  checkFramebufferStatus() {
    return this.FRAMEBUFFER_COMPLETE;
  }
  compileShader() {}
  createBuffer() {
    return {};
  }
  createFramebuffer() {
    return {};
  }
  createProgram() {
    return {};
  }
  createRenderbuffer() {
    return {};
  }
  createShader() {
    return {};
  }
  createTexture() {
    return {};
  }
  createVertexArray() {
    return {};
  }
  deleteBuffer() {
    this.deletedBuffers += 1;
  }
  deleteFramebuffer() {
    this.deletedFramebuffers += 1;
  }
  deleteProgram() {
    this.deletedPrograms += 1;
  }
  deleteRenderbuffer() {
    this.deletedRenderbuffers += 1;
  }
  deleteShader() {}
  deleteTexture() {
    this.deletedTextures += 1;
  }
  deleteVertexArray() {
    this.deletedVertexArrays += 1;
  }
  depthFunc() {}
  drawArrays(mode, first, count) {
    this.draws.push({ count, first, mode });
  }
  enable() {}
  enableVertexAttribArray() {}
  finish() {}
  framebufferRenderbuffer() {}
  framebufferTexture2D() {}
  getBufferSubData(target, offset, destination) {
    assert.equal(target, this.ARRAY_BUFFER);
    const output = new Uint8Array(
      destination.buffer,
      destination.byteOffset,
      destination.byteLength,
    );
    output.set(
      this.uploadedBytes.subarray(offset, offset + output.byteLength),
    );
  }
  getError() {
    return this.NO_ERROR;
  }
  getParameter(name) {
    if (name === this.MAX_VERTEX_ATTRIBS) {
      return 16;
    }
    if (name === this.VERSION) {
      return "WebGL 2.0 point test context";
    }
    return null;
  }
  getProgramInfoLog() {
    return "";
  }
  getProgramParameter() {
    return true;
  }
  getShaderInfoLog() {
    return "";
  }
  getShaderParameter() {
    return true;
  }
  getUniformLocation() {
    return {};
  }
  linkProgram() {}
  readPixels(x, y, width, height, format, type, pixels) {
    pixels.fill(0);
    if (width === 1 && height === 1) {
      pixels[0] = 2;
      return;
    }
    pixels[3] = 255;
    pixels[7] = 255;
  }
  renderbufferStorage() {}
  shaderSource() {}
  texImage2D() {}
  texParameteri() {}
  uniform1f(location, value) {
    this.uniformPointSize = value;
  }
  uniformMatrix4fv() {}
  useProgram() {}
  vertexAttribPointer() {}
  viewport() {}
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("point WebGL2 backend performs one POINTS draw and exact cleanup", async () => {
  const gl = new FakePointWebGl2Context();
  const canvas = {
    getContext(name) {
      assert.equal(name, "webgl2");
      return gl;
    },
  };
  const positions = new Float32Array([
    -1, -1, 0,
    1, -1, 0,
    0, 1, 0,
  ]);
  const colors = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
  ]);
  const bytes = encodeBimPointRange({
    colors,
    origin: [10_000, 20_000, 30_000],
    positions,
  });
  const backend = createPointCloudWebGl2Backend({
    canvas,
    height: 48,
    width: 64,
  });
  const renderer = createBoundedPointCloudRenderer({
    backend,
    pointSize: 4,
  });
  const receipt = await renderer.mount({
    range: {
      bytes,
      handleId: "point-range:webgl2:0",
      mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
      sha256: sha256(bytes),
    },
    source: {
      coordinateReferenceStatus: "qualified",
      fingerprint: `sha256:${"b".repeat(64)}`,
      format: "synthetic-points",
      revisionId: "synthetic-webgl2:r1",
      semanticAuthority: false,
    },
  });
  assert.equal(receipt.backend.actualGpu, true);
  assert.equal(receipt.backend.rendered, true);
  assert.equal(receipt.backend.nonBackgroundPixels, 2);
  assert.equal(receipt.backend.uploadedBytes, 48);
  assert.equal(receipt.backend.pointPrimitive, "POINTS");
  assert.deepEqual(
    receipt.backend.suggestedPickCoordinates,
    { x: 1, y: 47 },
  );
  assert.deepEqual(gl.bufferUploads, [{
    byteLength: 48,
    target: gl.ARRAY_BUFFER,
  }]);
  assert.deepEqual(gl.draws, [{
    count: 3,
    first: 0,
    mode: gl.POINTS,
  }]);
  assert.equal(gl.uniformPointSize, 4);

  const picked = await renderer.pick({ x: 1, y: 47 });
  assert.equal(picked.status, "hit");
  assert.equal(
    picked.schema,
    "bim-explorer-bounded-point-renderer-pick-receipt/0.1",
  );
  assert.deepEqual(picked.identity, {
    authority: "derived-point-range-order",
    nativeId: "point:1",
    pointIndex: 1,
    rangeHandleId: "point-range:webgl2:0",
    rangeSha256: sha256(bytes),
    renderedPointIndex: 1,
    renderedRangeHandleId: "point-range:webgl2:0",
    renderedRangeSha256: sha256(bytes),
  });
  assert.deepEqual(picked.worldPosition, [
    10_001,
    19_999,
    30_000,
  ]);
  assert.deepEqual(picked.coordinates, {
    origin: "canvas-top-left",
    x: 1,
    y: 47,
  });
  assert.equal(picked.backend.temporaryTargetBytes, 18_432);
  assert.equal(picked.backend.temporaryReleased, true);
  assert.equal(backend.state.picks, 1);
  assert.equal(gl.deletedFramebuffers, 1);
  assert.equal(gl.deletedRenderbuffers, 1);
  assert.equal(gl.deletedTextures, 1);

  const release = await renderer.unmount();
  assert.equal(release.releasedBytes, 48);
  assert.equal(release.backend.resourcesDeleted, true);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(backend.state.residentRanges, 0);
  assert.equal(gl.deletedBuffers, 1);
  assert.equal(gl.deletedPrograms, 2);
  assert.equal(gl.deletedVertexArrays, 1);
  assert.equal(await renderer.dispose(), true);
  assert.equal(backend.state.disposed, true);
});

test("point WebGL2 backend bounds readback pixels", () => {
  const gl = new FakePointWebGl2Context();
  const canvas = { getContext: () => gl };
  assert.throws(
    () => createPointCloudWebGl2Backend({
      canvas,
      height: 2048,
      width: 2048,
    }),
    /readback exceeds its pixel budget/u,
  );
});
