import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPABILITY_NAMES,
  REPORT_SCHEMA,
  finalizeReport,
} from "@bim-explorer/ifc-engine-contract";
import * as WebIFC from "web-ifc";

export const WEB_IFC_NEGATIVE_RESULT_SCHEMA =
  "bim-explorer-ifc-negative-result/0.1";

export class WebIfcInspectionError extends Error {
  constructor(receipt) {
    super("web-ifc rejected the IFC source");
    this.name = "WebIfcInspectionError";
    this.code = "BIM_EXPLORER_WEB_IFC_REJECTED";
    this.receipt = Object.freeze(receipt);
  }
}

const ENTITY_TYPES = Object.freeze({
  IfcProject: WebIFC.IFCPROJECT,
  IfcSite: WebIFC.IFCSITE,
  IfcBuilding: WebIFC.IFCBUILDING,
  IfcBuildingStorey: WebIFC.IFCBUILDINGSTOREY,
  IfcSpace: WebIFC.IFCSPACE,
  IfcWall: WebIFC.IFCWALL,
  IfcWallType: WebIFC.IFCWALLTYPE,
  IfcPropertySet: WebIFC.IFCPROPERTYSET,
  IfcElementQuantity: WebIFC.IFCELEMENTQUANTITY,
  IfcMaterial: WebIFC.IFCMATERIAL,
  IfcClassification: WebIFC.IFCCLASSIFICATION,
  IfcClassificationReference: WebIFC.IFCCLASSIFICATIONREFERENCE,
  IfcRepresentationMap: WebIFC.IFCREPRESENTATIONMAP,
  IfcMappedItem: WebIFC.IFCMAPPEDITEM,
});

const RELATION_TYPES = Object.freeze({
  IfcRelAggregates: WebIFC.IFCRELAGGREGATES,
  IfcRelContainedInSpatialStructure:
    WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IfcRelDefinesByType: WebIFC.IFCRELDEFINESBYTYPE,
  IfcRelDefinesByProperties: WebIFC.IFCRELDEFINESBYPROPERTIES,
  IfcRelAssociatesMaterial: WebIFC.IFCRELASSOCIATESMATERIAL,
  IfcRelAssociatesClassification:
    WebIFC.IFCRELASSOCIATESCLASSIFICATION,
});

function parseInputArguments(values) {
  if (values.length % 2 !== 0) {
    throw new TypeError(
      "usage: node adapters/web-ifc/src/inspect.mjs --input <source.ifc> " +
        "--fixture-id <id>",
    );
  }
  const options = {
    fixtureId: null,
    input: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (name === "--input" && value) {
      options.input = path.resolve(value);
    } else if (
      name === "--fixture-id" &&
      /^[a-z0-9][a-z0-9-]+$/u.test(value)
    ) {
      options.fixtureId = value;
    } else {
      throw new TypeError(`invalid web-ifc adapter argument ${name}`);
    }
  }
  if (options.input === null || options.fixtureId === null) {
    throw new TypeError("--input and --fixture-id are required");
  }
  return options;
}

function vectorValues(vector) {
  const values = [];
  for (let index = 0; index < vector.size(); index += 1) {
    values.push(vector.get(index));
  }
  return values;
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
  if (!Number.isSafeInteger(type)) {
    return [];
  }
  return vectorValues(
    api.GetLineIDsWithType(modelId, type, includeInherited),
  );
}

function firstLine(api, modelId, type) {
  const id = entityIds(api, modelId, type)[0];
  return Number.isSafeInteger(id)
    ? api.GetLine(modelId, id, false)
    : null;
}

function countEntities(api, modelId, types) {
  return Object.fromEntries(
    Object.entries(types).map(([name, type]) => [
      name,
      entityIds(api, modelId, type).length,
    ]),
  );
}

function lineReferences(line, field) {
  return referenceIds(line?.[field]);
}

function findRelationFor(api, modelId, relationType, field, expressId) {
  return relationsFor(
    api,
    modelId,
    relationType,
    field,
    expressId,
  )[0] ?? null;
}

