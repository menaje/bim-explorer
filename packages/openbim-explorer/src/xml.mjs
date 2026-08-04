import { SaxesParser } from "saxes";

const DEFAULT_LIMITS = Object.freeze({
  maximumBytes: 2 * 1024 * 1024,
  maximumDepth: 64,
  maximumNodes: 20_000,
  maximumAttributesPerNode: 64,
  maximumTextBytes: 1024 * 1024,
});

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedLimits(overrides = {}) {
  if (
    overrides === null ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    throw new TypeError("XML limits must be an object");
  }
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(`XML limit ${key} is unsupported`);
    }
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(limits)) {
    positiveInteger(value, `XML limits.${key}`);
  }
  return Object.freeze(limits);
}

function utf8Bytes(value, label, maximumBytes) {
  if (value instanceof Uint8Array) {
    if (value.byteLength > maximumBytes) {
      throw new RangeError(`${label} exceeds its byte limit`);
    }
    return value;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be UTF-8 text or bytes`);
  }
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength > maximumBytes) {
    throw new RangeError(`${label} exceeds its byte limit`);
  }
  return bytes;
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new TypeError(`${label} must contain valid UTF-8`);
  }
}

function attributeRecord(tag) {
  const entries = [];
  for (const attribute of Object.values(tag.attributes)) {
    const name = attribute.local ?? attribute.name;
    if (
      name === "xmlns" ||
      attribute.prefix === "xmlns" ||
      attribute.uri === "http://www.w3.org/2000/xmlns/"
    ) {
      continue;
    }
    entries.push([name, attribute.value]);
  }
  return Object.fromEntries(entries);
}

export function parseBoundedXml(
  input,
  {
    label = "XML document",
    limits: limitOverrides = {},
  } = {},
) {
  const limits = boundedLimits(limitOverrides);
  const bytes = utf8Bytes(input, label, limits.maximumBytes);
  const xml = decodeUtf8(bytes, label);
  if (xml.includes("\u0000")) {
    throw new TypeError(`${label} contains a NUL byte`);
  }

  const parser = new SaxesParser({
    xmlns: true,
    fragment: false,
  });
  const stack = [];
  let root = null;
  let nodeCount = 0;
  let textBytes = 0;

  parser.on("doctype", () => {
    throw new TypeError(`${label} must not contain a DOCTYPE`);
  });
  parser.on("opentag", (tag) => {
    nodeCount += 1;
    if (nodeCount > limits.maximumNodes) {
      throw new RangeError(`${label} exceeds its node limit`);
    }
    if (stack.length + 1 > limits.maximumDepth) {
      throw new RangeError(`${label} exceeds its depth limit`);
    }
    const attributeCount = Object.keys(tag.attributes).length;
    if (attributeCount > limits.maximumAttributesPerNode) {
      throw new RangeError(
        `${label} exceeds its per-node attribute limit`,
      );
    }
    const node = {
      name: tag.local ?? tag.name,
      qualifiedName: tag.name,
      namespace: tag.uri || null,
      attributes: attributeRecord(tag),
      children: [],
      text: "",
    };
    const parent = stack.at(-1);
    if (parent) {
      parent.children.push(node);
    } else if (root === null) {
      root = node;
    } else {
      throw new TypeError(`${label} has multiple root elements`);
    }
    stack.push(node);
  });
  const appendText = (value) => {
    textBytes += new TextEncoder().encode(value).byteLength;
    if (textBytes > limits.maximumTextBytes) {
      throw new RangeError(`${label} exceeds its text limit`);
    }
    const current = stack.at(-1);
    if (current) {
      current.text += value;
    }
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => {
    stack.pop();
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (
      error instanceof RangeError ||
      error instanceof TypeError
    ) {
      throw error;
    }
    throw new TypeError(`${label} is not well-formed XML`, {
      cause: error,
    });
  }
  if (root === null || stack.length !== 0) {
    throw new TypeError(`${label} is incomplete`);
  }
  return Object.freeze({
    root,
    byteLength: bytes.byteLength,
    nodeCount,
    textBytes,
  });
}

export function xmlChildren(node, name) {
  if (node === null || node === undefined) {
    return [];
  }
  return node.children.filter((child) => child.name === name);
}

export function xmlChild(node, name) {
  return xmlChildren(node, name)[0] ?? null;
}

export function xmlText(node, {
  required = false,
  maximum = 65_536,
  label = node?.name ?? "XML value",
} = {}) {
  const value = node?.text?.trim() ?? "";
  if (
    value.length > maximum ||
    (required && value.length === 0)
  ) {
    throw new TypeError(`${label} must be a bounded string`);
  }
  return value.length === 0 ? null : value;
}

export function xmlChildText(node, name, options = {}) {
  return xmlText(xmlChild(node, name), {
    ...options,
    label: options.label ?? name,
  });
}

export function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
