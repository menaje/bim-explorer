import {
  IFC_GLOBAL_ID,
  SOURCE_FINGERPRINT,
  SOURCE_PROTOCOL,
  assertSourceBinding,
  boundedString,
  deepFreeze,
  identityProjection,
  plainRecord,
  sha256Identifier,
  sourceContext,
} from "./common.mjs";
import {
  createBsddReference,
} from "./bsdd.mjs";
import {
  parseBoundedXml,
  xmlChild,
  xmlChildren,
  xmlChildText,
} from "./xml.mjs";

export const IDS_DOCUMENT_SCHEMA =
  "bim-explorer-ids-document/0.1";
export const IDS_RESULT_SCHEMA =
  "bim-explorer-ids-result/0.1";
export const IDS_RESULT_RESOLUTION_SCHEMA =
  "bim-explorer-ids-result-resolution/0.1";
export const IDS_PROFILE = "IDS 1.0";

const IDS_NAMESPACE =
  "http://standards.buildingsmart.org/IDS";
const FACET_NAMES = new Set([
  "entity",
  "partOf",
  "classification",
  "attribute",
  "property",
  "material",
]);
const RESULT_STATUS = new Set([
  "pass",
  "fail",
  "not-evaluated",
]);
const PROVENANCE_KIND = new Set([
  "explorer",
  "external",
  "spatial",
]);
const DEFAULT_LIMITS = Object.freeze({
  maximumBytes: 2 * 1024 * 1024,
  maximumSpecifications: 1_000,
  maximumFacetsPerSection: 1_000,
  maximumResultEntities: 20_000,
});

function limitsFrom(overrides = {}) {
  plainRecord(overrides, "IDS limits");
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(`IDS limit ${key} is unsupported`);
    }
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(
        `IDS limits.${key} must be a positive safe integer`,
      );
    }
  }
  return Object.freeze(limits);
}

function textBytes(input, maximum) {
  const bytes = input instanceof Uint8Array
    ? input
    : typeof input === "string"
      ? new TextEncoder().encode(input)
      : null;
  if (
    bytes === null ||
    bytes.byteLength === 0 ||
    bytes.byteLength > maximum
  ) {
    throw new RangeError(
      "IDS document must be non-empty bounded UTF-8",
    );
  }
  return bytes;
}

function compactElement(node, depth = 0) {
  if (depth > 16) {
    throw new RangeError(
      "IDS facet content exceeds its exploration depth",
    );
  }
  return {
    name: node.name,
    attributes: { ...node.attributes },
    value: node.text.trim() || null,
    children: node.children.map((child) =>
      compactElement(child, depth + 1)),
  };
}

function facets(section, label, limits) {
  if (section === null) {
    return [];
  }
  const nodes = section.children.filter((node) =>
    FACET_NAMES.has(node.name));
  if (nodes.length > limits.maximumFacetsPerSection) {
    throw new RangeError(`${label} exceeds its facet limit`);
  }
  return nodes.map((node, index) => ({
    index,
    kind: node.name,
    cardinality:
      node.attributes.cardinality ?? "required",
    instructions: node.attributes.instructions ?? null,
    uri: node.attributes.uri ?? null,
    content: compactElement(node),
  }));
}

function collectUriReferences(node, references, seen) {
  if (typeof node.attributes.uri === "string") {
    const key = [
      node.attributes.uri,
      node.name,
    ].join("\u001f");
    if (!seen.has(key)) {
      seen.add(key);
      references.push(createBsddReference({
        uri: node.attributes.uri,
        kind: node.name === "property"
          ? "property"
          : node.name === "classification"
            ? "classification"
            : null,
      }));
    }
  }
  for (const child of node.children) {
    collectUriReferences(child, references, seen);
  }
}

function infoValue(info, name) {
  return xmlChildText(info, name) ?? null;
}

