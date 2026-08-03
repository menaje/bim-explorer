import { createHash } from "node:crypto";

import {
  BIM_SOURCE_ARTIFACT_SCHEMA,
} from "@bim-explorer/bim-model-source";
import * as WebIFC from "web-ifc";

export const WEB_IFC_GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v1";

const DEFAULT_LIMITS = Object.freeze({
  maximumSourceBytes: 64 * 1024 * 1024,
  maximumProducts: 100_000,
  maximumGeometryBytes: 256 * 1024 * 1024,
  maximumRangeBytes: 4 * 1024 * 1024,
  maximumRanges: 4_096,
  maximumRelationEntries: 500_000,
  maximumTreeNodes: 200_000,
  maximumMetadataBytes: 64 * 1024 * 1024,
});
const IFC_GLOBAL_ID = /^[0-3][0-9A-Za-z_$]{21}$/u;
const SPATIAL_TYPES = Object.freeze([
  WebIFC.IFCPROJECT,
  WebIFC.IFCSITE,
  WebIFC.IFCBUILDING,
  WebIFC.IFCBUILDINGSTOREY,
  WebIFC.IFCSPACE,
]);

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException(
      "operation aborted",
      "AbortError",
    );
  }
}

function vectorValues(vector) {
  const result = [];
  for (let index = 0; index < vector.size(); index += 1) {
    result.push(vector.get(index));
  }
  return result;
}

function scalar(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "value")
  ) {
    return value.value;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "_representationValue")
  ) {
    return value._representationValue;
  }
  return value;
}

function referenceId(value) {
  const candidate = scalar(value);
  return Number.isSafeInteger(candidate) ? candidate : null;
}

function referenceIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(referenceId)
    .filter((item) => item !== null);
}