function relationsFor(api, modelId, relationType, field, expressId) {
  const matches = [];
  for (const relationId of entityIds(api, modelId, relationType)) {
    const relation = api.GetLine(modelId, relationId, false);
    if (lineReferences(relation, field).includes(expressId)) {
      matches.push(relation);
    }
  }
  return matches;
}

function relatedLine(api, modelId, relation, field) {
  const id = referenceId(relation?.[field]);
  return id === null ? null : api.GetLine(modelId, id, false);
}

function propertyDefinitions(api, modelId, wallId) {
  return relationsFor(
    api,
    modelId,
    WebIFC.IFCRELDEFINESBYPROPERTIES,
    "RelatedObjects",
    wallId,
  )
    .map((relation) => relatedLine(
      api,
      modelId,
      relation,
      "RelatingPropertyDefinition",
    ))
    .filter(Boolean);
}

function propertySetNames(api, modelId, wallId, wallType) {
  const names = [];
  for (const definition of propertyDefinitions(api, modelId, wallId)) {
    if (Array.isArray(definition.HasProperties)) {
      names.push(textValue(definition.Name));
    }
  }
  for (const propertySetId of referenceIds(wallType?.HasPropertySets)) {
    const propertySet = api.GetLine(modelId, propertySetId, false);
    names.push(textValue(propertySet?.Name));
  }
  return [...new Set(names.filter(Boolean))].sort();
}

