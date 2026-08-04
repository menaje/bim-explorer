import {
  boundedString,
  deepFreeze,
  plainRecord,
} from "./common.mjs";

export const BSDD_REFERENCE_SCHEMA =
  "bim-explorer-bsdd-reference/0.1";
export const BSDD_LOOKUP_SCHEMA =
  "bim-explorer-bsdd-lookup/0.1";

const IDENTIFIER_HOST = "identifier.buildingsmart.org";
const API_HOST = "api.bsdd.buildingsmart.org";
const SUPPORTED_KINDS = new Set(["class", "property"]);
const DEFAULT_LIMITS = Object.freeze({
  maximumResponseBytes: 512 * 1024,
  maximumCacheEntries: 128,
});

function parseIdentifier(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const marker = segments.indexOf("uri");
  if (
    marker === -1 ||
    segments.length < marker + 6
  ) {
    return null;
  }
  const [
    namespace,
    dictionary,
    version,
    kind,
    ...codeParts
  ] = segments.slice(marker + 1);
  if (
    !namespace ||
    !dictionary ||
    !version ||
    !SUPPORTED_KINDS.has(kind) ||
    codeParts.length === 0
  ) {
    return null;
  }
  return {
    namespace,
    dictionary,
    version,
    kind,
    code: codeParts.join("/"),
  };
}

export function createBsddReference(value) {
  const input = typeof value === "string"
    ? { uri: value }
    : plainRecord(value, "bSDD reference");
  const uri = boundedString(
    input.uri,
    "bSDD reference URI",
    { maximum: 2_048 },
  );
  let url;
  try {
    url = new URL(uri);
  } catch {
    throw new TypeError("bSDD reference URI is invalid");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError(
      "bSDD reference URI must use HTTP or HTTPS",
    );
  }
  const identifier = url.hostname === IDENTIFIER_HOST
    ? parseIdentifier(url)
    : null;
  const declaredKind = input.kind ?? null;
  if (
    declaredKind !== null &&
    !["class", "property", "material", "classification"]
      .includes(declaredKind)
  ) {
    throw new TypeError("bSDD reference kind is invalid");
  }
  return deepFreeze({
    schema: BSDD_REFERENCE_SCHEMA,
    uri,
    vocabulary:
      identifier === null ? "external" : "bSDD",
    secure: url.protocol === "https:",
    namespace: identifier?.namespace ?? null,
    dictionary: identifier?.dictionary ?? null,
    version: input.version ?? identifier?.version ?? null,
    kind: identifier?.kind ?? declaredKind,
    code: identifier?.code ?? input.code ?? null,
    label: input.label ?? null,
  });
}

function limitsFrom(overrides = {}) {
  plainRecord(overrides, "bSDD resolver limits");
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(
        `bSDD resolver limit ${key} is unsupported`,
      );
    }
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(
        `bSDD resolver limits.${key} is invalid`,
      );
    }
  }
  return Object.freeze(limits);
}

