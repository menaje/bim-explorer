export const BIM_REFERENCE_FORMAT_INTAKE_SCHEMA =
  "bim-explorer-reference-format-intake/0.1";
export const BIM_REFERENCE_FORMAT_TRIAGE_SCHEMA =
  "bim-explorer-reference-format-triage/0.1";

const CAPABILITIES = new Set([
  "view",
  "query",
  "write",
  "roundTrip",
]);
const DEMAND_KINDS = new Set([
  "actual-user-task",
  "maintainer-hypothesis",
]);
const FIXTURE_AVAILABILITY = new Set([
  "public-test-only",
  "public-redistributable",
  "private-review-only",
  "none",
]);
const IMPLEMENTATION_KINDS = new Set([
  "open-source-codec",
  "native-sdk",
  "network-engine",
  "unknown",
]);
const REDISTRIBUTION_STATES = new Set([
  "confirmed",
  "review-required",
  "blocked",
  "unknown",
]);
const COORDINATE_MODES = new Set([
  "local",
  "projected-crs",
  "surveyed-control-points",
  "geospatial-tileset",
  "native-sdk",
  "unknown",
]);
const EVIDENCE_REFERENCE =
  /^(?:public-issue:[1-9][0-9]{0,9}|(?:private-review|public-evidence):sha256:[0-9a-f]{64})$/u;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/home\/[^/]+\/|[A-Z]:\\)/u;

function deepFreeze(value) {
  if (
    value !== null &&
    typeof value === "object" &&
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
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(keys)) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function boundedString(value, label, maximum = 512) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    LOCAL_PATH_PATTERN.test(value)
  ) {
    throw new TypeError(`${label} must be a bounded path-free string`);
  }
  return value;
}

function optionalString(value, label, maximum = 512) {
  return value === null
    ? null
    : boundedString(value, label, maximum);
}

function optionalEvidenceReference(value, label) {
  if (value === null) {
    return null;
  }
  if (
    typeof value !== "string" ||
    !EVIDENCE_REFERENCE.test(value)
  ) {
    throw new TypeError(`${label} must be an opaque evidence reference`);
  }
  return value;
}

function optionalPublicUrl(value) {
  if (value === null) {
    return null;
  }
  const text = boundedString(value, "public fixture URL", 1_024);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError("public fixture URL is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new TypeError(
      "public fixture URL must be credential-free HTTPS without query or fragment",
    );
  }
  return url.href;
}

