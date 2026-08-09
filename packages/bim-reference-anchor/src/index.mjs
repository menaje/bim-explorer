export const BIM_REFERENCE_ANCHOR_SCHEMA =
  "bim-explorer-reference-anchor/0.1";
export const BIM_REFERENCE_ANCHOR_VALIDATION_SCHEMA =
  "bim-explorer-reference-anchor-validation/0.1";
export const BIM_REFERENCE_ANCHOR_MAXIMUM_BYTES = 32 * 1024;
export const BIM_REFERENCE_ANCHOR_MAXIMUM_OCCURRENCES = 64;

export const BIM_REFERENCE_ANCHOR_AUTHORITY = deepFreeze({
  workspace: false,
  canonicalEntityId: false,
  sourceMutation: false,
  geometryMutation: false,
  constraintMutation: false,
  acceptance: false,
  publish: false,
  export: false,
});

const FEDERATION_SOURCE_SCHEMA =
  "bim-explorer-federation-source/0.1";
const FEDERATED_PROJECTION_SCHEMA =
  "bim-explorer-federated-renderer-projection/0.1";
const RENDERER_PICK_SCHEMA =
  "bim-explorer-bim-renderer-3d-pick-receipt/0.1";
const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u;
const STABILITIES = new Set([
  "native",
  "derived",
  "point-only",
]);

function deepFreeze(value) {
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

function boundedString(value, label, maximum = 512) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    LOCAL_PATH_PATTERN.test(value)
  ) {
    throw new TypeError(
      `${label} must be a bounded path-free string`,
    );
  }
  return value;
}

function fingerprint(value, label) {
  if (!SOURCE_FINGERPRINT.test(value ?? "")) {
    throw new TypeError(`${label} must be a SHA-256 fingerprint`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new TypeError(
      `${label} must contain ${length} finite numbers`,
    );
  }
  return [...value];
}

function normalizeNormal(value, label) {
  const normal = finiteVector(value, 3, label);
  const magnitude = Math.hypot(...normal);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new RangeError(`${label} must not be a zero vector`);
  }
  return normal.map((component) => component / magnitude);
}

function validateOccurrencePath(value) {
  if (
    !Array.isArray(value) ||
    value.length > BIM_REFERENCE_ANCHOR_MAXIMUM_OCCURRENCES
  ) {
    throw new RangeError(
      "reference anchor occurrence path exceeds its bound",
    );
  }
  return value.map((item, index) =>
    boundedString(
      item,
      `reference anchor occurrence path ${index}`,
      256,
    ));
}

function validateNativeDocument(value) {
  const document = plainRecord(
    value,
    "reference anchor native document",
  );
  const format = boundedString(
    document.format,
    "reference anchor native document format",
    64,
  ).toLowerCase();
  return {
    format,
    fingerprint: fingerprint(
      document.fingerprint,
      "reference anchor native document fingerprint",
    ),
    revisionId: boundedString(
      document.revisionId,
      "reference anchor native document revision",
    ),
    schema: boundedString(
      document.schema,
      "reference anchor native document schema",
      128,
    ),
    profile: boundedString(
      document.profile,
      "reference anchor native document profile",
      256,
    ),
  };
}

function validateNativeIdentity(value) {
  const identity = plainRecord(
    value,
    "reference anchor native identity",
  );
  const result = {
    kind: boundedString(
      identity.kind,
      "reference anchor native identity kind",
      64,
    ),
    nativeId: boundedString(
      identity.nativeId,
      "reference anchor native ID",
      512,
    ),
    occurrencePath: validateOccurrencePath(
      identity.occurrencePath ?? [],
    ),
  };
  if (identity.globalId !== undefined && identity.globalId !== null) {
    result.globalId = boundedString(
      identity.globalId,
      "reference anchor GlobalId",
      128,
    );
  }
  return result;
}