async function readResponseBytes(response, maximum, signal) {
  const declared = Number(
    response.headers?.get?.("content-length"),
  );
  if (Number.isFinite(declared) && declared > maximum) {
    throw new RangeError(
      "bSDD response exceeds its declared byte limit",
    );
  }
  if (response.body?.getReader === undefined) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximum) {
      throw new RangeError(
        "bSDD response exceeds its byte limit",
      );
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      signal?.throwIfAborted?.();
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel(
          "bSDD response exceeds its byte limit",
        );
        throw new RangeError(
          "bSDD response exceeds its byte limit",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function lookupUrl(reference) {
  const kind = reference.kind === "property"
    ? "Property"
    : "Class";
  const url = new URL(
    `https://${API_HOST}/api/${kind}/v1`,
  );
  url.searchParams.set("Uri", reference.uri);
  return url;
}

function cacheKey(reference) {
  return [
    reference.uri,
    reference.kind ?? "",
    reference.version ?? "",
  ].join("\u001f");
}

export function createBsddResolver({
  fetcher = globalThis.fetch,
  limits: limitOverrides = {},
} = {}) {
  const limits = limitsFrom(limitOverrides);
  if (fetcher !== undefined && typeof fetcher !== "function") {
    throw new TypeError("bSDD fetcher must be a function");
  }
  const cache = new Map();
  let networkRequests = 0;
  let disposed = false;

  function active() {
    if (disposed) {
      throw new DOMException(
        "bSDD resolver is disposed",
        "InvalidStateError",
      );
    }
  }

  function remember(key, result) {
    if (cache.has(key)) {
      cache.delete(key);
    }
    cache.set(key, result);
    while (cache.size > limits.maximumCacheEntries) {
      cache.delete(cache.keys().next().value);
    }
  }

  async function lookup(
    referenceValue,
    {
      allowNetwork = false,
      signal,
    } = {},
  ) {
    active();
    const reference = referenceValue?.schema ===
      BSDD_REFERENCE_SCHEMA
      ? referenceValue
      : createBsddReference(referenceValue);
    const key = cacheKey(reference);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return deepFreeze({
        ...structuredClone(cached),
        status: cached.status === "resolved"
          ? "cached"
          : cached.status,
        cacheHit: true,
      });
    }
    if (reference.vocabulary !== "bSDD") {
      return deepFreeze({
        schema: BSDD_LOOKUP_SCHEMA,
        status: "unsupported-vocabulary",
        reference,
        cacheHit: false,
        networkRequested: false,
        data: null,
      });
    }
    if (!reference.secure) {
      return deepFreeze({
        schema: BSDD_LOOKUP_SCHEMA,
        status: "insecure-reference",
        reference,
        cacheHit: false,
        networkRequested: false,
        data: null,
      });
    }
    if (!allowNetwork) {
      return deepFreeze({
        schema: BSDD_LOOKUP_SCHEMA,
        status: "offline-missing",
        reference,
        cacheHit: false,
        networkRequested: false,
        data: null,
      });
    }
    if (fetcher === undefined) {
      return deepFreeze({
        schema: BSDD_LOOKUP_SCHEMA,
        status: "network-unavailable",
        reference,
        cacheHit: false,
        networkRequested: true,
        data: null,
      });
    }

    signal?.throwIfAborted?.();
    networkRequests += 1;
    const url = lookupUrl(reference);
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
    });
    if (response.status === 404) {
      const result = deepFreeze({
        schema: BSDD_LOOKUP_SCHEMA,
        status: "missing",
        reference,
        cacheHit: false,
        networkRequested: true,
        endpoint: url.toString(),
        httpStatus: 404,
        data: null,
      });
      remember(key, result);
      return result;
    }
    if (!response.ok) {
      return deepFreeze({
        schema: BSDD_LOOKUP_SCHEMA,
        status: "unavailable",
        reference,
        cacheHit: false,
        networkRequested: true,
        endpoint: url.toString(),
        httpStatus: response.status,
        data: null,
      });
    }
    const bytes = await readResponseBytes(
      response,
      limits.maximumResponseBytes,
      signal,
    );
    let data;
    try {
      data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new TypeError(
        "bSDD response must be bounded UTF-8 JSON",
      );
    }
    plainRecord(data, "bSDD response");
    const result = deepFreeze({
      schema: BSDD_LOOKUP_SCHEMA,
      status: "resolved",
      reference,
      cacheHit: false,
      networkRequested: true,
      endpoint: url.toString(),
      httpStatus: response.status,
      responseBytes: bytes.byteLength,
      data: structuredClone(data),
    });
    remember(key, result);
    return result;
  }

  return Object.freeze({
    lookup,
    get state() {
      return deepFreeze({
        disposed,
        cacheEntries: cache.size,
        networkRequests,
      });
    },
    clear() {
      active();
      const removed = cache.size;
      cache.clear();
      return removed;
    },
    dispose() {
      if (disposed) {
        return false;
      }
      disposed = true;
      cache.clear();
      return true;
    },
  });
}