function optionalPositiveInteger(value, label) {
  if (value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function normalizeUnique(
  values,
  label,
  maximum,
  { lowercase = true } = {},
) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > maximum
  ) {
    throw new RangeError(`${label} count is invalid`);
  }
  const normalized = values.map((value) => {
    const text = boundedString(value, label, 32);
    return lowercase ? text.toLowerCase() : text;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} must be unique`);
  }
  return normalized;
}

function addGap(gaps, condition, code) {
  if (condition) {
    gaps.push(code);
  }
}

export function evaluateReferenceFormatIntakeWithRegistry(
  intake,
  getCapability,
) {
  const value = plainRecord(intake, "reference format intake");
  exactKeys(value, [
    "schema",
    "candidateFormat",
    "demand",
    "fixture",
    "implementation",
    "coordinates",
    "qualification",
    "privacy",
  ], "reference format intake");
  if (
    value.schema !== BIM_REFERENCE_FORMAT_INTAKE_SCHEMA ||
    typeof getCapability !== "function"
  ) {
    throw new TypeError("reference format intake identity is invalid");
  }
  const candidateFormat = boundedString(
    value.candidateFormat,
    "candidate format",
    32,
  ).toLowerCase();
  const capability = getCapability(candidateFormat);
  if (capability.admitted === true) {
    throw new DOMException(
      `${candidateFormat} is already admitted`,
      "InvalidStateError",
    );
  }

  const demand = plainRecord(value.demand, "format demand");
  exactKeys(demand, [
    "kind",
    "evidenceReference",
    "taskSummary",
    "sourceFormats",
    "requestedCapabilities",
  ], "format demand");
  if (!DEMAND_KINDS.has(demand.kind)) {
    throw new TypeError("format demand kind is invalid");
  }
  const demandReference = optionalEvidenceReference(
    demand.evidenceReference,
    "format demand evidence",
  );
  boundedString(demand.taskSummary, "format task summary", 1_024);
  const sourceFormats = normalizeUnique(
    demand.sourceFormats,
    "workflow source format",
    8,
  );
  for (const format of sourceFormats) {
    getCapability(format);
  }
  if (!sourceFormats.includes(candidateFormat)) {
    throw new TypeError(
      "workflow source formats must include the candidate",
    );
  }
  const requestedCapabilities = normalizeUnique(
    demand.requestedCapabilities,
    "requested capability",
    CAPABILITIES.size,
    { lowercase: false },
  );
  if (
    requestedCapabilities.some(
      (item) => !CAPABILITIES.has(item),
    )
  ) {
    throw new TypeError("requested capability is unsupported");
  }

  const fixture = plainRecord(value.fixture, "format fixture");
  exactKeys(fixture, [
    "availability",
    "url",
    "byteLength",
    "sha256",
    "license",
    "containsCustomerData",
  ], "format fixture");
  if (!FIXTURE_AVAILABILITY.has(fixture.availability)) {
    throw new TypeError("format fixture availability is invalid");
  }
  const fixtureUrl = optionalPublicUrl(fixture.url);
  const fixtureByteLength = optionalPositiveInteger(
    fixture.byteLength,
    "format fixture byte length",
  );
  const fixtureSha256 = fixture.sha256 === null
    ? null
    : boundedString(fixture.sha256, "format fixture SHA-256", 64);
  if (
    fixtureSha256 !== null &&
    !/^[0-9a-f]{64}$/u.test(fixtureSha256)
  ) {
    throw new TypeError("format fixture SHA-256 is invalid");
  }
  const fixtureLicense = optionalString(
    fixture.license,
    "format fixture license",
    128,
  );
  if (
    fixture.containsCustomerData !== false ||
    (
      ![
        "public-test-only",
        "public-redistributable",
      ].includes(fixture.availability) &&
      fixtureUrl !== null
    )
  ) {
    throw new TypeError(
      "format fixture must not expose customer data or a private URL",
    );
  }

  const implementation = plainRecord(
    value.implementation,
    "format implementation",
  );
  exactKeys(implementation, [
    "kind",
    "artifactReference",
    "license",
    "redistribution",
  ], "format implementation");
  if (
    !IMPLEMENTATION_KINDS.has(implementation.kind) ||
    !REDISTRIBUTION_STATES.has(implementation.redistribution)
  ) {
    throw new TypeError("format implementation state is invalid");
  }
  const artifactReference = optionalString(
    implementation.artifactReference,
    "format implementation artifact",
  );
  const implementationLicense = optionalString(
    implementation.license,
    "format implementation license",
    128,
  );

  const coordinates = plainRecord(
    value.coordinates,
    "format coordinates",
  );
  exactKeys(coordinates, [
    "mode",
    "crs",
    "evidenceReference",
    "datumTransformationRequired",
  ], "format coordinates");
  if (!COORDINATE_MODES.has(coordinates.mode)) {
    throw new TypeError("format coordinate mode is invalid");
  }
  const coordinateCrs = optionalString(
    coordinates.crs,
    "format coordinate CRS",
    128,
  );
  const coordinateReference = optionalEvidenceReference(
    coordinates.evidenceReference,
    "format coordinate evidence",
  );
  if (
    coordinates.datumTransformationRequired !== null &&
    typeof coordinates.datumTransformationRequired !== "boolean"
  ) {
    throw new TypeError(
      "format datum transformation requirement is invalid",
    );
  }

  const qualification = plainRecord(
    value.qualification,
    "format qualification",
  );
  exactKeys(qualification, [
    "budgetReference",
    "lifecycleHarness",
    "networkPolicyReference",
    "platformPackaging",
    "reopenEvidence",
  ], "format qualification");
  const budgetReference = optionalEvidenceReference(
    qualification.budgetReference,
    "format budget evidence",
  );
  const networkPolicyReference = optionalEvidenceReference(
    qualification.networkPolicyReference,
    "format network policy evidence",
  );
  for (const field of [
    "lifecycleHarness",
    "platformPackaging",
    "reopenEvidence",
  ]) {
    if (typeof qualification[field] !== "boolean") {
      throw new TypeError(
        `format qualification ${field} must be boolean`,
      );
    }
  }

  const privacy = plainRecord(value.privacy, "format intake privacy");
  exactKeys(privacy, [
    "publicIssueContainsModel",
    "publicIssueContainsCredential",
    "publicIssueContainsAbsolutePath",
  ], "format intake privacy");
  if (Object.values(privacy).some((item) => item !== false)) {
    throw new TypeError(
      "reference format intake cannot carry model data, credentials or absolute paths",
    );
  }

  const publicTestFixtureComplete =
    [
      "public-test-only",
      "public-redistributable",
    ].includes(fixture.availability) &&
    fixtureUrl !== null &&
    fixtureByteLength !== null &&
    fixtureSha256 !== null &&
    fixtureLicense !== null;
  const coordinateProfileComplete =
    coordinateCrs !== null &&
    coordinateReference !== null &&
    coordinates.datumTransformationRequired !== null;
  const gaps = [];
  addGap(
    gaps,
    demand.kind !== "actual-user-task",
    "actual-user-task-evidence",
  );
  addGap(
    gaps,
    demandReference === null,
    "demand-evidence-reference",
  );
  addGap(
    gaps,
    sourceFormats.length < 2,
    "multi-source-workflow-evidence",
  );
  addGap(
    gaps,
    !requestedCapabilities.includes("view"),
    "view-capability-task",
  );
  addGap(
    gaps,
    !publicTestFixtureComplete,
    "public-test-fixture",
  );
  addGap(
    gaps,
    implementation.kind === "unknown" ||
      artifactReference === null ||
      implementationLicense === null,
    "implementation-artifact-and-license",
  );
  addGap(
    gaps,
    implementation.redistribution !== "confirmed",
    "implementation-redistribution-rights",
  );
  addGap(
    gaps,
    budgetReference === null,
    "bounded-budget-evidence",
  );
  addGap(
    gaps,
    qualification.lifecycleHarness !== true,
    "cancellation-and-cleanup-harness",
  );

  if (capability.family === "point-cloud-reference") {
    addGap(
      gaps,
      !["projected-crs", "surveyed-control-points"].includes(
        coordinates.mode,
      ) || !coordinateProfileComplete,
      "point-cloud-coordinate-evidence",
    );
  } else if (capability.family === "geospatial-reference") {
    addGap(
      gaps,
      coordinates.mode !== "geospatial-tileset" ||
        !coordinateProfileComplete,
      "geospatial-coordinate-evidence",
    );
    addGap(
      gaps,
      implementation.kind !== "network-engine" ||
        networkPolicyReference === null,
      "network-engine-policy-evidence",
    );
  } else if (capability.family === "native-authoring-bridge") {
    addGap(
      gaps,
      coordinates.mode !== "native-sdk" ||
        !coordinateProfileComplete,
      "native-coordinate-evidence",
    );
    addGap(
      gaps,
      implementation.kind !== "native-sdk" ||
        qualification.platformPackaging !== true,
      "native-sdk-platform-package",
    );
    addGap(
      gaps,
      qualification.reopenEvidence !== true,
      "native-reopen-qualification",
    );
  } else {
    throw new DOMException(
      `reference format family ${capability.family} has no intake policy`,
      "NotSupportedError",
    );
  }

  return deepFreeze({
    schema: BIM_REFERENCE_FORMAT_TRIAGE_SCHEMA,
    status: gaps.length === 0
      ? "ready-for-qualification"
      : "held-missing-evidence",
    candidateFormat,
    registry: {
      family: capability.family,
      sourceRole: capability.sourceRole,
      admitted: false,
      currentViewCapability: capability.capabilities.view,
    },
    demand: {
      kind: demand.kind,
      evidenceReference: demandReference,
      taskSummaryPresent: true,
      sourceFormats,
      requestedCapabilities,
    },
    fixture: {
      availability: fixture.availability,
      publicEvidenceComplete: publicTestFixtureComplete,
    },
    implementation: {
      kind: implementation.kind,
      redistribution: implementation.redistribution,
    },
    coordinates: {
      mode: coordinates.mode,
      datumTransformationRequired:
        coordinates.datumTransformationRequired,
      evidenceComplete: coordinateProfileComplete,
    },
    qualification: {
      ready: gaps.length === 0,
      missingEvidence: gaps,
    },
    authority: {
      formatAdmission: false,
      semanticAuthority: false,
      nativeWrite: false,
      roundTrip: false,
      spatialAuthority: false,
    },
    decision: {
      nextStep: gaps.length === 0
        ? "open-separate-codec-or-sdk-qualification"
        : "collect-missing-evidence",
      admissionRemainsHeld: true,
      productionClaims: false,
    },
  });
}