export async function importIdsDocument(
  input,
  {
    snapshot,
    limits: limitOverrides = {},
  },
) {
  const source = sourceContext(snapshot);
  const limits = limitsFrom(limitOverrides);
  const bytes = textBytes(input, limits.maximumBytes);
  const xml = parseBoundedXml(bytes, {
    label: "IDS document",
    limits: {
      maximumBytes: limits.maximumBytes,
    },
  });
  if (
    xml.root.name !== "ids" ||
    xml.root.namespace !== IDS_NAMESPACE
  ) {
    throw new TypeError(
      "IDS document root must use the IDS 1.0 namespace",
    );
  }
  const info = xmlChild(xml.root, "info");
  const specificationsRoot = xmlChild(
    xml.root,
    "specifications",
  );
  if (info === null || specificationsRoot === null) {
    throw new TypeError(
      "IDS document info and specifications are required",
    );
  }
  const specificationNodes = xmlChildren(
    specificationsRoot,
    "specification",
  );
  if (
    specificationNodes.length === 0 ||
    specificationNodes.length >
      limits.maximumSpecifications
  ) {
    throw new RangeError(
      "IDS specification count is outside its bound",
    );
  }
  const specifications = specificationNodes.map(
    (node, index) => {
      const name = boundedString(
        node.attributes.name,
        `IDS specification[${index}].name`,
        { maximum: 4_096 },
      );
      const ifcVersions = boundedString(
        node.attributes.ifcVersion,
        `IDS specification[${index}].ifcVersion`,
        { maximum: 256 },
      ).split(/\s+/u);
      if (
        ifcVersions.some((version) =>
          !["IFC2X3", "IFC4", "IFC4X3_ADD2"].includes(version))
      ) {
        throw new TypeError(
          `IDS specification[${index}] IFC version is unsupported`,
        );
      }
      return {
        index,
        identifier: node.attributes.identifier ?? null,
        name,
        ifcVersions,
        description: node.attributes.description ?? null,
        instructions: node.attributes.instructions ?? null,
        applicability: {
          minOccurs:
            xmlChild(node, "applicability")
              ?.attributes.minOccurs ?? "1",
          maxOccurs:
            xmlChild(node, "applicability")
              ?.attributes.maxOccurs ?? "unbounded",
          facets: facets(
            xmlChild(node, "applicability"),
            `IDS specification[${index}] applicability`,
            limits,
          ),
        },
        requirements: facets(
          xmlChild(node, "requirements"),
          `IDS specification[${index}] requirements`,
          limits,
        ),
      };
    },
  );
  const vocabularyReferences = [];
  collectUriReferences(
    xml.root,
    vocabularyReferences,
    new Set(),
  );
  return deepFreeze({
    schema: IDS_DOCUMENT_SCHEMA,
    profile: IDS_PROFILE,
    documentId: await sha256Identifier(bytes),
    source: source.binding,
    info: {
      title: xmlChildText(info, "title", {
        required: true,
      }),
      copyright: infoValue(info, "copyright"),
      version: infoValue(info, "version"),
      description: infoValue(info, "description"),
      author: infoValue(info, "author"),
      date: infoValue(info, "date"),
      purpose: infoValue(info, "purpose"),
      milestone: infoValue(info, "milestone"),
    },
    specifications,
    vocabularyReferences,
    receipt: {
      byteLength: bytes.byteLength,
      nodes: xml.nodeCount,
      specifications: specifications.length,
      vocabularyReferences: vocabularyReferences.length,
      networkRequests: 0,
    },
    validation: {
      schemaValidated: false,
      evaluatesIfcRequirements: false,
      role: "read-only-document-exploration",
    },
    authority: {
      sourceMutation: false,
      acceptance: false,
      publish: false,
      spatialRevision: false,
    },
  });
}