function validateHit(value) {
  const hit = plainRecord(value, "reference anchor hit");
  if (hit.coordinateSpace !== "source-local") {
    throw new TypeError(
      "reference anchor hit must use source-local coordinates",
    );
  }
  return {
    coordinateSpace: "source-local",
    point: finiteVector(
      hit.point,
      3,
      "reference anchor source-local point",
    ),
    normal: normalizeNormal(
      hit.normal,
      "reference anchor source-local normal",
    ),
  };
}

function validateLocator(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const locator = plainRecord(value, "reference anchor locator");
  if (locator.kind !== "triangle-barycentric") {
    throw new TypeError("reference anchor locator kind is unsupported");
  }
  if (
    !Number.isSafeInteger(locator.triangleIndex) ||
    locator.triangleIndex < 0
  ) {
    throw new TypeError(
      "reference anchor triangle index must be a non-negative integer",
    );
  }
  const barycentric = finiteVector(
    locator.barycentric,
    3,
    "reference anchor barycentric coordinate",
  );
  if (
    barycentric.some((component) => component < 0 || component > 1) ||
    Math.abs(barycentric.reduce((sum, value) => sum + value, 0) - 1) >
      1e-6
  ) {
    throw new RangeError(
      "reference anchor barycentric coordinate is invalid",
    );
  }
  return {
    kind: "triangle-barycentric",
    primitiveId: boundedString(
      locator.primitiveId,
      "reference anchor primitive ID",
      256,
    ),
    triangleIndex: locator.triangleIndex,
    barycentric,
  };
}

function serializedBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !ArrayBuffer.isView(value)
  ) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [
        key,
        canonicalValue(value[key]),
      ]),
    );
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  throw new TypeError(
    "reference anchor fingerprint input is not JSON-safe",
  );
}

function hex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintReferenceAnchorContext(value) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify(canonicalValue(value)),
  );
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes,
  );
  return `sha256:${hex(new Uint8Array(digest))}`;
}

export function createBimReferenceAnchor(value) {
  const input = plainRecord(value, "reference anchor input");
  const stability = input.stability ?? "derived";
  if (!STABILITIES.has(stability)) {
    throw new TypeError("reference anchor stability is unsupported");
  }
  const locator = validateLocator(input.locator);
  if (stability === "point-only" && locator !== null) {
    throw new TypeError(
      "point-only reference anchor cannot carry a topology locator",
    );
  }
  const anchor = {
    schema: BIM_REFERENCE_ANCHOR_SCHEMA,
    federationSourceId: boundedString(
      input.federationSourceId,
      "reference anchor federation source ID",
    ),
    nativeDocument: validateNativeDocument(input.nativeDocument),
    nativeIdentity: validateNativeIdentity(input.nativeIdentity),
    hit: validateHit(input.hit),
    locator,
    stability,
    alignmentFingerprint: fingerprint(
      input.alignmentFingerprint,
      "reference anchor alignment fingerprint",
    ),
    projectionFingerprint: fingerprint(
      input.projectionFingerprint,
      "reference anchor projection fingerprint",
    ),
    authority: BIM_REFERENCE_ANCHOR_AUTHORITY,
  };
  if (serializedBytes(anchor) > BIM_REFERENCE_ANCHOR_MAXIMUM_BYTES) {
    throw new RangeError("reference anchor receipt exceeds 32 KiB");
  }
  return deepFreeze(anchor);
}

export function validateBimReferenceAnchor(value) {
  const input = plainRecord(value, "reference anchor receipt");
  if (input.schema !== BIM_REFERENCE_ANCHOR_SCHEMA) {
    throw new TypeError("reference anchor schema is incompatible");
  }
  return createBimReferenceAnchor(input);
}

function bindingFrom(value, label) {
  const input = plainRecord(value, label);
  return {
    federationSourceId: boundedString(
      input.federationSourceId,
      `${label} federation source ID`,
    ),
    nativeDocument: validateNativeDocument(input.nativeDocument),
    nativeIdentity: validateNativeIdentity(input.nativeIdentity),
    alignmentFingerprint: fingerprint(
      input.alignmentFingerprint,
      `${label} alignment fingerprint`,
    ),
    projectionFingerprint: fingerprint(
      input.projectionFingerprint,
      `${label} projection fingerprint`,
    ),
  };
}