function quantityValues(api, modelId, wallId) {
  const quantities = {};
  for (const definition of propertyDefinitions(api, modelId, wallId)) {
    if (!Array.isArray(definition.Quantities)) {
      continue;
    }
    for (const quantityId of referenceIds(definition.Quantities)) {
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
        .find((value) => typeof value === "number" && Number.isFinite(value));
      if (name && measurement !== undefined) {
        quantities[name] = measurement;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(quantities).sort(([left], [right]) =>
      compareText(left, right)),
  );
}

function classifications(api, modelId, wallId) {
  const values = relationsFor(
    api,
    modelId,
    WebIFC.IFCRELASSOCIATESCLASSIFICATION,
    "RelatedObjects",
    wallId,
  ).map((relation) => {
    const reference = relatedLine(
      api,
      modelId,
      relation,
      "RelatingClassification",
    );
    const sourceId = referenceId(reference?.ReferencedSource);
    const source = sourceId === null
      ? null
      : api.GetLine(modelId, sourceId, false);
    return {
      identification: textValue(reference?.Identification),
      name: textValue(reference?.Name),
      source: textValue(source?.Name),
    };
  });
  return values
    .filter((value) =>
      value.identification && value.name && value.source)
    .sort((left, right) =>
      compareText(left.identification, right.identification));
}

function expressIdDiagnostics(api, modelId, rootIds) {
  const pairs = rootIds
    .map((expressId) => {
      const line = api.GetLine(modelId, expressId, false);
      return [textValue(line?.GlobalId), expressId];
    })
    .sort(([leftGlobalId, leftExpressId], [rightGlobalId, rightExpressId]) =>
      compareText(leftGlobalId, rightGlobalId) ||
      leftExpressId - rightExpressId);
  return {
    count: rootIds.length,
    duplicates: rootIds.length - new Set(rootIds).size,
    minimum: Math.min(...rootIds),
    maximum: Math.max(...rootIds),
    globalIdMapSha256: createHash("sha256")
      .update(JSON.stringify(pairs))
      .digest("hex"),
  };
}

function representationSharing(api, modelId) {
  const representationMapIds = entityIds(
    api,
    modelId,
    WebIFC.IFCREPRESENTATIONMAP,
  );
  const mappedItemIds = entityIds(api, modelId, WebIFC.IFCMAPPEDITEM);
  const mappedItemIdSet = new Set(mappedItemIds);
  const mappingSources = new Set();
  for (const mappedItemId of mappedItemIds) {
    const mappedItem = api.GetLine(modelId, mappedItemId, false);
    const sourceId = referenceId(mappedItem?.MappingSource);
    if (sourceId !== null) {
      mappingSources.add(sourceId);
    }
  }
  let productsUsingMappedItems = 0;
  for (const wallId of entityIds(api, modelId, WebIFC.IFCWALL)) {
    const wall = api.GetLine(modelId, wallId, false);
    const productShapeId = referenceId(wall?.Representation);
    const productShape = productShapeId === null
      ? null
      : api.GetLine(modelId, productShapeId, false);
    const usesMappedItem = referenceIds(productShape?.Representations)
      .some((representationId) => {
        const representation = api.GetLine(
          modelId,
          representationId,
          false,
        );
        return referenceIds(representation?.Items)
          .some((itemId) => mappedItemIdSet.has(itemId));
      });
    if (usesMappedItem) {
      productsUsingMappedItems += 1;
    }
  }
  return {
    representationMaps: representationMapIds.length,
    mappedItems: mappedItemIds.length,
    productsUsingMappedItems,
    distinctMappingSources: mappingSources.size,
  };
}

function semanticSnapshot(api, modelId) {
  const entityCounts = countEntities(api, modelId, ENTITY_TYPES);
  const relations = countEntities(api, modelId, RELATION_TYPES);
  const rootIds = entityIds(api, modelId, WebIFC.IFCROOT, true);
  const globalIds = rootIds.map((id) => {
    const line = api.GetLine(modelId, id, false);
    return textValue(line?.GlobalId);
  });
  const presentIds = globalIds.filter(Boolean);
  const duplicates = presentIds.length - new Set(presentIds).size;

  const spatialHierarchy = [
    WebIFC.IFCPROJECT,
    WebIFC.IFCSITE,
    WebIFC.IFCBUILDING,
    WebIFC.IFCBUILDINGSTOREY,
  ].map((type) => textValue(firstLine(api, modelId, type)?.Name));

  const wallId = entityIds(api, modelId, WebIFC.IFCWALL)[0];
  const wall = Number.isSafeInteger(wallId)
    ? api.GetLine(modelId, wallId, false)
    : null;
  const typeRelation = Number.isSafeInteger(wallId)
    ? findRelationFor(
      api,
      modelId,
      WebIFC.IFCRELDEFINESBYTYPE,
      "RelatedObjects",
      wallId,
    )
    : null;
  const wallType = relatedLine(
    api,
    modelId,
    typeRelation,
    "RelatingType",
  );
  const materialRelation = Number.isSafeInteger(wallId)
    ? findRelationFor(
      api,
      modelId,
      WebIFC.IFCRELASSOCIATESMATERIAL,
      "RelatedObjects",
      wallId,
    )
    : null;
  const material = relatedLine(
    api,
    modelId,
    materialRelation,
    "RelatingMaterial",
  );

  return {
    semantics: {
      entityCounts,
      globalIds: {
        count: presentIds.length,
        duplicates,
        missingOnIfcRoot: globalIds.length - presentIds.length,
      },
      expressIds: expressIdDiagnostics(api, modelId, rootIds),
      spatialHierarchy,
      wall: {
        name: textValue(wall?.Name),
        tag: textValue(wall?.Tag),
        type: textValue(wallType?.Name),
        materials: [textValue(material?.Name)].filter(Boolean),
        propertySets: Number.isSafeInteger(wallId)
          ? propertySetNames(api, modelId, wallId, wallType)
          : [],
        quantities: Number.isSafeInteger(wallId)
          ? quantityValues(api, modelId, wallId)
          : {},
        classifications: Number.isSafeInteger(wallId)
          ? classifications(api, modelId, wallId)
          : [],
      },
    },
    relations,
  };
}

function geometrySnapshot(api, modelId) {
  let products = 0;
  let geometries = 0;
  let vertices = 0;
  let triangles = 0;
  const minimum = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const maximum = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const instances = [];
  const round = (value) => Number(value.toFixed(6));
  api.StreamAllMeshes(modelId, (mesh) => {
    products += 1;
    let instanceTriangles = 0;
    const instanceMinimum = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    const instanceMaximum = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (
      let index = 0;
      index < mesh.geometries.size();
      index += 1
    ) {
      const placedGeometry = mesh.geometries.get(index);
      const geometry = api.GetGeometry(
        modelId,
        placedGeometry.geometryExpressID,
      );
      try {
        const vertexData = api.GetVertexArray(
          geometry.GetVertexData(),
          geometry.GetVertexDataSize(),
        );
        const indexData = api.GetIndexArray(
          geometry.GetIndexData(),
          geometry.GetIndexDataSize(),
        );
        geometries += 1;
        vertices += Math.floor(vertexData.length / 6);
        const geometryTriangles = Math.floor(indexData.length / 3);
        triangles += geometryTriangles;
        instanceTriangles += geometryTriangles;
        const transform = placedGeometry.flatTransformation;
        for (
          let vertexIndex = 0;
          vertexIndex < vertexData.length;
          vertexIndex += 6
        ) {
          const x = vertexData[vertexIndex];
          const y = vertexData[vertexIndex + 1];
          const z = vertexData[vertexIndex + 2];
          const webX =
            transform[0] * x +
            transform[4] * y +
            transform[8] * z +
            transform[12];
          const webY =
            transform[1] * x +
            transform[5] * y +
            transform[9] * z +
            transform[13];
          const webZ =
            transform[2] * x +
            transform[6] * y +
            transform[10] * z +
            transform[14];
          const ifcWorld = [webX, -webZ, webY];
          for (let axis = 0; axis < 3; axis += 1) {
            minimum[axis] = Math.min(minimum[axis], ifcWorld[axis]);
            maximum[axis] = Math.max(maximum[axis], ifcWorld[axis]);
            instanceMinimum[axis] = Math.min(
              instanceMinimum[axis],
              ifcWorld[axis],
            );
            instanceMaximum[axis] = Math.max(
              instanceMaximum[axis],
              ifcWorld[axis],
            );
          }
        }
      } finally {
        geometry.delete();
      }
    }
    const product = api.GetLine(modelId, mesh.expressID, false);
    instances.push({
      globalId: textValue(product?.GlobalId),
      expressId: mesh.expressID,
      triangles: instanceTriangles,
      bounds: {
        min: instanceMinimum.map(round),
        max: instanceMaximum.map(round),
      },
    });
  });
  return {
    products,
    geometries,
    vertices,
    triangles,
    coordinateSystem: "ifc-world-z-up",
    bounds: {
      min: minimum.map(round),
      max: maximum.map(round),
    },
    instances: instances.sort(
      (left, right) => left.expressId - right.expressId,
    ),
  };
}

function capabilities(semantics, sharing) {
  const result = Object.fromEntries(
    CAPABILITY_NAMES.map((name) => [name, "blocked"]),
  );
  Object.assign(result, {
    parse: "native",
    semanticIndex: "mapped",
    geometry: "native",
    placements: "mapped",
    identity: "native",
    typeOccurrence: "mapped",
    propertySets: "mapped",
    materials: "mapped",
    relations: "mapped",
    packagingMacos: process.platform === "darwin" ? "native" : "blocked",
    packagingLinux: process.platform === "linux" ? "native" : "blocked",
  });
  if (Object.keys(semantics.wall.quantities).length > 0) {
    result.quantities = "mapped";
  }
  if (semantics.wall.classifications.length > 0) {
    result.classifications = "mapped";
  }
  if (
    sharing.representationMaps > 0 &&
    sharing.mappedItems > 0 &&
    sharing.productsUsingMappedItems > 0
  ) {
    result.mappedRepresentations = "mapped";
  }
  if (
    sharing.mappedItems > sharing.distinctMappingSources &&
    sharing.productsUsingMappedItems > 1
  ) {
    result.sharedGeometryInstances = "mapped";
  }
  return result;
}

export async function inspectWebIfc(
  input,
  fixtureId = "synthetic-small-ifc4",
) {
  const totalStarted = performance.now();
  const bytes = await readFile(input);
  const sourceDigest = createHash("sha256").update(bytes).digest("hex");
  const api = new WebIFC.IfcAPI();
  let engineInitialized = false;
  let modelId = null;
  let modelOpened = false;
  let modelClosed = false;
  let engineDisposed = false;
  let failurePhase = "engine-initialization";
  let inspectionFailed = false;
  let report;
  let initializationMs = 0;

  try {
    const initializationStarted = performance.now();
    await api.Init();
    engineInitialized = true;
    initializationMs = performance.now() - initializationStarted;

    failurePhase = "model-open";
    const openStarted = performance.now();
    modelId = api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: false,
    });
    modelOpened = true;
    const openMs = performance.now() - openStarted;

    failurePhase = "semantic-index";
    const semanticStarted = performance.now();
    const semantic = semanticSnapshot(api, modelId);
    if (semantic.semantics.entityCounts.IfcProject === 0) {
      throw new Error("IFC source has no project root");
    }
    const sharing = representationSharing(api, modelId);
    const semanticMs = performance.now() - semanticStarted;

    failurePhase = "geometry";
    const geometryStarted = performance.now();
    const geometry = geometrySnapshot(api, modelId);
    const geometryMs = performance.now() - geometryStarted;

    failurePhase = "report-validation";
    report = {
      schema: REPORT_SCHEMA,
      engine: {
        id: "web-ifc",
        version: "0.0.77",
        backend: "node-wasm-process",
        license: "MPL-2.0",
      },
      fixture: {
        id: fixtureId,
        schema: api.GetModelSchema(modelId),
        view: "ReferenceView_V1.2",
        byteLength: bytes.byteLength,
        sha256: sourceDigest,
      },
      capabilities: capabilities(semantic.semantics, sharing),
      ...semantic,
      representationSharing: sharing,
      geometry,
      performance: {
        initializationMs,
        openMs,
        semanticMs,
        geometryMs,
        totalMs: performance.now() - totalStarted,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        heapUsedBytes: process.memoryUsage().heapUsed,
      },
      cleanup: {
        modelClosed: false,
        engineDisposed: false,
      },
      diagnostics: [],
    };
  } catch {
    inspectionFailed = true;
  } finally {
    if (modelId !== null) {
      try {
        api.CloseModel(modelId);
        modelClosed = true;
      } catch {
        modelClosed = false;
      }
    }
    if (engineInitialized) {
      try {
        api.Dispose();
        engineDisposed = true;
      } catch {
        engineDisposed = false;
      }
    }
  }

  const rejectionReceipt = () => ({
    schema: WEB_IFC_NEGATIVE_RESULT_SCHEMA,
    status: "rejected",
    engine: {
      id: "web-ifc",
      version: "0.0.77",
      backend: "node-wasm-process",
      license: "MPL-2.0",
    },
    fixture: {
      id: fixtureId,
      byteLength: bytes.byteLength,
      sha256: sourceDigest,
    },
    failure: {
      code: "IFC_INPUT_REJECTED",
      phase: failurePhase,
    },
    cleanup: {
      strategy: "explicit-api",
      engineInitialized,
      modelOpened,
      modelClosed,
      engineDisposed,
      processExitRequired: false,
    },
    diagnostics: [
      {
        code: "IFC_INPUT_REJECTED",
      },
    ],
  });

  if (inspectionFailed) {
    throw new WebIfcInspectionError(rejectionReceipt());
  }

  report.cleanup = {
    modelClosed,
    engineDisposed,
  };
  try {
    return finalizeReport(report);
  } catch {
    throw new WebIfcInspectionError(rejectionReceipt());
  }
}

async function main() {
  const options = parseInputArguments(process.argv.slice(2));
  const report = await inspectWebIfc(options.input, options.fixtureId);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

async function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return await realpath(path.resolve(process.argv[1])) ===
      await realpath(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (await isMainModule()) {
  await main();
}