function resultSource(value) {
  const source = plainRecord(value, "IDS result source");
  if (
    source.protocolVersion !== SOURCE_PROTOCOL ||
    !SOURCE_FINGERPRINT.test(source.fingerprint ?? "") ||
    source.revisionId !==
      `source-snapshot:${source.fingerprint}`
  ) {
    throw new TypeError("IDS result source identity is invalid");
  }
  return {
    protocolVersion: SOURCE_PROTOCOL,
    fingerprint: source.fingerprint,
    revisionId: source.revisionId,
  };
}

function resultProvenance(value) {
  const provenance = plainRecord(
    value,
    "IDS result provenance",
  );
  if (!PROVENANCE_KIND.has(provenance.kind)) {
    throw new TypeError("IDS result provenance kind is invalid");
  }
  const producer = boundedString(
    provenance.producer,
    "IDS result provenance producer",
    { maximum: 512 },
  );
  if (
    provenance.kind === "spatial" &&
    (
      typeof provenance.spatialRevisionId !== "string" ||
      provenance.spatialRevisionId.length === 0
    )
  ) {
    throw new TypeError(
      "Spatial IDS result requires a Spatial revision ID",
    );
  }
  if (
    provenance.kind === "explorer" &&
    (
      typeof provenance.validatorProfile !== "string" ||
      provenance.validatorProfile.length === 0
    )
  ) {
    throw new TypeError(
      "Explorer IDS result requires a validator profile",
    );
  }
  return {
    kind: provenance.kind,
    producer,
    runId: provenance.runId ?? null,
    validatorProfile:
      provenance.validatorProfile ?? null,
    spatialRevisionId:
      provenance.spatialRevisionId ?? null,
  };
}

function resultEntity(value, label) {
  const entity = plainRecord(value, label);
  if (!RESULT_STATUS.has(entity.status)) {
    throw new TypeError(`${label}.status is invalid`);
  }
  const globalId = entity.globalId ?? null;
  if (globalId !== null && !IFC_GLOBAL_ID.test(globalId)) {
    throw new TypeError(`${label}.globalId is invalid`);
  }
  return {
    globalId,
    status: entity.status,
    requirementId: entity.requirementId ?? null,
    facet: entity.facet ?? null,
    message: entity.message ?? null,
  };
}

export function importIdsResult(
  value,
  {
    maximumEntities = DEFAULT_LIMITS.maximumResultEntities,
  } = {},
) {
  const input = plainRecord(value, "IDS result");
  if (input.schema !== IDS_RESULT_SCHEMA) {
    throw new TypeError("IDS result schema is invalid");
  }
  if (
    !Number.isSafeInteger(maximumEntities) ||
    maximumEntities <= 0
  ) {
    throw new RangeError(
      "IDS result maximumEntities is invalid",
    );
  }
  const specifications = input.specifications;
  if (
    !Array.isArray(specifications) ||
    specifications.length === 0 ||
    specifications.length >
      DEFAULT_LIMITS.maximumSpecifications
  ) {
    throw new RangeError(
      "IDS result specification count is outside its bound",
    );
  }
  let entityCount = 0;
  const ids = new Set();
  const normalized = specifications.map(
    (specificationValue, index) => {
      const specification = plainRecord(
        specificationValue,
        `IDS result specification[${index}]`,
      );
      const specificationId = boundedString(
        specification.specificationId,
        `IDS result specification[${index}].specificationId`,
        { maximum: 512 },
      );
      if (ids.has(specificationId)) {
        throw new TypeError(
          "IDS result specification IDs must be unique",
        );
      }
      ids.add(specificationId);
      if (!RESULT_STATUS.has(specification.status)) {
        throw new TypeError(
          `IDS result specification[${index}].status is invalid`,
        );
      }
      if (!Array.isArray(specification.entities)) {
        throw new TypeError(
          `IDS result specification[${index}].entities must be a list`,
        );
      }
      entityCount += specification.entities.length;
      if (entityCount > maximumEntities) {
        throw new RangeError(
          "IDS result entities exceed their bound",
        );
      }
      return {
        specificationId,
        name: specification.name ?? specificationId,
        status: specification.status,
        entities: specification.entities.map(
          (entity, entityIndex) => resultEntity(
            entity,
            `IDS result specification[${index}]` +
              `.entities[${entityIndex}]`,
          ),
        ),
      };
    },
  );
  return deepFreeze({
    schema: IDS_RESULT_SCHEMA,
    resultId: boundedString(
      input.resultId,
      "IDS result resultId",
      { maximum: 512 },
    ),
    idsDocumentId: boundedString(
      input.idsDocumentId,
      "IDS result idsDocumentId",
      { maximum: 128 },
    ),
    source: resultSource(input.source),
    provenance: resultProvenance(input.provenance),
    specifications: normalized,
    receipt: {
      specifications: normalized.length,
      entities: entityCount,
    },
    authority: {
      sourceMutation: false,
      acceptance: false,
      publish: false,
      spatialRevision:
        input.provenance.kind === "spatial"
          ? "reference-only"
          : false,
    },
  });
}