function same(value, current) {
  return JSON.stringify(value) === JSON.stringify(current);
}

export function evaluateBimReferenceAnchor(anchorValue, currentValue) {
  const anchor = validateBimReferenceAnchor(anchorValue);
  const current = bindingFrom(
    currentValue,
    "current reference anchor binding",
  );
  const reasons = [];
  if (anchor.federationSourceId !== current.federationSourceId) {
    reasons.push("source-slot-changed");
  }
  if (
    anchor.nativeDocument.fingerprint !==
      current.nativeDocument.fingerprint
  ) {
    reasons.push("native-fingerprint-changed");
  }
  if (
    anchor.nativeDocument.revisionId !==
      current.nativeDocument.revisionId
  ) {
    reasons.push("native-revision-changed");
  }
  if (
    anchor.nativeDocument.format !== current.nativeDocument.format ||
    anchor.nativeDocument.schema !== current.nativeDocument.schema ||
    anchor.nativeDocument.profile !== current.nativeDocument.profile
  ) {
    reasons.push("native-document-profile-changed");
  }
  const anchorIdentity = {
    kind: anchor.nativeIdentity.kind,
    nativeId: anchor.nativeIdentity.nativeId,
    globalId: anchor.nativeIdentity.globalId ?? null,
  };
  const currentIdentity = {
    kind: current.nativeIdentity.kind,
    nativeId: current.nativeIdentity.nativeId,
    globalId: current.nativeIdentity.globalId ?? null,
  };
  if (!same(anchorIdentity, currentIdentity)) {
    reasons.push("native-identity-changed");
  }
  if (!same(
    anchor.nativeIdentity.occurrencePath,
    current.nativeIdentity.occurrencePath,
  )) {
    reasons.push("occurrence-path-changed");
  }
  if (
    anchor.alignmentFingerprint !== current.alignmentFingerprint
  ) {
    reasons.push("alignment-changed");
  }
  if (
    anchor.projectionFingerprint !== current.projectionFingerprint
  ) {
    reasons.push("projection-changed");
  }
  return deepFreeze({
    schema: BIM_REFERENCE_ANCHOR_VALIDATION_SCHEMA,
    status: reasons.length === 0 ? "current" : "stale",
    reasons,
    authority: BIM_REFERENCE_ANCHOR_AUTHORITY,
  });
}

export function assertBimReferenceAnchorCurrent(
  anchorValue,
  currentValue,
) {
  const result = evaluateBimReferenceAnchor(
    anchorValue,
    currentValue,
  );
  if (result.status !== "current") {
    throw new DOMException(
      `reference anchor is stale: ${result.reasons.join(", ")}`,
      "InvalidStateError",
    );
  }
  return result;
}

function nativeIdentityFromMapping(mapping, format, occurrencePath) {
  const identity = plainRecord(
    mapping.nativeIdentity,
    "federated pick native identity",
  );
  if (format === "ifc") {
    if (typeof identity.globalId === "string" && identity.globalId.length > 0) {
      return {
        kind: "ifc-global-id",
        nativeId: `ifc-globalid:${identity.globalId}`,
        globalId: identity.globalId,
        occurrencePath,
      };
    }
    if (!Number.isSafeInteger(identity.expressId) || identity.expressId <= 0) {
      throw new TypeError(
        "federated IFC pick has no source-native identity",
      );
    }
    return {
      kind: "ifc-express-id",
      nativeId: `ifc-express-id:${identity.expressId}`,
      occurrencePath,
    };
  }
  return {
    kind: `${format}-native-id`,
    nativeId: boundedString(
      identity.nativeId,
      "federated reference pick native ID",
      512,
    ),
    occurrencePath,
  };
}

