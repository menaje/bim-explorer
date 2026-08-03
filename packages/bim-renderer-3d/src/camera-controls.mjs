import {
  orbitCamera3d,
  panCamera3d,
  validateCamera3d,
  zoomCamera3d,
} from "./camera.mjs";

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function positiveDimension(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function pointer(value, label) {
  if (
    !Number.isSafeInteger(value?.pointerId) ||
    value.pointerId < 0 ||
    ![0, 1, 2].includes(value.button)
  ) {
    throw new TypeError(`${label} pointer is invalid`);
  }
  return Object.freeze({
    button: value.button,
    pointerId: value.pointerId,
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
  });
}

export class CameraInteraction3d {
  #camera;
  #disposed = false;
  #drag = null;
  #events = 0;
  #orbitUpdates = 0;
  #panUpdates = 0;
  #zoomUpdates = 0;

  constructor({
    camera,
    height,
    width,
  } = {}) {
    this.#camera = validateCamera3d(camera);
    this.height = positiveDimension(
      height,
      "camera interaction height",
    );
    this.width = positiveDimension(
      width,
      "camera interaction width",
    );
  }

  get camera() {
    return this.#camera;
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      dragging: this.#drag !== null,
      dragMode: this.#drag?.mode ?? null,
      events: this.#events,
      orbitUpdates: this.#orbitUpdates,
      panUpdates: this.#panUpdates,
      zoomUpdates: this.#zoomUpdates,
      camera: this.#camera,
    });
  }

  pointerDown(value) {
    if (this.#disposed) {
      throw new DOMException(
        "camera interaction is disposed",
        "InvalidStateError",
      );
    }
    const event = pointer(value, "camera pointer down");
    this.#drag = Object.freeze({
      mode: event.button === 0 ? "orbit" : "pan",
      pointerId: event.pointerId,
      x: event.x,
      y: event.y,
    });
    this.#events += 1;
    return this.#camera;
  }

  pointerMove(value) {
    if (this.#disposed) {
      throw new DOMException(
        "camera interaction is disposed",
        "InvalidStateError",
      );
    }
    if (this.#drag === null) {
      return null;
    }
    const event = pointer({
      ...value,
      button: this.#drag.mode === "orbit" ? 0 : 1,
    }, "camera pointer move");
    if (event.pointerId !== this.#drag.pointerId) {
      return null;
    }
    const deltaX = event.x - this.#drag.x;
    const deltaY = event.y - this.#drag.y;
    this.#drag = Object.freeze({
      ...this.#drag,
      x: event.x,
      y: event.y,
    });
    this.#events += 1;
    if (deltaX === 0 && deltaY === 0) {
      return null;
    }
    if (this.#drag.mode === "orbit") {
      this.#camera = orbitCamera3d(this.#camera, {
        yaw: -deltaX / this.width * Math.PI,
        pitch: -deltaY / this.height * Math.PI,
      });
      this.#orbitUpdates += 1;
    } else {
      this.#camera = panCamera3d(this.#camera, {
        right: -deltaX / this.width,
        up: deltaY / this.height,
      });
      this.#panUpdates += 1;
    }
    return this.#camera;
  }

  pointerUp({ pointerId } = {}) {
    if (this.#disposed) {
      throw new DOMException(
        "camera interaction is disposed",
        "InvalidStateError",
      );
    }
    if (
      !Number.isSafeInteger(pointerId) ||
      pointerId < 0
    ) {
      throw new TypeError(
        "camera pointer up pointerId must be non-negative",
      );
    }
    if (
      this.#drag === null ||
      this.#drag.pointerId !== pointerId
    ) {
      return false;
    }
    this.#drag = null;
    this.#events += 1;
    return true;
  }

  wheel({ deltaY } = {}) {
    if (this.#disposed) {
      throw new DOMException(
        "camera interaction is disposed",
        "InvalidStateError",
      );
    }
    finiteNumber(deltaY, "camera wheel.deltaY");
    const bounded = Math.max(-1_000, Math.min(1_000, deltaY));
    this.#camera = zoomCamera3d(
      this.#camera,
      Math.exp(bounded * 0.001),
    );
    this.#events += 1;
    this.#zoomUpdates += 1;
    return this.#camera;
  }

  dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#drag = null;
    this.#disposed = true;
    return true;
  }
}

export function createCameraInteraction3d(options) {
  return new CameraInteraction3d(options);
}

export function attachCameraControls3d({
  camera,
  element,
  height,
  onCamera,
  width,
} = {}) {
  if (
    typeof element?.addEventListener !== "function" ||
    typeof element?.removeEventListener !== "function"
  ) {
    throw new TypeError(
      "camera controls element must be an EventTarget",
    );
  }
  if (typeof onCamera !== "function") {
    throw new TypeError(
      "camera controls onCamera must be a function",
    );
  }
  const interaction = new CameraInteraction3d({
    camera,
    height,
    width,
  });
  let disposed = false;
  let queue = Promise.resolve();
  const enqueue = (nextCamera, kind) => {
    if (nextCamera === null) {
      return;
    }
    queue = queue.then(() =>
      onCamera(nextCamera, Object.freeze({ kind })));
  };
  const down = (event) => {
    event.preventDefault();
    interaction.pointerDown({
      button: event.button,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic and accessibility-driven events may have no capture slot.
    }
  };
  const move = (event) => {
    event.preventDefault();
    const kind = interaction.state.dragMode;
    enqueue(interaction.pointerMove({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }), kind);
  };
  const up = (event) => {
    event.preventDefault();
    interaction.pointerUp({
      pointerId: event.pointerId,
    });
    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
  };
  const wheel = (event) => {
    event.preventDefault();
    enqueue(interaction.wheel({
      deltaY: event.deltaY,
    }), "zoom");
  };
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("wheel", wheel, {
    passive: false,
  });
  return Object.freeze({
    get state() {
      return interaction.state;
    },
    whenIdle: () => queue,
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("wheel", wheel);
      interaction.dispose();
      return true;
    },
  });
}