export function resolveIdsResult({
  result,
  document,
  snapshot,
  specificationId,
}) {
  const context = assertSourceBinding(result?.source, snapshot);
  if (
    document?.schema !== IDS_DOCUMENT_SCHEMA ||
    result.idsDocumentId !== document.documentId
  ) {
    throw new DOMException(
      "IDS result does not match the IDS document",
      "InvalidStateError",
    );
  }
  assertSourceBinding(document.source, snapshot);
  const specification = result.specifications.find(
    (candidate) =>
      candidate.specificationId === specificationId,
  );
  if (specification === undefined) {
    throw new RangeError(
      "IDS result specification does not exist",
    );
  }
  const diagnostics = [];
  const failures = [];
  const selectedByGlobalId = new Map();
  const counts = {
    pass: 0,
    fail: 0,
    "not-evaluated": 0,
  };
  for (
    let index = 0;
    index < specification.entities.length;
    index += 1
  ) {
    const evaluation = specification.entities[index];
    counts[evaluation.status] += 1;
    if (evaluation.status !== "fail") {
      continue;
    }
    if (evaluation.globalId === null) {
      diagnostics.push({
        code: "failing-entity-global-id-missing",
        index,
        requirementId: evaluation.requirementId,
      });
      failures.push({
        ...evaluation,
        entity: null,
      });
      continue;
    }
    const entity = context.byGlobalId.get(evaluation.globalId);
    if (entity === undefined) {
      diagnostics.push({
        code: "failing-entity-global-id-not-found",
        index,
        globalId: evaluation.globalId,
        requirementId: evaluation.requirementId,
      });
      failures.push({
        ...evaluation,
        entity: null,
      });
      continue;
    }
    const projection = identityProjection(entity);
    if (projection.renderId === null) {
      diagnostics.push({
        code: "failing-entity-not-renderable",
        index,
        globalId: evaluation.globalId,
        expressId: projection.expressId,
      });
    }
    selectedByGlobalId.set(
      evaluation.globalId,
      projection,
    );
    failures.push({
      ...evaluation,
      entity: projection,
    });
  }
  return deepFreeze({
    schema: IDS_RESULT_RESOLUTION_SCHEMA,
    profile: IDS_PROFILE,
    resultId: result.resultId,
    idsDocumentId: document.documentId,
    source: context.binding,
    provenance: structuredClone(result.provenance),
    specification: {
      specificationId: specification.specificationId,
      name: specification.name,
      status: specification.status,
      counts,
    },
    failures,
    selection: [...selectedByGlobalId.values()],
    diagnostics,
    completeResolution: diagnostics.every(
      (diagnostic) =>
        diagnostic.code !==
          "failing-entity-global-id-missing" &&
        diagnostic.code !==
          "failing-entity-global-id-not-found",
    ),
    authority: {
      sourceMutation: false,
      acceptance: false,
      publish: false,
      spatialRevision:
        result.provenance.kind === "spatial"
          ? "reference-only"
          : false,
    },
  });
}