function projectPoint(matrixValue, pointValue) {
  const matrix = finiteVector(
    matrixValue,
    16,
    "federated source alignment matrix",
  );
  const [x, y, z] = finiteVector(
    pointValue,
    3,
    "reference anchor source-local point",
  );
  const w =
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (!Number.isFinite(w) || Math.abs(w) <= Number.EPSILON) {
    throw new RangeError("reference anchor point is not projectable");
  }
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w,
  ];
}

function pointsMatch(left, right) {
  const scale = Math.max(1, ...left.map(Math.abs), ...right.map(Math.abs));
  return left.every((value, index) =>
    Math.abs(value - right[index]) <= scale * 1e-9);
}

export async function createBimReferenceAnchorFromFederatedPick({
  pick: pickValue,
  projection: projectionValue,
  source: sourceValue,
  sourceLocalHit,
  occurrencePath = [],
  locator = null,
  stability = "derived",
} = {}) {
  const pick = plainRecord(pickValue, "federated renderer pick");
  const projection = plainRecord(
    projectionValue,
    "federated renderer projection",
  );
  const source = plainRecord(
    sourceValue,
    "federation source descriptor",
  );
  if (
    pick.schema !== RENDERER_PICK_SCHEMA ||
    pick.status !== "hit" ||
    projection.schema !== FEDERATED_PROJECTION_SCHEMA ||
    source.schema !== FEDERATION_SOURCE_SCHEMA ||
    !Array.isArray(projection.identityMap)
  ) {
    throw new TypeError(
      "federated pick, projection, or source contract is incompatible",
    );
  }
  const pickId = boundedString(
    pick.identity?.pickId,
    "federated renderer Pick ID",
  );
  const mappings = projection.identityMap.filter(
    (entry) => entry.pickId === pickId,
  );
  if (mappings.length !== 1) {
    throw new RangeError(
      "federated renderer pick identity is ambiguous or missing",
    );
  }
  const mapping = mappings[0];
  if (
    mapping.federationSourceId !== source.federationSourceId ||
    mapping.sourceRevisionId !== source.nativeDocument?.revisionId ||
    pick.source?.fingerprint !==
      projection.snapshot?.source?.fingerprint ||
    pick.source?.revisionId !== projection.snapshot?.revisionId
  ) {
    throw new RangeError(
      "federated renderer pick is outside the exact source projection",
    );
  }
  const alignment = plainRecord(
    source.alignment,
    "federation source alignment",
  );
  if (alignment.status !== "aligned") {
    throw new DOMException(
      "unaligned federation source cannot create a shared anchor",
      "NotSupportedError",
    );
  }
  const hit = validateHit(sourceLocalHit);
  const projectedPoint = projectPoint(
    alignment.sourceToFederation,
    hit.point,
  );
  const pickPoint = finiteVector(
    pick.worldPosition,
    3,
    "federated renderer pick world position",
  );
  if (!pointsMatch(projectedPoint, pickPoint)) {
    throw new RangeError(
      "source-local hit does not reproduce the renderer pick",
    );
  }
  const nativeDocument = plainRecord(
    source.nativeDocument,
    "federation source native document",
  );
  const format = boundedString(
    source.format,
    "federation source format",
    64,
  ).toLowerCase();
  return createBimReferenceAnchor({
    federationSourceId: source.federationSourceId,
    nativeDocument: {
      format,
      fingerprint: nativeDocument.fingerprint,
      revisionId: nativeDocument.revisionId,
      schema: nativeDocument.schema,
      profile: nativeDocument.profile,
    },
    nativeIdentity: nativeIdentityFromMapping(
      mapping,
      format,
      validateOccurrencePath(occurrencePath),
    ),
    hit,
    locator,
    stability,
    alignmentFingerprint:
      await fingerprintReferenceAnchorContext(alignment),
    projectionFingerprint: fingerprint(
      projection.snapshot.source.fingerprint,
      "federated renderer projection fingerprint",
    ),
  });
}