function textValue(value) {
  const candidate = scalar(value);
  return typeof candidate === "string" ? candidate : "";
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function entityIds(api, modelId, type, includeInherited = false) {
  return vectorValues(
    api.GetLineIDsWithType(modelId, type, includeInherited),
  );
}

function typeName(api, line) {
  const result = Number.isSafeInteger(line?.type)
    ? api.GetNameFromTypeCode(line.type)
    : "";
  return typeof result === "string" && result.length > 0
    ? result.toUpperCase()
    : "IFCUNKNOWN";
}

function lineSummary(api, modelId, value) {
  const id = referenceId(value);
  if (id === null) {
    return null;
  }
  const line = api.GetLine(modelId, id, false);
  if (line === null || line === undefined) {
    return null;
  }
  return {
    expressId: id,
    globalId: textValue(line.GlobalId),
    ifcClass: typeName(api, line),
    name: textValue(line.Name),
  };
}

function relationIndex(
  api,
  modelId,
  relationType,
  relatedField,
  budget,
) {
  const result = new Map();
  for (const relationId of entityIds(api, modelId, relationType)) {
    const relation = api.GetLine(modelId, relationId, false);
    for (const relatedId of referenceIds(relation?.[relatedField])) {
      budget.entries += 1;
      if (budget.entries > budget.maximum) {
        throw new RangeError(
          "IFC relation index exceeds the configured limit",
        );
      }
      const relations = result.get(relatedId) ?? [];
      relations.push(relation);
      result.set(relatedId, relations);
    }
  }
  return result;
}

function relationIndexes(api, modelId, maximumRelationEntries) {
  const budget = {
    entries: 0,
    maximum: maximumRelationEntries,
  };
  const result = {
    containment: relationIndex(
      api,
      modelId,
      WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
      "RelatedElements",
      budget,
    ),
    types: relationIndex(
      api,
      modelId,
      WebIFC.IFCRELDEFINESBYTYPE,
      "RelatedObjects",
      budget,
    ),
    properties: relationIndex(
      api,
      modelId,
      WebIFC.IFCRELDEFINESBYPROPERTIES,
      "RelatedObjects",
      budget,
    ),
    materials: relationIndex(
      api,
      modelId,
      WebIFC.IFCRELASSOCIATESMATERIAL,
      "RelatedObjects",
      budget,
    ),
    classifications: relationIndex(
      api,
      modelId,
      WebIFC.IFCRELASSOCIATESCLASSIFICATION,
      "RelatedObjects",
      budget,
    ),
  };
  result.relationEntries = budget.entries;
  return result;
}

function relatedLine(api, modelId, relation, field) {
  const id = referenceId(relation?.[field]);
  return id === null ? null : api.GetLine(modelId, id, false);
}

function propertyDefinitions(api, modelId, relations) {
  return relations
    .map((relation) =>
      relatedLine(
        api,
        modelId,
        relation,
        "RelatingPropertyDefinition",
      ))
    .filter(Boolean);
}

function propertySetNames(api, modelId, definitions, typeLine) {
  const values = [];
  for (const definition of definitions) {
    if (Array.isArray(definition.HasProperties)) {
      values.push(textValue(definition.Name));
    }
  }
  for (const propertySetId of referenceIds(typeLine?.HasPropertySets)) {
    const propertySet = api.GetLine(modelId, propertySetId, false);
    values.push(textValue(propertySet?.Name));
  }
  return [...new Set(values.filter(Boolean))].sort();
}

function quantities(api, modelId, definitions) {
  const values = {};
  for (const definition of definitions) {
    for (const quantityId of referenceIds(definition?.Quantities)) {
      const quantity = api.GetLine(modelId, quantityId, false);
      const name = textValue(quantity?.Name);
      const measurement = [
        "LengthValue",
        "AreaValue",
        "VolumeValue",
        "WeightValue",
        "CountValue",
        "TimeValue",
      ]
        .map((field) => scalar(quantity?.[field]))
        .find((item) =>
          typeof item === "number" && Number.isFinite(item));
      if (name && measurement !== undefined) {
        values[name] = measurement;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) =>
      compareText(left, right)),
  );
}

function classifications(api, modelId, relations) {
  return relations
    .map((relation) => {
      const reference = relatedLine(
        api,
        modelId,
        relation,
        "RelatingClassification",
      );
      const source = lineSummary(
        api,
        modelId,
        reference?.ReferencedSource,
      );
      return {
        identification: textValue(reference?.Identification),
        name: textValue(reference?.Name),
        source: source?.name ?? "",
      };
    })
    .filter((value) =>
      value.identification && value.name && value.source)
    .sort((left, right) =>
      compareText(left.identification, right.identification));
}

function semanticRecord(api, modelId, expressId, indexes) {
  const typeRelation = indexes.types.get(expressId)?.[0] ?? null;
  if (
    (indexes.types.get(expressId)?.length ?? 0) > 1 ||
    (indexes.containment.get(expressId)?.length ?? 0) > 1
  ) {
    throw new Error(
      `IFC product ${expressId} has ambiguous type or containment`,
    );
  }
  const typeLine = typeRelation === null
    ? null
    : relatedLine(api, modelId, typeRelation, "RelatingType");
  const definitions = propertyDefinitions(
    api,
    modelId,
    indexes.properties.get(expressId) ?? [],
  );
  return {
    container: lineSummary(
      api,
      modelId,
      indexes.containment.get(expressId)?.[0]
        ?.RelatingStructure,
    ),
    type: typeRelation === null
      ? null
      : lineSummary(api, modelId, typeRelation.RelatingType),
    propertySets: propertySetNames(
      api,
      modelId,
      definitions,
      typeLine,
    ),
    quantities: quantities(api, modelId, definitions),
    materials: (indexes.materials.get(expressId) ?? [])
      .map((relation) =>
        textValue(
          relatedLine(
            api,
            modelId,
            relation,
            "RelatingMaterial",
          )?.Name,
        ))
      .filter(Boolean)
      .sort(),
    classifications: classifications(
      api,
      modelId,
      indexes.classifications.get(expressId) ?? [],
    ),
  };
}

function emptyBounds() {
  return {
    min: [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ],
    max: [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
  };
}

function includePoint(bounds, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
  }
}

function includeBounds(target, source) {
  includePoint(target, source.min);
  includePoint(target, source.max);
}

function roundedBounds(bounds) {
  const round = (value) => Number(value.toFixed(6));
  return {
    min: bounds.min.map(round),
    max: bounds.max.map(round),
  };
}

function ifcWorldPoint(transform, x, y, z) {
  const engineX =
    transform[0] * x +
    transform[4] * y +
    transform[8] * z +
    transform[12];
  const engineY =
    transform[1] * x +
    transform[5] * y +
    transform[9] * z +
    transform[13];
  const engineZ =
    transform[2] * x +
    transform[6] * y +
    transform[10] * z +
    transform[14];
  return [engineX, -engineZ, engineY];
}

function geometryRecord(api, modelId, geometryExpressId) {
  if (
    !Number.isSafeInteger(geometryExpressId) ||
    geometryExpressId <= 0 ||
    geometryExpressId > 0xffff_ffff
  ) {
    throw new RangeError("geometry Express ID is outside uint32");
  }
  const geometry = api.GetGeometry(modelId, geometryExpressId);
  try {
    const vertices = Float32Array.from(
      api.GetVertexArray(
        geometry.GetVertexData(),
        geometry.GetVertexDataSize(),
      ),
    );
    const sourceIndices = api.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize(),
    );
    const indices = Uint32Array.from(sourceIndices);
    if (vertices.length === 0 && indices.length === 0) {
      return null;
    }
    if (
      vertices.length === 0 ||
      vertices.length % 6 !== 0 ||
      !vertices.every(Number.isFinite) ||
      indices.length === 0 ||
      indices.length % 3 !== 0 ||
      !indices.every((index) => index < vertices.length / 6)
    ) {
      throw new Error(
        `geometry ${geometryExpressId} has malformed vertex/index data`,
      );
    }
    return {
      geometryExpressId,
      vertices,
      indices,
    };
  } finally {
    geometry.delete();
  }
}

