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
  #initialCamera;
  #keyboardUpdates = 0;
  #orbitUpdates = 0;
  #panUpdates = 0;
  #programmaticUpdates = 0;
  #resetUpdates = 0;
  #zoomUpdates = 0;

  constructor({
    camera,
    height,
    width,
  } = {}) {
    this.#camera = validateCamera3d(camera);
    this.#initialCamera = this.#camera;
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
      keyboardUpdates: this.#keyboardUpdates,
      orbitUpdates: this.#orbitUpdates,
      panUpdates: this.#panUpdates,
      programmaticUpdates: this.#programmaticUpdates,
      resetUpdates: this.#resetUpdates,
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

  key({ key, shiftKey = false } = {}) {
    if (this.#disposed) {
      throw new DOMException(
        "camera interaction is disposed",
        "InvalidStateError",
      );
    }
    if (typeof key !== "string" || typeof shiftKey !== "boolean") {
      throw new TypeError("camera key input is invalid");
    }
    const orbitStep = Math.PI / 24;
    const panStep = 0.05;
    let kind = null;
    if (["ArrowLeft", "ArrowRight"].includes(key)) {
      if (shiftKey) {
        this.#camera = panCamera3d(this.#camera, {
          right: key === "ArrowLeft" ? -panStep : panStep,
          up: 0,
        });
        this.#panUpdates += 1;
        kind = "pan";
      } else {
        this.#camera = orbitCamera3d(this.#camera, {
          yaw: key === "ArrowLeft" ? orbitStep : -orbitStep,
          pitch: 0,
        });
        this.#orbitUpdates += 1;
        kind = "orbit";
      }
    } else if (["ArrowUp", "ArrowDown"].includes(key)) {
      if (shiftKey) {
        this.#camera = panCamera3d(this.#camera, {
          right: 0,
          up: key === "ArrowUp" ? panStep : -panStep,
        });
        this.#panUpdates += 1;
        kind = "pan";
      } else {
        this.#camera = orbitCamera3d(this.#camera, {
          yaw: 0,
          pitch: key === "ArrowUp" ? orbitStep : -orbitStep,
        });
        this.#orbitUpdates += 1;
        kind = "orbit";
      }
    } else if (["+", "="].includes(key)) {
      this.#camera = zoomCamera3d(this.#camera, 0.85);
      this.#zoomUpdates += 1;
      kind = "zoom";
    } else if (["-", "_"].includes(key)) {
      this.#camera = zoomCamera3d(this.#camera, 1.15);
      this.#zoomUpdates += 1;
      kind = "zoom";
    } else if (key === "Home") {
      this.#camera = this.#initialCamera;
      this.#resetUpdates += 1;
      kind = "reset";
    }
    if (kind === null) {
      return null;
    }
    this.#events += 1;
    this.#keyboardUpdates += 1;
    return Object.freeze({
      camera: this.#camera,
      kind,
    });
  }

  setCamera(camera, { resetInitial = false } = {}) {
    if (this.#disposed) {
      throw new DOMException(
        "camera interaction is disposed",
        "InvalidStateError",
      );
    }
    if (typeof resetInitial !== "boolean") {
      throw new TypeError(
        "camera interaction resetInitial must be boolean",
      );
    }
    this.#camera = validateCamera3d(camera);
    if (resetInitial) {
      this.#initialCamera = this.#camera;
    }
    this.#drag = null;
    this.#programmaticUpdates += 1;
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
  maximumClickMovement = 4,
  onCamera,
  onPrimaryClick = null,
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
  if (
    typeof maximumClickMovement !== "number" ||
    !Number.isFinite(maximumClickMovement) ||
    maximumClickMovement < 0 ||
    maximumClickMovement > 32
  ) {
    throw new RangeError(
      "camera controls click movement must be between 0 and 32 pixels",
    );
  }
  if (
    onPrimaryClick !== null &&
    typeof onPrimaryClick !== "function"
  ) {
    throw new TypeError(
      "camera controls onPrimaryClick must be a function or null",
    );
  }
  const interaction = new CameraInteraction3d({
    camera,
    height,
    width,
  });
  let disposed = false;
  let primaryGesture = null;
  let queue = Promise.resolve();
  const enqueue = (nextCamera, kind) => {
    if (nextCamera === null) {
      return;
    }
    queue = queue.then(() =>
      onCamera(nextCamera, Object.freeze({ kind })));
  };
  const down = (event) => {
    if (![0, 1, 2].includes(event.button)) {
      return;
    }
    event.preventDefault();
    try {
      element.focus?.({ preventScroll: true });
    } catch {
      element.focus?.();
    }
    interaction.pointerDown({
      button:
        event.button === 0 && event.shiftKey === true
          ? 1
          : event.button,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    primaryGesture =
      event.button === 0 && event.shiftKey !== true
      ? {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dragging: false,
          maximumMovementSquared: 0,
        }
      : null;
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic and accessibility-driven events may have no capture slot.
    }
  };
  const move = (event) => {
    event.preventDefault();
    if (primaryGesture?.pointerId === event.pointerId) {
      const deltaX = event.clientX - primaryGesture.startX;
      const deltaY = event.clientY - primaryGesture.startY;
      primaryGesture.maximumMovementSquared = Math.max(
        primaryGesture.maximumMovementSquared,
        deltaX * deltaX + deltaY * deltaY,
      );
      primaryGesture.dragging =
        primaryGesture.maximumMovementSquared >
          maximumClickMovement * maximumClickMovement;
      if (!primaryGesture.dragging) {
        return;
      }
    }
    const kind = interaction.state.dragMode;
    enqueue(interaction.pointerMove({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }), kind);
  };
  const up = (event) => {
    event.preventDefault();
    const released = interaction.pointerUp({
      pointerId: event.pointerId,
    });
    const click =
      released &&
      primaryGesture?.pointerId === event.pointerId &&
      !primaryGesture.dragging;
    primaryGesture = null;
    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
    if (click && onPrimaryClick !== null) {
      queue = queue.then(() => onPrimaryClick(Object.freeze({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      })));
    }
  };
  const cancel = (event) => {
    event.preventDefault();
    primaryGesture = null;
    interaction.pointerUp({
      pointerId: event.pointerId,
    });
  };
  const contextMenu = (event) => {
    event.preventDefault();
  };
  const wheel = (event) => {
    event.preventDefault();
    enqueue(interaction.wheel({
      deltaY: event.deltaY,
    }), "zoom");
  };
  const keydown = (event) => {
    if (
      event.altKey === true ||
      event.ctrlKey === true ||
      event.metaKey === true
    ) {
      return;
    }
    const update = interaction.key({
      key: event.key,
      shiftKey: event.shiftKey === true,
    });
    if (update === null) {
      return;
    }
    event.preventDefault();
    enqueue(update.camera, update.kind);
  };
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("contextmenu", contextMenu);
  element.addEventListener("wheel", wheel, {
    passive: false,
  });
  element.addEventListener("keydown", keydown);
  return Object.freeze({
    get state() {
      return interaction.state;
    },
    whenIdle: () => queue,
    setCamera(nextCamera, {
      kind = "programmatic",
    } = {}) {
      if (typeof kind !== "string" || kind.length === 0) {
        throw new TypeError(
          "camera controls programmatic kind is invalid",
        );
      }
      const camera = validateCamera3d(nextCamera);
      const operation = queue.then(async () => {
        const previousCamera = interaction.camera;
        const updated = interaction.setCamera(camera);
        try {
          await onCamera(updated, Object.freeze({ kind }));
          return updated;
        } catch (error) {
          interaction.setCamera(previousCamera, {
            resetInitial: false,
          });
          throw error;
        }
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", cancel);
      element.removeEventListener("contextmenu", contextMenu);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", keydown);
      interaction.dispose();
      return true;
    },
  });
}
