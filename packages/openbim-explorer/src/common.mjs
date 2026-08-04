export const SOURCE_PROTOCOL = "bim-explorer-bim-source/0.2";
export const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
export const IFC_GLOBAL_ID = /^[0-3][0-9A-Za-z_$]{21}$/u;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function plainRecord(value, label) {
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

export function boundedString(
  value,
  label,
  {
    maximum = 65_536,
    required = true,
    controls = false,
  } = {},
) {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (required && value.length === 0) ||
    (!controls && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
      .test(value))
  ) {
    throw new TypeError(`${label} must be a bounded string`);
  }
  return value;
}

export function finiteVector(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((item) => !Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must contain 3 finite numbers`);
  }
  return [...value];
}

export function deepFreeze(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !ArrayBuffer.isView(value) &&
    !Object.isFrozen(value)
  ) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

export function sourceContext(snapshot) {
  const value = plainRecord(snapshot, "BIM source snapshot");
  const source = plainRecord(value.source, "BIM source descriptor");
  if (
    value.protocolVersion !== SOURCE_PROTOCOL ||
    !SOURCE_FINGERPRINT.test(source.fingerprint ?? "") ||
    value.revisionId !==
      `source-snapshot:${source.fingerprint}` ||
    !Array.isArray(value.entities)
  ) {
    throw new TypeError("BIM source snapshot identity is invalid");
  }
  const byGlobalId = new Map();
  for (const entityValue of value.entities) {
    const entity = plainRecord(
      entityValue,
      "BIM source entity",
    );
    if (
      !Number.isSafeInteger(entity.expressId) ||
      entity.expressId <= 0 ||
      (
        entity.globalId !== null &&
        entity.globalId !== undefined &&
        !IFC_GLOBAL_ID.test(entity.globalId)
      )
    ) {
      throw new TypeError("BIM source entity identity is invalid");
    }
    if (entity.globalId) {
      if (byGlobalId.has(entity.globalId)) {
        throw new TypeError(
          "BIM source GlobalId identity must be unique",
        );
      }
      byGlobalId.set(entity.globalId, entity);
    }
  }
  return {
    snapshot: value,
    source,
    byGlobalId,
    binding: deepFreeze({
      protocolVersion: SOURCE_PROTOCOL,
      fingerprint: source.fingerprint,
      revisionId: value.revisionId,
    }),
  };
}

export function assertSourceBinding(binding, snapshot) {
  const expected = sourceContext(snapshot);
  const actual = plainRecord(binding, "openBIM source binding");
  if (
    actual.protocolVersion !== SOURCE_PROTOCOL ||
    actual.fingerprint !== expected.source.fingerprint ||
    actual.revisionId !== expected.snapshot.revisionId
  ) {
    throw new DOMException(
      "openBIM artifact is stale for the active source snapshot",
      "InvalidStateError",
    );
  }
  return expected;
}

export function identityProjection(entity) {
  return deepFreeze({
    expressId: entity.expressId,
    globalId: entity.globalId ?? null,
    ifcClass: entity.ifcClass ?? null,
    name: entity.name ?? null,
    renderId: entity.renderId ?? null,
    pickId: entity.pickId ?? null,
    externalIdentityToken:
      entity.externalIdentityToken ?? null,
  });
}

export async function sha256Identifier(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("digest input must be a Uint8Array");
  }
  if (globalThis.crypto?.subtle === undefined) {
    throw new DOMException(
      "SHA-256 is unavailable in this runtime",
      "NotSupportedError",
    );
  }
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes),
  );
  const hex = [...digest]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

export function asBytes(
  value,
  label,
  maximumBytes,
) {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  if (value.byteLength === 0) {
    throw new RangeError(`${label} must not be empty`);
  }
  if (value.byteLength > maximumBytes) {
    throw new RangeError(`${label} exceeds its byte limit`);
  }
  return value;
}