function encodedRecordByteLength(record) {
  return (
    20 +
    record.vertices.byteLength +
    record.indices.byteLength
  );
}

function encodeGeometryRange(records, rangeId) {
  const headerBytes = 16;
  const recordHeaderBytes = 20;
  const totalBytes = records.reduce(
    (sum, record) => sum + encodedRecordByteLength(record),
    headerBytes,
  );
  const bytes = new Uint8Array(totalBytes);
  bytes.set(new TextEncoder().encode("BEXGEO01"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 1, true);
  view.setUint32(12, records.length, true);
  const slices = new Map();
  let offset = headerBytes;
  for (const record of records) {
    const start = offset;
    view.setUint32(offset, record.geometryExpressId, true);
    view.setUint32(offset + 4, record.vertices.length, true);
    view.setUint32(offset + 8, record.indices.length, true);
    view.setUint32(offset + 12, record.vertices.byteLength, true);
    view.setUint32(offset + 16, record.indices.byteLength, true);
    offset += recordHeaderBytes;
    for (const value of record.vertices) {
      view.setFloat32(offset, value, true);
      offset += Float32Array.BYTES_PER_ELEMENT;
    }
    for (const value of record.indices) {
      view.setUint32(offset, value, true);
      offset += Uint32Array.BYTES_PER_ELEMENT;
    }
    slices.set(record.geometryExpressId, {
      rangeId,
      offset: start,
      byteLength: offset - start,
    });
  }
  return { bytes, slices };
}

function encodeGeometryRanges(
  records,
  {
    maximumGeometryBytes,
    maximumRangeBytes,
    maximumRanges,
  },
) {
  const headerBytes = 16;
  const groups = [];
  let current = [];
  let currentBytes = headerBytes;
  for (const record of records) {
    const recordBytes = encodedRecordByteLength(record);
    if (headerBytes + recordBytes > maximumRangeBytes) {
      throw new RangeError(
        `geometry ${record.geometryExpressId} exceeds ` +
          "the configured range byte limit",
      );
    }
    if (
      current.length > 0 &&
      currentBytes + recordBytes > maximumRangeBytes
    ) {
      groups.push(current);
      current = [];
      currentBytes = headerBytes;
    }
    current.push(record);
    currentBytes += recordBytes;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  if (groups.length === 0) {
    throw new Error("IFC source has no geometry ranges");
  }
  if (groups.length > maximumRanges) {
    throw new RangeError(
      "IFC geometry exceeds the configured range count limit",
    );
  }
  const plannedBytes = groups.reduce(
    (sum, group) =>
      sum +
      headerBytes +
      group.reduce(
        (groupSum, record) =>
          groupSum + encodedRecordByteLength(record),
        0,
      ),
    0,
  );
  if (plannedBytes > maximumGeometryBytes) {
    throw new RangeError(
      "encoded IFC geometry exceeds the configured byte limit",
    );
  }
  const slices = new Map();
  const ranges = groups.map((group, index) => {
    const rangeId = `range:ifc:geometry:${index}`;
    const encoded = encodeGeometryRange(group, rangeId);
    for (const [geometryExpressId, slice] of encoded.slices) {
      slices.set(geometryExpressId, slice);
    }
    return {
      rangeId,
      mediaType: WEB_IFC_GEOMETRY_MEDIA_TYPE,
      sha256: createHash("sha256")
        .update(encoded.bytes)
        .digest("hex"),
      bytes: encoded.bytes,
    };
  });
  return {
    ranges,
    slices,
    totalBytes: plannedBytes,
    largestRangeBytes: Math.max(
      ...ranges.map((range) => range.bytes.byteLength),
    ),
  };
}

function buildTree(
  api,
  modelId,
  entities,
  indexes,
  maximumTreeNodes,
) {
  const nodes = [];
  const parentById = new Map();
  for (
    const relationId of entityIds(api, modelId, WebIFC.IFCRELAGGREGATES)
  ) {
    const relation = api.GetLine(modelId, relationId, false);
    const parentId = referenceId(relation?.RelatingObject);
    for (const childId of referenceIds(relation?.RelatedObjects)) {
      if (parentId !== null) {
        parentById.set(childId, parentId);
      }
    }
  }
  for (const type of SPATIAL_TYPES) {
    for (const expressId of entityIds(api, modelId, type)) {
      const line = api.GetLine(modelId, expressId, false);
      const globalId = textValue(line?.GlobalId);
      if (!IFC_GLOBAL_ID.test(globalId)) {
        throw new Error(
          `spatial node ${expressId} has no valid GlobalId`,
        );
      }
      nodes.push({
        expressId,
        globalId,
        ifcClass: typeName(api, line),
        name: textValue(line?.Name) || `#${expressId}`,
        kind: "spatial",
        parentExpressId: parentById.get(expressId) ?? null,
      });
    }
  }
  for (const entity of entities) {
    const containerId = referenceId(
      indexes.containment.get(entity.expressId)?.[0]
        ?.RelatingStructure,
    );
    nodes.push({
      expressId: entity.expressId,
      globalId: entity.globalId,
      ifcClass: entity.ifcClass,
      name: entity.name,
      kind: "product",
      parentExpressId: containerId,
    });
  }
  nodes.sort((left, right) => left.expressId - right.expressId);
  if (nodes.length > maximumTreeNodes) {
    throw new RangeError(
      "IFC spatial tree exceeds the configured node limit",
    );
  }
  const known = new Set(nodes.map((node) => node.expressId));
  for (const node of nodes) {
    if (
      node.parentExpressId !== null &&
      !known.has(node.parentExpressId)
    ) {
      throw new RangeError(
        `IFC tree parent ${node.parentExpressId} is unsupported`,
      );
    }
  }
  return {
    roots: nodes
      .filter((node) => node.parentExpressId === null)
      .map((node) => node.expressId),
    nodes,
  };
}

export async function createWebIfcSourceArtifact(sourceBytes, {
  documentId,
  profile = "unspecified",
  signal,
  maximumSourceBytes = DEFAULT_LIMITS.maximumSourceBytes,
  maximumProducts = DEFAULT_LIMITS.maximumProducts,
  maximumGeometryBytes = DEFAULT_LIMITS.maximumGeometryBytes,
  maximumRangeBytes = DEFAULT_LIMITS.maximumRangeBytes,
  maximumRanges = DEFAULT_LIMITS.maximumRanges,
  maximumRelationEntries = DEFAULT_LIMITS.maximumRelationEntries,
  maximumTreeNodes = DEFAULT_LIMITS.maximumTreeNodes,
  maximumMetadataBytes = DEFAULT_LIMITS.maximumMetadataBytes,
} = {}) {
  for (const [label, value] of Object.entries({
    maximumSourceBytes,
    maximumProducts,
    maximumGeometryBytes,
    maximumRangeBytes,
    maximumRanges,
    maximumRelationEntries,
    maximumTreeNodes,
    maximumMetadataBytes,
  })) {
    positiveInteger(value, label);
  }
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0) {
    throw new TypeError("sourceBytes must be a non-empty Uint8Array");
  }
  if (sourceBytes.byteLength > maximumSourceBytes) {
    throw new RangeError("IFC source exceeds the configured byte limit");
  }
  if (typeof profile !== "string" || profile.length === 0) {
    throw new TypeError("profile must be a non-empty string");
  }
  const bytes = Uint8Array.from(sourceBytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const resolvedDocumentId =
    documentId ?? `document:ifc:${sha256.slice(0, 24)}`;
  const api = new WebIFC.IfcAPI();
  let initialized = false;
  let modelId = null;
  let modelClosed = false;
  let engineDisposed = false;
  let artifact;

  aborted(signal);
  await api.Init();
  initialized = true;
  try {
    aborted(signal);
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    const indexes = relationIndexes(
      api,
      modelId,
      maximumRelationEntries,
    );
    const uniqueGeometry = new Map();
    const emptyGeometryIds = new Set();
    const entities = [];
    const modelBounds = emptyBounds();
    let primitiveCount = 0;
    let placementCount = 0;
    let skippedEmptyGeometries = 0;
    let instancedVertices = 0;
    let triangleCount = 0;
    let encodedGeometryBytes = 16;

    api.StreamAllMeshes(modelId, (mesh) => {
      aborted(signal);
      if (entities.length >= maximumProducts) {
        throw new RangeError(
          "IFC geometry products exceed the configured limit",
        );
      }
      const line = api.GetLine(modelId, mesh.expressID, false);
      const globalId = textValue(line?.GlobalId);
      if (!IFC_GLOBAL_ID.test(globalId)) {
        throw new Error(
          `geometry product ${mesh.expressID} has no valid GlobalId`,
        );
      }
      const primitives = [];
      const diagnostics = [];
      const productBounds = emptyBounds();
      let productTriangles = 0;
      for (
        let primitiveIndex = 0;
        primitiveIndex < mesh.geometries.size();
        primitiveIndex += 1
      ) {
        const placed = mesh.geometries.get(primitiveIndex);
        const geometryExpressId = placed.geometryExpressID;
        placementCount += 1;
        if (emptyGeometryIds.has(geometryExpressId)) {
          skippedEmptyGeometries += 1;
          diagnostics.push({
            code: "empty-tessellation",
            geometryExpressId,
          });
          continue;
        }
        let record = uniqueGeometry.get(geometryExpressId);
        if (record === undefined) {
          record = geometryRecord(api, modelId, geometryExpressId);
          if (record === null) {
            emptyGeometryIds.add(geometryExpressId);
            skippedEmptyGeometries += 1;
            diagnostics.push({
              code: "empty-tessellation",
              geometryExpressId,
            });
            continue;
          }
          encodedGeometryBytes +=
            20 +
            record.vertices.byteLength +
            record.indices.byteLength;
          if (encodedGeometryBytes > maximumGeometryBytes) {
            throw new RangeError(
              "encoded IFC geometry exceeds the configured byte limit",
            );
          }
          uniqueGeometry.set(geometryExpressId, record);
        }
        const transform = Array.from(placed.flatTransformation);
        if (
          transform.length !== 16 ||
          !transform.every(Number.isFinite)
        ) {
          throw new Error(
            `geometry product ${mesh.expressID} has an invalid transform`,
          );
        }
        const primitiveBounds = emptyBounds();
        for (
          let vertexIndex = 0;
          vertexIndex < record.vertices.length;
          vertexIndex += 6
        ) {
          includePoint(
            primitiveBounds,
            ifcWorldPoint(
              transform,
              record.vertices[vertexIndex],
              record.vertices[vertexIndex + 1],
              record.vertices[vertexIndex + 2],
            ),
          );
        }
        includeBounds(productBounds, primitiveBounds);
        const triangles = record.indices.length / 3;
        productTriangles += triangles;
        triangleCount += triangles;
        instancedVertices += record.vertices.length / 6;
        primitiveCount += 1;
        primitives.push({
          geometryExpressId,
          vertexCount: record.vertices.length / 6,
          indexCount: record.indices.length,
          triangles,
          transform,
          color: [
            Number(placed.color?.x ?? 1),
            Number(placed.color?.y ?? 1),
            Number(placed.color?.z ?? 1),
            Number(placed.color?.w ?? 1),
          ],
        });
      }
      const renderable = primitives.length > 0;
      if (renderable) {
        includeBounds(modelBounds, productBounds);
      }
      entities.push({
        expressId: mesh.expressID,
        globalId,
        ifcClass: typeName(api, line),
        name: textValue(line?.Name) || `#${mesh.expressID}`,
        tag: textValue(line?.Tag),
        renderable,
        triangles: productTriangles,
        bounds: renderable ? roundedBounds(productBounds) : null,
        primitives,
        diagnostics,
        semantics: semanticRecord(
          api,
          modelId,
          mesh.expressID,
          indexes,
        ),
      });
    });
    aborted(signal);
    entities.sort((left, right) => left.expressId - right.expressId);
    const records = [...uniqueGeometry.values()]
      .sort((left, right) =>
        left.geometryExpressId - right.geometryExpressId);
    if (records.length === 0 || entities.length === 0) {
      throw new Error("IFC source has no renderable geometry products");
    }
    const encoded = encodeGeometryRanges(
      records,
      {
        maximumGeometryBytes,
        maximumRangeBytes,
        maximumRanges,
      },
    );
    for (const entity of entities) {
      for (const primitive of entity.primitives) {
        primitive.slice = encoded.slices.get(
          primitive.geometryExpressId,
        );
      }
    }
    const tree = buildTree(
      api,
      modelId,
      entities,
      indexes,
      maximumTreeNodes,
    );
    const metadataByteLength = new TextEncoder().encode(
      JSON.stringify({ tree, entities }),
    ).byteLength;
    if (metadataByteLength > maximumMetadataBytes) {
      throw new RangeError(
        "IFC source metadata exceeds the configured byte limit",
      );
    }
    artifact = {
      schema: BIM_SOURCE_ARTIFACT_SCHEMA,
      source: {
        documentId: resolvedDocumentId,
        byteLength: bytes.byteLength,
        sha256,
        ifcSchema: api.GetModelSchema(modelId),
        profile,
      },
      adapter: {
        id: "web-ifc",
        version: "0.0.77",
        backend: "node-wasm-source-artifact",
        license: "MPL-2.0",
        cleanup: {
          modelClosed: false,
          engineDisposed: false,
        },
      },
      coordinateSystem: {
        storage: "web-ifc-y-up",
        source: "ifc-world-z-up",
        sourceFromStorage: [
          1, 0, 0, 0,
          0, 0, 1, 0,
          0, -1, 0, 0,
          0, 0, 0, 1,
        ],
      },
      coverage: {
        supported: [
          "geometry-products",
          "globalid-expressid-identity",
          "containment",
          "type-occurrence",
          "property-set-names",
          "quantities",
          "direct-material-name",
          "classification-reference",
          "shared-geometry-instance",
          "non-renderable-product-diagnostic",
        ],
        unsupported: [
          "write-mutation",
          "full-ifc-object-graph",
          "complex-material-graph",
          "connection-relation-index",
          "georeferencing-map-conversion",
        ],
      },
      tree,
      geometry: {
        products: entities.length,
        renderableProducts: entities.filter(
          (entity) => entity.renderable,
        ).length,
        nonRenderableProducts: entities.filter(
          (entity) => !entity.renderable,
        ).length,
        placements: placementCount,
        primitives: primitiveCount,
        uniqueGeometries: records.length,
        emptyUniqueGeometries: emptyGeometryIds.size,
        skippedEmptyGeometries,
        vertices: records.reduce(
          (sum, record) => sum + record.vertices.length / 6,
          0,
        ),
        instancedVertices,
        triangles: triangleCount,
        bounds: roundedBounds(modelBounds),
      },
      entities,
      ranges: encoded.ranges,
      resources: {
        limits: {
          maximumSourceBytes,
          maximumProducts,
          maximumGeometryBytes,
          maximumRangeBytes,
          maximumRanges,
          maximumRelationEntries,
          maximumTreeNodes,
          maximumMetadataBytes,
        },
        observed: {
          sourceBytes: bytes.byteLength,
          geometryBytes: encoded.totalBytes,
          ranges: encoded.ranges.length,
          largestRangeBytes: encoded.largestRangeBytes,
          metadataBytes: metadataByteLength,
          products: entities.length,
          relationEntries: indexes.relationEntries,
          treeNodes: tree.nodes.length,
        },
      },
    };
  } finally {
    if (modelId !== null) {
      api.CloseModel(modelId);
      modelClosed = true;
    }
    if (initialized) {
      api.Dispose();
      engineDisposed = true;
    }
  }
  artifact.adapter.cleanup = {
    modelClosed,
    engineDisposed,
  };
  return artifact;
}
