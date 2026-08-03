export class MockViewerHost {
  #kind;
  #events = [];
  #disposed = false;

  constructor({ kind = "browser" } = {}) {
    if (!["browser", "vscode"].includes(kind)) {
      throw new TypeError("mock Viewer Host kind must be browser or vscode");
    }
    this.#kind = kind;
  }

  get kind() {
    return this.#kind;
  }

  get disposed() {
    return this.#disposed;
  }

  get events() {
    return Object.freeze([...this.#events]);
  }

  handleEvent(event) {
    if (this.#disposed) {
      throw new DOMException("Viewer Host is disposed", "InvalidStateError");
    }
    if (
      event === null ||
      typeof event !== "object" ||
      Array.isArray(event)
    ) {
      throw new TypeError("Viewer Host event must be an object");
    }
    this.#events.push(Object.freeze({ ...event }));
    return this.#events.at(-1);
  }

  dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    return true;
  }
}
